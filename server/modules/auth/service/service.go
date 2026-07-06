// Package service содержит бизнес-логику модуля auth (юзкейсы).
package service

import (
	"context"
	"fmt"
	"strings"

	"github.com/hema/server/modules/auth/domain"
	"github.com/hema/server/pkg/crypto"
	"github.com/hema/server/pkg/jwt"
)

// Service реализует юзкейсы аутентификации. Зависит от портов, не от pg/proto.
type Service struct {
	repo   domain.Repository
	tokens *jwt.Manager
}

// New создаёт сервис auth.
func New(repo domain.Repository, tokens *jwt.Manager) *Service {
	return &Service{repo: repo, tokens: tokens}
}

// Register создаёт пользователя, хеширует пароль и выпускает токены.
func (s *Service) Register(ctx context.Context, email, password, displayName string) (domain.User, jwt.Pair, error) {
	email = normalizeEmail(email)
	if email == "" || password == "" {
		return domain.User{}, jwt.Pair{}, domain.ErrInvalidCredentials
	}

	hash, err := crypto.HashPassword(password)
	if err != nil {
		return domain.User{}, jwt.Pair{}, fmt.Errorf("hash password: %w", err)
	}

	user, err := s.repo.CreateUser(ctx, domain.NewUser{
		Email:        email,
		PasswordHash: hash,
		DisplayName:  displayName,
	})
	if err != nil {
		return domain.User{}, jwt.Pair{}, err
	}

	pair, err := s.tokens.Issue(user.ID)
	if err != nil {
		return domain.User{}, jwt.Pair{}, fmt.Errorf("issue tokens: %w", err)
	}
	return user, pair, nil
}

// Login проверяет учётные данные и выпускает токены.
func (s *Service) Login(ctx context.Context, email, password string) (domain.User, jwt.Pair, error) {
	email = normalizeEmail(email)

	user, hash, err := s.repo.GetCredentialsByEmail(ctx, email)
	if err != nil {
		// Не раскрываем, существует ли пользователь.
		return domain.User{}, jwt.Pair{}, domain.ErrInvalidCredentials
	}

	ok, err := crypto.VerifyPassword(password, hash)
	if err != nil || !ok {
		return domain.User{}, jwt.Pair{}, domain.ErrInvalidCredentials
	}

	pair, err := s.tokens.Issue(user.ID)
	if err != nil {
		return domain.User{}, jwt.Pair{}, fmt.Errorf("issue tokens: %w", err)
	}
	return user, pair, nil
}

// Refresh обменивает валидный refresh-токен на новую пару токенов.
func (s *Service) Refresh(ctx context.Context, refreshToken string) (jwt.Pair, error) {
	claims, err := s.tokens.ParseRefresh(refreshToken)
	if err != nil {
		return jwt.Pair{}, domain.ErrInvalidCredentials
	}
	// Убеждаемся, что пользователь ещё существует.
	if _, err := s.repo.GetUserByID(ctx, claims.UserID); err != nil {
		return jwt.Pair{}, domain.ErrInvalidCredentials
	}
	pair, err := s.tokens.Issue(claims.UserID)
	if err != nil {
		return jwt.Pair{}, fmt.Errorf("issue tokens: %w", err)
	}
	return pair, nil
}

// Me возвращает пользователя по валидному access-токену.
func (s *Service) Me(ctx context.Context, accessToken string) (domain.User, error) {
	claims, err := s.tokens.ParseAccess(accessToken)
	if err != nil {
		return domain.User{}, domain.ErrInvalidCredentials
	}
	return s.repo.GetUserByID(ctx, claims.UserID)
}

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}
