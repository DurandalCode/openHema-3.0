package service

import (
	"context"
	"strings"

	"github.com/hema/server/modules/fighter/domain"
)

// MyFighter возвращает бойца текущего пользователя в турнире (спека 0038,
// ADR 0016: только владелец, только чтение). Пустой tournamentID резолвится
// в активный турнир — тот же приём, что ListRoster.
func (s *Service) MyFighter(ctx context.Context, userID, tournamentID string) (domain.Fighter, error) {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return domain.Fighter{}, domain.ErrInvalidInput
	}

	tournamentID = strings.TrimSpace(tournamentID)
	if tournamentID == "" {
		activeID, err := s.tournaments.ActiveTournamentID(ctx)
		if err != nil {
			return domain.Fighter{}, domain.ErrNotFound
		}
		tournamentID = activeID
	}

	return s.repo.FindByOrigin(ctx, tournamentID, userID)
}
