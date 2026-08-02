package platform

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	arenadomain "github.com/hema/server/modules/arena/domain"
	arenarepo "github.com/hema/server/modules/arena/repo"
	arenaservice "github.com/hema/server/modules/arena/service"
	stagedomain "github.com/hema/server/modules/stage/domain"
)

// StageArenaProvider адаптирует arena-сервис к порту stage/domain.ArenaProvider
// (межмодульная зависимость через API модуля arena, а не через прямой доступ
// к его PG-схеме, ADR 0002). Направление зависимости — только stage → arena
// (спека 0011, план «Обзор решения»).
type StageArenaProvider struct {
	svc *arenaservice.Service
}

// NewStageArenaProvider создаёт адаптер поверх пула соединений. arena-сервису
// нужен ActiveTournamentProvider для собственных операций (Create/List/
// Reorder), но ArenaByID/ArenasByIDs его не используют — резолв по чистому
// id, без привязки к активному турниру (площадка уже создана и известна).
func NewStageArenaProvider(pool *pgxpool.Pool, tournaments arenadomain.ActiveTournamentProvider) *StageArenaProvider {
	r := arenarepo.New(pool)
	return &StageArenaProvider{svc: arenaservice.New(r, tournaments)}
}

var _ stagedomain.ArenaProvider = (*StageArenaProvider)(nil)

// ArenaByID возвращает площадку по id для валидации постановки (активна ли,
// спека 0011 FR-7/FR-9). Любая ошибка (в т.ч. «не найдена») мапится в
// domain.ErrArenaNotAvailable уровнем service модуля stage — здесь
// прокидывается как есть.
func (p *StageArenaProvider) ArenaByID(ctx context.Context, id string) (stagedomain.ArenaRef, error) {
	a, err := p.svc.Get(ctx, id)
	if err != nil {
		return stagedomain.ArenaRef{}, err
	}
	return toPoolArenaRef(a), nil
}

// ArenasByIDs — батч-резолв имён площадок (для обогащения списков пулов,
// ListPublicPools/GetPoolsForArena). Отсутствующие/ошибочные id просто не
// попадают в карту (arena-сервис не даёт батч-чтения по списку id —
// последовательные Get по уже дедуплицированному списку, см.
// service.resolveArenaNames в stage).
func (p *StageArenaProvider) ArenasByIDs(ctx context.Context, ids []string) (map[string]stagedomain.ArenaRef, error) {
	out := make(map[string]stagedomain.ArenaRef, len(ids))
	for _, id := range ids {
		a, err := p.svc.Get(ctx, id)
		if err != nil {
			continue
		}
		out[id] = toPoolArenaRef(a)
	}
	return out, nil
}

// DefaultDurationSeconds возвращает дефолтную длительность боя арены (спека
// 0015, FR-8) — недоменная настройка табло, читается через тот же
// arena-сервис, что ArenaByID.
func (p *StageArenaProvider) DefaultDurationSeconds(ctx context.Context, arenaID string) (int, error) {
	a, err := p.svc.Get(ctx, arenaID)
	if err != nil {
		return 0, err
	}
	return int(a.DefaultDurationSeconds), nil
}

func toPoolArenaRef(a arenadomain.Arena) stagedomain.ArenaRef {
	return stagedomain.ArenaRef{
		ID:     a.ID,
		Name:   a.Name,
		Active: a.Status == arenadomain.StatusActive,
	}
}
