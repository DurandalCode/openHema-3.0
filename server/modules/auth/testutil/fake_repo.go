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

	role := u.Role
	if role == "" {
		role = domain.RoleUser
	}

	user := domain.User{
		ID:          uuid.NewString(),
		Email:       u.Email,
		DisplayName: u.DisplayName,
		Role:        role,
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

// GetUsersByIDs возвращает пользователей по набору идентификаторов;
// неизвестные id просто отсутствуют в результате.
func (r *FakeRepo) GetUsersByIDs(_ context.Context, ids []string) ([]domain.User, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	want := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		want[id] = struct{}{}
	}

	out := make([]domain.User, 0, len(ids))
	for _, su := range r.users {
		if _, ok := want[su.user.ID]; ok {
			out = append(out, su.user)
		}
	}
	return out, nil
}

// CountAdmins возвращает количество пользователей с ролью admin.
func (r *FakeRepo) CountAdmins(_ context.Context) (int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	n := 0
	for _, su := range r.users {
		if su.user.Role == domain.RoleAdmin {
			n++
		}
	}
	return n, nil
}

// ListAdmins возвращает всех администраторов.
func (r *FakeRepo) ListAdmins(_ context.Context) ([]domain.User, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	out := make([]domain.User, 0)
	for _, su := range r.users {
		if su.user.Role == domain.RoleAdmin {
			out = append(out, su.user)
		}
	}
	return out, nil
}

// ListUsers возвращает пользователей с постраничной навигацией.
func (r *FakeRepo) ListUsers(_ context.Context, p domain.ListParams) ([]domain.User, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	all := make([]domain.User, 0, len(r.users))
	for _, su := range r.users {
		all = append(all, su.user)
	}

	if p.Offset >= int32(len(all)) {
		return []domain.User{}, nil
	}
	end := p.Offset + p.Limit
	if end > int32(len(all)) || p.Limit == 0 {
		end = int32(len(all))
	}
	return all[p.Offset:end], nil
}

// SetUserRole обновляет роль пользователя. Если пользователь не найден → ErrUserNotFound.
func (r *FakeRepo) SetUserRole(_ context.Context, id string, role domain.Role) (domain.User, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	for key, su := range r.users {
		if su.user.ID == id {
			su.user.Role = role
			r.users[key] = su
			return su.user, nil
		}
	}
	return domain.User{}, domain.ErrUserNotFound
}
