package platform

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	arenadomain "github.com/hema/server/modules/arena/domain"
	arenarepo "github.com/hema/server/modules/arena/repo"
	arenaservice "github.com/hema/server/modules/arena/service"
	pooldomain "github.com/hema/server/modules/pool/domain"
)

// PoolArenaProvider адаптирует arena-сервис к порту pool/domain.ArenaProvider
// (межмодульная зависимость через API модуля arena, а не через прямой доступ
// к его PG-схеме, ADR 0002). Направление зависимости — только pool → arena
// (спека 0011, план «Обзор решения»).
type PoolArenaProvider struct {
	svc *arenaservice.Service
}

// NewPoolArenaProvider создаёт адаптер поверх пула соединений. arena-сервису
// нужен ActiveTournamentProvider для собственных операций (Create/List/
// Reorder), но ArenaByID/ArenasByIDs его не используют — резолв по чистому
// id, без привязки к активному турниру (площадка уже создана и известна).
func NewPoolArenaProvider(pool *pgxpool.Pool, tournaments arenadomain.ActiveTournamentProvider) *PoolArenaProvider {
	r := arenarepo.New(pool)
	return &PoolArenaProvider{svc: arenaservice.New(r, tournaments)}
}

var _ pooldomain.ArenaProvider = (*PoolArenaProvider)(nil)

// ArenaByID возвращает площадку по id для валидации постановки (активна ли,
// спека 0011 FR-7/FR-9). Любая ошибка (в т.ч. «не найдена») мапится в
// domain.ErrArenaNotAvailable уровнем service модуля pool — здесь
// прокидывается как есть.
func (p *PoolArenaProvider) ArenaByID(ctx context.Context, id string) (pooldomain.ArenaRef, error) {
	a, err := p.svc.Get(ctx, id)
	if err != nil {
		return pooldomain.ArenaRef{}, err
	}
	return toPoolArenaRef(a), nil
}

// ArenasByIDs — батч-резолв имён площадок (для обогащения списков пулов,
// ListPublicPools/GetPoolsForArena). Отсутствующие/ошибочные id просто не
// попадают в карту (arena-сервис не даёт батч-чтения по списку id —
// последовательные Get по уже дедуплицированному списку, см.
// service.resolveArenaNames в pool).
func (p *PoolArenaProvider) ArenasByIDs(ctx context.Context, ids []string) (map[string]pooldomain.ArenaRef, error) {
	out := make(map[string]pooldomain.ArenaRef, len(ids))
	for _, id := range ids {
		a, err := p.svc.Get(ctx, id)
		if err != nil {
			continue
		}
		out[id] = toPoolArenaRef(a)
	}
	return out, nil
}

func toPoolArenaRef(a arenadomain.Arena) pooldomain.ArenaRef {
	return pooldomain.ArenaRef{
		ID:     a.ID,
		Name:   a.Name,
		Active: a.Status == arenadomain.StatusActive,
	}
}
