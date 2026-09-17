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
	// Pools/Bouts (спека 0040) — nil: Get не участвует в гейте на удаление
	// номинации, только читает её сведения.
	return &FighterNominationProvider{svc: nomservice.New(r, tournaments, nil, nil)}
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

// NominationsByTournament возвращает номинации турнира — индекс названий для
// импорта ростера из файла (спека 0049, FR-5). Через List модуля nomination,
// а не запросом в его схему.
func (p *FighterNominationProvider) NominationsByTournament(
	ctx context.Context,
	tournamentID string,
) ([]fighterdomain.NominationRef, error) {
	noms, err := p.svc.List(ctx, tournamentID)
	if err != nil {
		return nil, err
	}
	refs := make([]fighterdomain.NominationRef, 0, len(noms))
	for _, n := range noms {
		refs = append(refs, fighterdomain.NominationRef{ID: n.ID, Title: n.Title})
	}
	return refs, nil
}
