package platform

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	fighterrepo "github.com/hema/server/modules/fighter/repo"
	fighterservice "github.com/hema/server/modules/fighter/service"
	stagedomain "github.com/hema/server/modules/stage/domain"
)

// StageActiveFightersProvider адаптирует fighter-сервис к порту
// stage/domain.ActiveFightersProvider (межмодульная зависимость через API
// модуля fighter, а не через прямой доступ к его PG-схеме, ADR 0002).
// Направление зависимости — только stage → fighter.
type StageActiveFightersProvider struct {
	svc *fighterservice.Service
}

// NewStageActiveFightersProvider создаёт адаптер поверх пула соединений.
// ActiveFightersByNomination не использует NominationProvider/
// ActiveTournamentProvider fighter-сервиса — оба порта можно не передавать.
func NewStageActiveFightersProvider(pool *pgxpool.Pool) *StageActiveFightersProvider {
	r := fighterrepo.New(pool)
	return &StageActiveFightersProvider{svc: fighterservice.New(r, nil, nil)}
}

var _ stagedomain.ActiveFightersProvider = (*StageActiveFightersProvider)(nil)

// ActiveFightersByNomination возвращает бойцов «в составе» номинации.
func (p *StageActiveFightersProvider) ActiveFightersByNomination(ctx context.Context, nominationID string) ([]stagedomain.FighterRef, error) {
	refs, err := p.svc.ActiveFightersByNomination(ctx, nominationID)
	if err != nil {
		return nil, err
	}
	out := make([]stagedomain.FighterRef, len(refs))
	for i, r := range refs {
		out[i] = stagedomain.FighterRef{ID: r.ID, Name: r.Name, Club: r.Club}
	}
	return out, nil
}
