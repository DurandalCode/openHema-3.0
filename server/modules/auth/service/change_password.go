package service

import (
	"context"
	"fmt"

	"github.com/hema/server/modules/auth/domain"
	"github.com/hema/server/pkg/crypto"
	"github.com/hema/server/pkg/jwt"
)

// ChangePassword меняет пароль залогиненного пользователя, подтвердив
// текущий (AC-8/9). Возвращает новую пару токенов. FR-14 (спека 0042):
// смена пароля завершает все сессии пользователя, кроме той, из которой
// она была выполнена.
//
// currentSessionID — id сессии вызывающего запроса, если он известен
// api-слою (резолвится из refresh-токена текущего запроса — access-токен
// клейма sid не несёт, ADR 0018). Пустая строка или сессия, не
// принадлежащая этому пользователю, — api-слой не смог его определить:
// ChangePassword в этом случае заводит для ответа новую сессию, чтобы
// вызов в любом случае вернул рабочую пару токенов, и отзывает все
// остальные.
func (s *Service) ChangePassword(ctx context.Context, accessToken, currentPassword, newPassword, currentSessionID string) (jwt.Pair, error) {
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
	if err := s.repo.UpdatePassword(ctx, user.ID, newHash, s.now()); err != nil {
		return jwt.Pair{}, fmt.Errorf("update password: %w", err)
	}

	keepSessionID, err := s.resolveKeepSession(ctx, user, currentSessionID)
	if err != nil {
		return jwt.Pair{}, err
	}
	if _, err := s.repo.RevokeUserSessions(ctx, user.ID, keepSessionID, s.now()); err != nil {
		return jwt.Pair{}, fmt.Errorf("revoke user sessions: %w", err)
	}

	pair, err := s.tokens.Issue(user.ID, string(user.Role), keepSessionID)
	if err != nil {
		return jwt.Pair{}, fmt.Errorf("issue tokens: %w", err)
	}
	return pair, nil
}

// resolveKeepSession возвращает id сессии, которая должна пережить
// массовый отзыв в ChangePassword: переданную (если она существует и
// принадлежит этому пользователю) либо свежесозданную — так вызывающий
// запрос в любом случае получает рабочую пару токенов.
func (s *Service) resolveKeepSession(ctx context.Context, user domain.User, currentSessionID string) (string, error) {
	if currentSessionID != "" {
		session, err := s.repo.GetSession(ctx, currentSessionID)
		if err == nil && session.UserID == user.ID {
			if err := s.repo.TouchSession(ctx, session.ID, s.now()); err != nil {
				return "", fmt.Errorf("touch session: %w", err)
			}
			return session.ID, nil
		}
	}
	session, err := s.repo.CreateSession(ctx, domain.NewSession{
		UserID:    user.ID,
		ExpiresAt: s.now().Add(s.sessionTTL),
	})
	if err != nil {
		return "", fmt.Errorf("create session: %w", err)
	}
	return session.ID, nil
}
