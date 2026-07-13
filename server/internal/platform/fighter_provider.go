package platform

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5/pgxpool"

	fighterdomain "github.com/hema/server/modules/fighter/domain"
	nomdomain "github.com/hema/server/modules/nomination/domain"
	nomrepo "github.com/hema/server/modules/nomination/repo"
	nomservice "github.com/hema/server/modules/nomination/service"
)

// FighterNominationProvider адаптирует nomination-сервис к порту
// fighter/domain.NominationProvider (межмодульная зависимость через API
// модуля nomination, а не через прямой доступ к его PG-схеме, ADR 0002).
type FighterNominationProvider struct {
	svc *nomservice.Service
}

// NewFighterNominationProvider создаёт адаптер поверх пула соединений.
func NewFighterNominationProvider(pool *pgxpool.Pool, tournaments nomdomain.ActiveTournamentProvider) *FighterNominationProvider {
	r := nomrepo.New(pool)
	return &FighterNominationProvider{svc: nomservice.New(r, tournaments)}
}

// Nomination резолвит сведения о номинации, нужные модулю fighter.
func (p *FighterNominationProvider) Nomination(ctx context.Context, nominationID string) (fighterdomain.NominationInfo, error) {
	n, err := p.svc.Get(ctx, nominationID)
	if err != nil {
		if errors.Is(err, nomdomain.ErrNotFound) {
			return fighterdomain.NominationInfo{}, fighterdomain.ErrNominationNotFound
		}
		return fighterdomain.NominationInfo{}, err
	}
	return fighterdomain.NominationInfo{TournamentID: n.TournamentID}, nil
}
