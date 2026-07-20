package platform

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5/pgxpool"

	appdomain "github.com/hema/server/modules/application/domain"
	nomdomain "github.com/hema/server/modules/nomination/domain"
	nomrepo "github.com/hema/server/modules/nomination/repo"
	nomservice "github.com/hema/server/modules/nomination/service"
)

// NominationInfoProvider адаптирует nomination-сервис к порту
// application/domain.NominationProvider (межмодульная зависимость через API
// модуля nomination, а не через прямой доступ к его PG-схеме, ADR 0002).
// Экспортирован, чтобы integration-тесты модуля application могли собрать ту
// же композицию, что и прод, без дублирования wiring-логики.
type NominationInfoProvider struct {
	svc *nomservice.Service
}

// NewNominationInfoProvider создаёт адаптер поверх пула соединений.
func NewNominationInfoProvider(pool *pgxpool.Pool, tournaments nomdomain.ActiveTournamentProvider) *NominationInfoProvider {
	r := nomrepo.New(pool)
	return &NominationInfoProvider{svc: nomservice.New(r, tournaments)}
}

// Nomination резолвит сведения о номинации, нужные модулю application.
func (p *NominationInfoProvider) Nomination(ctx context.Context, nominationID string) (appdomain.NominationInfo, error) {
	n, err := p.svc.Get(ctx, nominationID)
	if err != nil {
		if errors.Is(err, nomdomain.ErrNotFound) {
			return appdomain.NominationInfo{}, appdomain.ErrNominationNotFound
		}
		return appdomain.NominationInfo{}, err
	}
	info := appdomain.NominationInfo{
		TournamentID:     n.TournamentID,
		RegistrationOpen: n.Status == nomdomain.StatusOpen,
	}
	if n.HasFighterCapacity {
		capacity := n.FighterCapacity
		info.FighterCapacity = &capacity
	}
	return info, nil
}
