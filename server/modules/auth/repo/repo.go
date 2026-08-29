// Package repo реализует domain.Repository поверх сгенерированного sqlc-кода.
package repo

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
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

// MarkEmailVerified проставляет email_verified_at (FR-3).
func (r *Repo) MarkEmailVerified(ctx context.Context, userID string, at time.Time) error {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return domain.ErrUserNotFound
	}
	return r.q.MarkEmailVerified(ctx, sqlc.MarkEmailVerifiedParams{
		ID:              uid,
		EmailVerifiedAt: pgtype.Timestamptz{Time: at, Valid: true},
	})
}

// CreateEmailToken сохраняет новый токен подтверждения/смены адреса.
func (r *Repo) CreateEmailToken(ctx context.Context, t domain.NewEmailToken) (domain.EmailToken, error) {
	uid, err := uuid.Parse(t.UserID)
	if err != nil {
		return domain.EmailToken{}, domain.ErrUserNotFound
	}
	row, err := r.q.CreateEmailToken(ctx, sqlc.CreateEmailTokenParams{
		UserID:    uid,
		Purpose:   string(t.Purpose),
		TokenHash: t.TokenHash,
		Column4:   t.NewEmail,
		ExpiresAt: t.ExpiresAt,
	})
	if err != nil {
		return domain.EmailToken{}, err
	}
	return toDomainEmailToken(row.ID, row.UserID, row.Purpose, row.TokenHash, row.NewEmail, row.CreatedAt, row.ExpiresAt, row.UsedAt), nil
}

// GetActiveEmailToken ищет активный (не погашенный, не просроченный) токен
// по хешу и назначению. Не найден/просрочен/погашен → ErrInvalidEmailToken.
func (r *Repo) GetActiveEmailToken(ctx context.Context, tokenHash string, purpose domain.EmailTokenPurpose) (domain.EmailToken, error) {
	row, err := r.q.GetActiveEmailToken(ctx, sqlc.GetActiveEmailTokenParams{
		TokenHash: tokenHash,
		Purpose:   string(purpose),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.EmailToken{}, domain.ErrInvalidEmailToken
		}
		return domain.EmailToken{}, err
	}
	return toDomainEmailToken(row.ID, row.UserID, row.Purpose, row.TokenHash, row.NewEmail, row.CreatedAt, row.ExpiresAt, row.UsedAt), nil
}

// MarkEmailTokenUsed погашает токен после успешного использования.
func (r *Repo) MarkEmailTokenUsed(ctx context.Context, id string) error {
	uid, err := uuid.Parse(id)
	if err != nil {
		return domain.ErrInvalidEmailToken
	}
	return r.q.MarkEmailTokenUsed(ctx, uid)
}

// InvalidateActiveEmailTokens гасит все активные токены пользователя
// данного назначения.
func (r *Repo) InvalidateActiveEmailTokens(ctx context.Context, userID string, purpose domain.EmailTokenPurpose) error {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return domain.ErrUserNotFound
	}
	return r.q.InvalidateActiveEmailTokens(ctx, sqlc.InvalidateActiveEmailTokensParams{
		UserID:  uid,
		Purpose: string(purpose),
	})
}

// LastEmailTokenAt возвращает время выдачи последнего токена данного
// назначения (в т.ч. погашенного). Нулевое время — токенов не было.
func (r *Repo) LastEmailTokenAt(ctx context.Context, userID string, purpose domain.EmailTokenPurpose) (time.Time, error) {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return time.Time{}, domain.ErrUserNotFound
	}
	return r.q.LastEmailTokenAt(ctx, sqlc.LastEmailTokenAtParams{
		UserID:  uid,
		Purpose: string(purpose),
	})
}

// SetPendingEmail проставляет запрошенный новый адрес (FR-6).
func (r *Repo) SetPendingEmail(ctx context.Context, userID, newEmail string) error {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return domain.ErrUserNotFound
	}
	return r.q.SetPendingEmail(ctx, sqlc.SetPendingEmailParams{
		ID:           uid,
		PendingEmail: newEmail,
	})
}

// ApplyEmailChange меняет email пользователя, сбрасывает email_verified_at
// и очищает pending_email (FR-6).
func (r *Repo) ApplyEmailChange(ctx context.Context, userID, newEmail string, _ time.Time) (domain.User, error) {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return domain.User{}, domain.ErrUserNotFound
	}
	row, err := r.q.ApplyEmailChange(ctx, sqlc.ApplyEmailChangeParams{
		ID:    uid,
		Email: newEmail,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.User{}, domain.ErrUserNotFound
		}
		return domain.User{}, err
	}
	return toDomain(row), nil
}

// IsEmailTaken проверяет занятость адреса другой учёткой (FR-8).
func (r *Repo) IsEmailTaken(ctx context.Context, email string) (bool, error) {
	return r.q.IsEmailTaken(ctx, email)
}

// CreateSession создаёт новую строку реестра сессий (ADR 0018).
func (r *Repo) CreateSession(ctx context.Context, s domain.NewSession) (domain.Session, error) {
	uid, err := uuid.Parse(s.UserID)
	if err != nil {
		return domain.Session{}, domain.ErrUserNotFound
	}
	row, err := r.q.CreateSession(ctx, sqlc.CreateSessionParams{
		UserID:    uid,
		ExpiresAt: s.ExpiresAt,
	})
	if err != nil {
		return domain.Session{}, err
	}
	return toDomainSession(row), nil
}

// GetSession возвращает сессию по id. Не найдена → ErrSessionNotFound.
func (r *Repo) GetSession(ctx context.Context, id string) (domain.Session, error) {
	uid, err := uuid.Parse(id)
	if err != nil {
		return domain.Session{}, domain.ErrSessionNotFound
	}
	row, err := r.q.GetSession(ctx, uid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Session{}, domain.ErrSessionNotFound
		}
		return domain.Session{}, err
	}
	return toDomainSession(row), nil
}

// TouchSession обновляет last_seen_at сессии (на каждом Refresh, FR-11).
func (r *Repo) TouchSession(ctx context.Context, id string, at time.Time) error {
	uid, err := uuid.Parse(id)
	if err != nil {
		return domain.ErrSessionNotFound
	}
	return r.q.TouchSession(ctx, sqlc.TouchSessionParams{
		ID:         uid,
		LastSeenAt: at,
	})
}

// ListActiveSessions возвращает активные (не отозванные, не просроченные)
// сессии пользователя.
func (r *Repo) ListActiveSessions(ctx context.Context, userID string) ([]domain.Session, error) {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return nil, domain.ErrUserNotFound
	}
	rows, err := r.q.ListActiveSessions(ctx, uid)
	if err != nil {
		return nil, err
	}
	out := make([]domain.Session, 0, len(rows))
	for _, row := range rows {
		out = append(out, toDomainSession(row))
	}
	return out, nil
}

// RevokeSession отзывает одну сессию по id (идемпотентно).
func (r *Repo) RevokeSession(ctx context.Context, id string, at time.Time) error {
	uid, err := uuid.Parse(id)
	if err != nil {
		return domain.ErrSessionNotFound
	}
	return r.q.RevokeSession(ctx, sqlc.RevokeSessionParams{
		ID:        uid,
		RevokedAt: pgtype.Timestamptz{Time: at, Valid: true},
	})
}

// RevokeUserSessions отзывает все активные сессии пользователя, кроме
// exceptID (пустая строка — отзывает все). Возвращает число отозванных.
func (r *Repo) RevokeUserSessions(ctx context.Context, userID, exceptID string, at time.Time) (int, error) {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return 0, domain.ErrUserNotFound
	}
	n, err := r.q.RevokeUserSessions(ctx, sqlc.RevokeUserSessionsParams{
		UserID:    uid,
		Column2:   exceptID,
		RevokedAt: pgtype.Timestamptz{Time: at, Valid: true},
	})
	if err != nil {
		return 0, err
	}
	return int(n), nil
}

// SetNotificationSettings правит личные переключатели уведомлений (FR-20).
func (r *Repo) SetNotificationSettings(ctx context.Context, userID string, s domain.NotificationSettings) (domain.User, error) {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return domain.User{}, domain.ErrUserNotFound
	}
	row, err := r.q.SetNotificationSettings(ctx, sqlc.SetNotificationSettingsParams{
		ID:                     uid,
		NotifyApplicationState: s.ApplicationState,
		NotifyPoolSeated:       s.PoolSeated,
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
	user := domain.User{
		ID:                u.ID.String(),
		Email:             u.Email,
		DisplayName:       u.DisplayName,
		Role:              domain.Role(u.Role),
		CreatedAt:         u.CreatedAt,
		Club:              u.Club,
		PasswordChangedAt: u.PasswordChangedAt,
		PendingEmail:      u.PendingEmail,
		Notifications: domain.NotificationSettings{
			ApplicationState: u.NotifyApplicationState,
			PoolSeated:       u.NotifyPoolSeated,
		},
	}
	if u.EmailVerifiedAt.Valid {
		verifiedAt := u.EmailVerifiedAt.Time
		user.EmailVerifiedAt = &verifiedAt
	}
	return user
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

// toDomainEmailToken строит domain.EmailToken из общей формы строки,
// которую отдают и CreateEmailToken, и GetActiveEmailToken — sqlc
// генерирует под каждый запрос свой row-тип, даже когда набор колонок
// (и, значит, форма) совпадает буквально, поэтому конвертер принимает
// значения полями, а не одним из сгенерированных row-типов.
func toDomainEmailToken(id, userID uuid.UUID, purpose, tokenHash, newEmail string, createdAt, expiresAt time.Time, usedAt pgtype.Timestamptz) domain.EmailToken {
	et := domain.EmailToken{
		ID:        id.String(),
		UserID:    userID.String(),
		Purpose:   domain.EmailTokenPurpose(purpose),
		TokenHash: tokenHash,
		NewEmail:  newEmail,
		CreatedAt: createdAt,
		ExpiresAt: expiresAt,
	}
	if usedAt.Valid {
		used := usedAt.Time
		et.UsedAt = &used
	}
	return et
}

func toDomainSession(s sqlc.AuthSession) domain.Session {
	session := domain.Session{
		ID:         s.ID.String(),
		UserID:     s.UserID.String(),
		CreatedAt:  s.CreatedAt,
		LastSeenAt: s.LastSeenAt,
		ExpiresAt:  s.ExpiresAt,
	}
	if s.RevokedAt.Valid {
		revokedAt := s.RevokedAt.Time
		session.RevokedAt = &revokedAt
	}
	return session
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "23505"
	}
	return false
}
