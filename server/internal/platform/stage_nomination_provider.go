package platform

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	nomdomain "github.com/hema/server/modules/nomination/domain"
	nomrepo "github.com/hema/server/modules/nomination/repo"
	nomservice "github.com/hema/server/modules/nomination/service"
	stagedomain "github.com/hema/server/modules/stage/domain"
)

// StageNominationProvider адаптирует nomination-сервис к порту
// stage/domain.NominationProvider (межмодульная зависимость через API модуля
// nomination, а не через прямой доступ к его PG-схеме, ADR 0002).
// Направление зависимости — только stage → nomination. Used для резолва
// имени номинации пула на экране арены (FR-9: список «готовых пулов для
// постановки» собран из разных номинаций — без имени они неразличимы).
type StageNominationProvider struct {
	svc *nomservice.Service
}

// NewStageNominationProvider создаёт адаптер поверх пула соединений.
// nomination-сервису нужен ActiveTournamentProvider для собственных
// mutating-операций (Create/Update/Reorder), но Get/List — нет; однако
// конструктор единый, передаём как есть.
func NewStageNominationProvider(pool *pgxpool.Pool, tournaments nomdomain.ActiveTournamentProvider) *StageNominationProvider {
	r := nomrepo.New(pool)
	// Pools/Bouts (спека 0040) — nil: Get/List/Sync* не участвуют в гейте на
	// удаление номинации.
	return &StageNominationProvider{svc: nomservice.New(r, tournaments, nil, nil)}
}

var _ stagedomain.NominationProvider = (*StageNominationProvider)(nil)

// NominationsByIDs — батч-резолв названий номинаций (для обогащения пулов
// именем номинации, спека 0011 FR-9). nomination-сервис не даёт батч-чтения
// по списку id — последовательные Get по уже дедуплицированному списку
// (повторяет resolveArenaNames в stage). Отсутствующие/ошибочные id просто
// не попадают в карту.
func (p *StageNominationProvider) NominationsByIDs(ctx context.Context, ids []string) (map[string]stagedomain.NominationRef, error) {
	out := make(map[string]stagedomain.NominationRef, len(ids))
	for _, id := range ids {
		n, err := p.svc.Get(ctx, id)
		if err != nil {
			continue
		}
		out[id] = stagedomain.NominationRef{ID: n.ID, Title: n.Title}
	}
	return out, nil
}

// NominationsByTournament возвращает номинации турнира с их позицией
// (спека 0034, FR-20) — для сайдбара публичной сводки турнира. tournamentID
// обязателен и валидируется тем же nomination.Service.List
// (resolveTournament: должен указывать на активный турнир, MVP) — порт
// stage/domain не дублирует эту проверку (см. plan.md 0034, T6).
func (p *StageNominationProvider) NominationsByTournament(ctx context.Context, tournamentID string) ([]stagedomain.NominationRef, error) {
	noms, err := p.svc.List(ctx, tournamentID)
	if err != nil {
		return nil, err
	}
	out := make([]stagedomain.NominationRef, len(noms))
	for i, n := range noms {
		out[i] = stagedomain.NominationRef{ID: n.ID, Title: n.Title, Position: int(n.Position)}
	}
	return out, nil
}

// SyncNominationState синхронизирует обе оси состояния номинации — приём
// заявок (спека 0012, FR-10) и исполнительную (спека 0021, FR-4/FR-5) —
// прямыми Go-вызовами nomination-сервиса, без сетевого RPC (монолит).
func (p *StageNominationProvider) SyncNominationState(ctx context.Context, nominationID string, hasDistributedFighters bool, execution stagedomain.NominationExecution) error {
	if err := p.svc.SyncRegistrationState(ctx, nominationID, hasDistributedFighters); err != nil {
		return err
	}
	return p.svc.SyncExecutionState(ctx, nominationID, toNominationExecutionState(execution))
}

// toNominationExecutionState мапит исполнительную ось модуля stage
// (spec 0021) на одноимённый тип модуля nomination — оба порта определяют
// своё собственное перечисление (ADR 0002: модули не делят типы через
// границу), значения совпадают по смыслу, не по Go-идентичности.
func toNominationExecutionState(e stagedomain.NominationExecution) nomdomain.ExecutionState {
	switch e {
	case stagedomain.ExecutionActive:
		return nomdomain.ExecutionActive
	case stagedomain.ExecutionFinished:
		return nomdomain.ExecutionFinished
	default:
		return nomdomain.ExecutionNone
	}
}
