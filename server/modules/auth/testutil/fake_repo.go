// Package testutil содержит test doubles (fake-реализации портов) модуля auth.
// Используется юнит-тестами service и e2e-тестами api-хендлеров.
package testutil

import (
	"context"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/hema/server/modules/auth/domain"
)

// FakeRepo — in-memory реализация domain.Repository для тестов.
// Потокобезопасна (мьютекс на map). Не сохраняет данные между запусками.
type FakeRepo struct {
	mu    sync.Mutex
	users map[string]storedUser // key: email (lowercased)
}

type storedUser struct {
	user         domain.User
	passwordHash string
}

// NewFakeRepo создаёт пустой fake-репозиторий.
func NewFakeRepo() *FakeRepo {
	return &FakeRepo{users: make(map[string]storedUser)}
}

var _ domain.Repository = (*FakeRepo)(nil)

// CreateUser вставляет пользователя. При конфликте email → domain.ErrUserExists.
func (r *FakeRepo) CreateUser(_ context.Context, u domain.NewUser) (domain.User, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, ok := r.users[u.Email]; ok {
		return domain.User{}, domain.ErrUserExists
	}

	user := domain.User{
		ID:          uuid.NewString(),
		Email:       u.Email,
		DisplayName: u.DisplayName,
		CreatedAt:   time.Now().UTC(),
	}
	r.users[u.Email] = storedUser{user: user, passwordHash: u.PasswordHash}
	return user, nil
}

// GetCredentialsByEmail возвращает пользователя и хеш пароля по email.
func (r *FakeRepo) GetCredentialsByEmail(_ context.Context, email string) (domain.User, string, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	su, ok := r.users[email]
	if !ok {
		return domain.User{}, "", domain.ErrUserNotFound
	}
	return su.user, su.passwordHash, nil
}

// GetUserByID возвращает пользователя по идентификатору.
func (r *FakeRepo) GetUserByID(_ context.Context, id string) (domain.User, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, su := range r.users {
		if su.user.ID == id {
			return su.user, nil
		}
	}
	return domain.User{}, domain.ErrUserNotFound
}
