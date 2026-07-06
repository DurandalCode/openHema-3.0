// Package repo реализует domain.Repository поверх сгенерированного sqlc-кода.
package repo

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/hema/server/modules/auth/domain"
	"github.com/hema/server/modules/auth/repo/sqlc"
)

// Repo — адаптер к PostgreSQL для модуля auth.
type Repo struct {
	q *sqlc.Queries
}

// New создаёт репозиторий поверх пула соединений.
func New(pool *pgxpool.Pool) *Repo {
	return &Repo{q: sqlc.New(pool)}
}

var _ domain.Repository = (*Repo)(nil)

// CreateUser вставляет пользователя. При конфликте email → domain.ErrUserExists.
func (r *Repo) CreateUser(ctx context.Context, u domain.NewUser) (domain.User, error) {
	row, err := r.q.CreateUser(ctx, sqlc.CreateUserParams{
		Email:        u.Email,
		PasswordHash: u.PasswordHash,
		DisplayName:  u.DisplayName,
		Role:         string(u.Role),
	})
	if err != nil {
		if isUniqueViolation(err) {
			return domain.User{}, domain.ErrUserExists
		}
		return domain.User{}, err
	}
	return toDomain(row), nil
}

// GetCredentialsByEmail возвращает пользователя и хеш пароля по email.
func (r *Repo) GetCredentialsByEmail(ctx context.Context, email string) (domain.User, string, error) {
	row, err := r.q.GetUserByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.User{}, "", domain.ErrUserNotFound
		}
		return domain.User{}, "", err
	}
	return toDomain(row), row.PasswordHash, nil
}

// GetUserByID возвращает пользователя по идентификатору.
func (r *Repo) GetUserByID(ctx context.Context, id string) (domain.User, error) {
	uid, err := uuid.Parse(id)
	if err != nil {
		return domain.User{}, domain.ErrUserNotFound
	}
	row, err := r.q.GetUserByID(ctx, uid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.User{}, domain.ErrUserNotFound
		}
		return domain.User{}, err
	}
	return toDomain(row), nil
}

// CountAdmins возвращает количество пользователей с ролью admin.
func (r *Repo) CountAdmins(ctx context.Context) (int, error) {
	n, err := r.q.CountAdmins(ctx)
	return int(n), err
}

// ListAdmins возвращает всех администраторов.
func (r *Repo) ListAdmins(ctx context.Context) ([]domain.User, error) {
	rows, err := r.q.ListAdmins(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]domain.User, 0, len(rows))
	for _, row := range rows {
		out = append(out, toDomain(row))
	}
	return out, nil
}

// ListUsers возвращает пользователей с постраничной навигацией.
func (r *Repo) ListUsers(ctx context.Context, p domain.ListParams) ([]domain.User, error) {
	rows, err := r.q.ListUsers(ctx, sqlc.ListUsersParams{
		Limit:  p.Limit,
		Offset: p.Offset,
	})
	if err != nil {
		return nil, err
	}
	out := make([]domain.User, 0, len(rows))
	for _, row := range rows {
		out = append(out, toDomain(row))
	}
	return out, nil
}

// SetUserRole обновляет роль пользователя. Если пользователь не найден → ErrUserNotFound.
func (r *Repo) SetUserRole(ctx context.Context, id string, role domain.Role) (domain.User, error) {
	uid, err := uuid.Parse(id)
	if err != nil {
		return domain.User{}, domain.ErrUserNotFound
	}
	row, err := r.q.SetUserRole(ctx, sqlc.SetUserRoleParams{
		ID:   uid,
		Role: string(role),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.User{}, domain.ErrUserNotFound
		}
		return domain.User{}, err
	}
	return toDomain(row), nil
}

func toDomain(u sqlc.AuthUser) domain.User {
	return domain.User{
		ID:          u.ID.String(),
		Email:       u.Email,
		DisplayName: u.DisplayName,
		Role:        domain.Role(u.Role),
		CreatedAt:   u.CreatedAt,
	}
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "23505"
	}
	return false
}
