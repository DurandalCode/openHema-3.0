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
	return &StageNominationProvider{svc: nomservice.New(r, tournaments)}
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

// SyncRegistrationState синхронизирует статус приёма заявок номинации с
// фактом наличия распределённых бойцов (спека 0012, FR-10) — прямой Go-вызов
// nomination-сервиса, без сетевого RPC (монолит).
func (p *StageNominationProvider) SyncRegistrationState(ctx context.Context, nominationID string, hasDistributedFighters bool) error {
	return p.svc.SyncRegistrationState(ctx, nominationID, hasDistributedFighters)
}