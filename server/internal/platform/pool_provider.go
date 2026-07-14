package platform

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	fighterrepo "github.com/hema/server/modules/fighter/repo"
	fighterservice "github.com/hema/server/modules/fighter/service"
	pooldomain "github.com/hema/server/modules/pool/domain"
)

// PoolActiveFightersProvider адаптирует fighter-сервис к порту
// pool/domain.ActiveFightersProvider (межмодульная зависимость через API
// модуля fighter, а не через прямой доступ к его PG-схеме, ADR 0002).
// Направление зависимости — только pool → fighter.
type PoolActiveFightersProvider struct {
	svc *fighterservice.Service
}

// NewPoolActiveFightersProvider создаёт адаптер поверх пула соединений.
// ActiveFightersByNomination не использует NominationProvider/
// ActiveTournamentProvider fighter-сервиса — оба порта можно не передавать.
func NewPoolActiveFightersProvider(pool *pgxpool.Pool) *PoolActiveFightersProvider {
	r := fighterrepo.New(pool)
	return &PoolActiveFightersProvider{svc: fighterservice.New(r, nil, nil)}
}

var _ pooldomain.ActiveFightersProvider = (*PoolActiveFightersProvider)(nil)

// ActiveFightersByNomination возвращает бойцов «в составе» номинации.
func (p *PoolActiveFightersProvider) ActiveFightersByNomination(ctx context.Context, nominationID string) ([]pooldomain.FighterRef, error) {
	refs, err := p.svc.ActiveFightersByNomination(ctx, nominationID)
	if err != nil {
		return nil, err
	}
	out := make([]pooldomain.FighterRef, len(refs))
	for i, r := range refs {
		out[i] = pooldomain.FighterRef{ID: r.ID, Name: r.Name, Club: r.Club}
	}
	return out, nil
}
