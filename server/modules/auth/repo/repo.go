// Package repo реализует domain.Repository поверх сгенерированного sqlc-кода.
package repo

import (
	"context"
	"errors"
	"time"

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

// GetUsersByIDs возвращает пользователей по набору идентификаторов;
// нераспознаваемые (не-UUID) id пропускаются, а не считаются ошибкой.
func (r *Repo) GetUsersByIDs(ctx context.Context, ids []string) ([]domain.User, error) {
	uids := make([]uuid.UUID, 0, len(ids))
	for _, id := range ids {
		uid, err := uuid.Parse(id)
		if err != nil {
			continue
		}
		uids = append(uids, uid)
	}
	if len(uids) == 0 {
		return nil, nil
	}
	rows, err := r.q.GetUsersByIDs(ctx, uids)
	if err != nil {
		return nil, err
	}
	out := make([]domain.User, 0, len(rows))
	for _, row := range rows {
		out = append(out, toDomain(row))
	}
	return out, nil
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

// UpdatePassword заменяет хеш пароля и ставит password_changed_at в
// переданное значение (не now() на стороне PG — см. domain.Repository).
func (r *Repo) UpdatePassword(ctx context.Context, userID, passwordHash string, changedAt time.Time) error {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return domain.ErrUserNotFound
	}
	return r.q.UpdateUserPassword(ctx, sqlc.UpdateUserPasswordParams{
		ID:                uid,
		PasswordHash:      passwordHash,
		PasswordChangedAt: changedAt,
	})
}

// UpdateProfile правит отображаемое имя и клуб пользователя.
func (r *Repo) UpdateProfile(ctx context.Context, userID, displayName, club string) (domain.User, error) {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return domain.User{}, domain.ErrUserNotFound
	}
	row, err := r.q.UpdateUserProfile(ctx, sqlc.UpdateUserProfileParams{
		ID:          uid,
		DisplayName: displayName,
		Club:        club,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.User{}, domain.ErrUserNotFound
		}
		return domain.User{}, err
	}
	return toDomain(row), nil
}

// CreateResetToken сохраняет новый токен восстановления (хеш, не сырой).
func (r *Repo) CreateResetToken(ctx context.Context, t domain.NewResetToken) (domain.ResetToken, error) {
	uid, err := uuid.Parse(t.UserID)
	if err != nil {
		return domain.ResetToken{}, domain.ErrUserNotFound
	}
	row, err := r.q.CreateResetToken(ctx, sqlc.CreateResetTokenParams{
		UserID:    uid,
		TokenHash: t.TokenHash,
		ExpiresAt: t.ExpiresAt,
	})
	if err != nil {
		return domain.ResetToken{}, err
	}
	return toDomainResetToken(row), nil
}

// LastResetTokenAt возвращает время выдачи последнего токена восстановления
// пользователя (в т.ч. погашенного). Нулевое время — токенов не было.
func (r *Repo) LastResetTokenAt(ctx context.Context, userID string) (time.Time, error) {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return time.Time{}, domain.ErrUserNotFound
	}
	return r.q.LastResetTokenAt(ctx, uid)
}

// InvalidateActiveResetTokens гасит все активные токены пользователя (FR-5).
func (r *Repo) InvalidateActiveResetTokens(ctx context.Context, userID string) error {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return domain.ErrUserNotFound
	}
	return r.q.InvalidateActiveResetTokens(ctx, uid)
}

// GetActiveResetToken ищет активный (не погашенный, не просроченный) токен
// по хешу. Не найден/просрочен/погашен → ErrInvalidResetToken.
func (r *Repo) GetActiveResetToken(ctx context.Context, tokenHash string) (domain.ResetToken, error) {
	row, err := r.q.GetActiveResetToken(ctx, tokenHash)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.ResetToken{}, domain.ErrInvalidResetToken
		}
		return domain.ResetToken{}, err
	}
	return toDomainResetToken(row), nil
}

// MarkResetTokenUsed погашает токен после успешной смены пароля (FR-4).
func (r *Repo) MarkResetTokenUsed(ctx context.Context, id string) error {
	uid, err := uuid.Parse(id)
	if err != nil {
		return domain.ErrInvalidResetToken
	}
	return r.q.MarkResetTokenUsed(ctx, uid)
}

func toDomain(u sqlc.AuthUser) domain.User {
	return domain.User{
		ID:                u.ID.String(),
		Email:             u.Email,
		DisplayName:       u.DisplayName,
		Role:              domain.Role(u.Role),
		CreatedAt:         u.CreatedAt,
		Club:              u.Club,
		PasswordChangedAt: u.PasswordChangedAt,
	}
}

func toDomainResetToken(t sqlc.AuthPasswordResetToken) domain.ResetToken {
	rt := domain.ResetToken{
		ID:        t.ID.String(),
		UserID:    t.UserID.String(),
		TokenHash: t.TokenHash,
		CreatedAt: t.CreatedAt,
		ExpiresAt: t.ExpiresAt,
	}
	if t.UsedAt.Valid {
		usedAt := t.UsedAt.Time
		rt.UsedAt = &usedAt
	}
	return rt
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "23505"
	}
	return false
}
