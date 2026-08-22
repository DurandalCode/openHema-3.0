package service

import (
	"context"
	"fmt"

	"github.com/hema/server/modules/auth/domain"
	"github.com/hema/server/pkg/crypto"
	"github.com/hema/server/pkg/jwt"
)

// ChangePassword меняет пароль залогиненного пользователя, подтвердив
// текущий (AC-8/9). Возвращает новую пару токенов: текущее устройство
// остаётся в системе (получает новую пару), но продление прежних refresh-
// токенов обрывается — см. проверку password_changed_at в Refresh
// (FR-12, спека 0037, решение 6).
func (s *Service) ChangePassword(ctx context.Context, accessToken, currentPassword, newPassword string) (jwt.Pair, error) {
	claims, err := s.tokens.ParseAccess(accessToken)
	if err != nil {
		return jwt.Pair{}, domain.ErrInvalidCredentials
	}
	user, err := s.repo.GetUserByID(ctx, claims.UserID)
	if err != nil {
		return jwt.Pair{}, domain.ErrInvalidCredentials
	}
	_, hash, err := s.repo.GetCredentialsByEmail(ctx, user.Email)
	if err != nil {
		return jwt.Pair{}, domain.ErrInvalidCredentials
	}
	ok, err := crypto.VerifyPassword(currentPassword, hash)
	if err != nil || !ok {
		return jwt.Pair{}, domain.ErrInvalidCredentials
	}

	if err := validatePassword(newPassword); err != nil {
		return jwt.Pair{}, err
	}
	newHash, err := crypto.HashPassword(newPassword)
	if err != nil {
		return jwt.Pair{}, fmt.Errorf("hash password: %w", err)
	}
	if err := s.repo.UpdatePassword(ctx, user.ID, newHash); err != nil {
		return jwt.Pair{}, fmt.Errorf("update password: %w", err)
	}

	pair, err := s.tokens.Issue(user.ID, string(user.Role))
	if err != nil {
		return jwt.Pair{}, fmt.Errorf("issue tokens: %w", err)
	}
	return pair, nil
}
