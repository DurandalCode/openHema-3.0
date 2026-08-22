package service

import (
	"context"
	"strings"

	"github.com/hema/server/modules/auth/domain"
)

// UpdateProfile правит отображаемое имя и клуб текущего пользователя
// (AC-12). Имя не может стать пустым (AC-13); клуб опционален — пустая
// строка означает «убрать клуб» (FR-15). Email и роль не меняются (FR-17).
func (s *Service) UpdateProfile(ctx context.Context, accessToken, displayName, club string) (domain.User, error) {
	claims, err := s.tokens.ParseAccess(accessToken)
	if err != nil {
		return domain.User{}, domain.ErrInvalidCredentials
	}

	displayName = strings.TrimSpace(displayName)
	club = strings.TrimSpace(club)
	if displayName == "" {
		return domain.User{}, domain.ErrInvalidProfile
	}

	return s.repo.UpdateProfile(ctx, claims.UserID, displayName, club)
}
