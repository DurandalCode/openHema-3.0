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
	mu          sync.Mutex
	users       map[string]storedUser // key: email (lowercased)
	resetTokens map[string]domain.ResetToken
	emailTokens map[string]domain.EmailToken // key: id
	sessions    map[string]domain.Session    // key: id
	// now — источник времени для проверки просроченности токенов сброса.
	// По умолчанию time.Now; тесты с управляемыми часами (спека 0037,
	// детерминизм TTL/троттлинга) подменяют через SetNow тем же now, что
	// передан в service.New, — иначе fake-репо и сервис расходятся во времени.
	now func() time.Time
	// getActiveResetTokenErr — если задана, GetActiveResetToken возвращает
	// эту ошибку вместо обычного поиска. Нужно тестам, проверяющим, что
	// реальный сбой хранилища не маскируется под ErrInvalidResetToken
	// (спека 0037): в реальном Repo (repo.go) через эту точку проходят
	// любые ошибки БД, не только «не найдено».
	getActiveResetTokenErr error
}

type storedUser struct {
	user         domain.User
	passwordHash string
}

// NewFakeRepo создаёт пустой fake-репозиторий.
func NewFakeRepo() *FakeRepo {
	return &FakeRepo{
		users:       make(map[string]storedUser),
		resetTokens: make(map[string]domain.ResetToken),
		emailTokens: make(map[string]domain.EmailToken),
		sessions:    make(map[string]domain.Session),
		now:         time.Now,
	}
}

// SetNow подменяет источник времени репозитория (для тестов с управляемыми
// часами — держит проверку просроченности токенов синхронной с сервисом).
func (r *FakeRepo) SetNow(now func() time.Time) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.now = now
}

// SetGetActiveResetTokenErr заставляет следующий(-е) вызов(ы)
// GetActiveResetToken вернуть заданную ошибку вместо обычного поиска —
// имитация сбоя хранилища (не «токен не найден»).
func (r *FakeRepo) SetGetActiveResetTokenErr(err error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.getActiveResetTokenErr = err
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

	now := r.now().UTC()
	user := domain.User{
		ID:                uuid.NewString(),
		Email:             u.Email,
		DisplayName:       u.DisplayName,
		Role:              role,
		CreatedAt:         now,
		PasswordChangedAt: now,
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

// UpdatePassword заменяет хеш пароля и ставит PasswordChangedAt в
// переданное значение — намеренно НЕ r.now() (эта fake-реализация не
// должна сама придумывать время: интерфейс требует передавать changedAt
// явно, ровно как реальный Repo, чтобы регрессия «сервис забыл передать
// свои часы» ловилась тестами, а не полагалась на то, что фейковые часы
// репозитория случайно совпадают с часами сервиса).
func (r *FakeRepo) UpdatePassword(_ context.Context, userID, passwordHash string, changedAt time.Time) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	for key, su := range r.users {
		if su.user.ID == userID {
			su.passwordHash = passwordHash
			su.user.PasswordChangedAt = changedAt.UTC()
			r.users[key] = su
			return nil
		}
	}
	return domain.ErrUserNotFound
}

// UpdateProfile правит отображаемое имя и клуб пользователя.
func (r *FakeRepo) UpdateProfile(_ context.Context, userID, displayName, club string) (domain.User, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	for key, su := range r.users {
		if su.user.ID == userID {
			su.user.DisplayName = displayName
			su.user.Club = club
			r.users[key] = su
			return su.user, nil
		}
	}
	return domain.User{}, domain.ErrUserNotFound
}

// CreateResetToken сохраняет новый токен восстановления.
func (r *FakeRepo) CreateResetToken(_ context.Context, t domain.NewResetToken) (domain.ResetToken, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	token := domain.ResetToken{
		ID:        uuid.NewString(),
		UserID:    t.UserID,
		TokenHash: t.TokenHash,
		CreatedAt: r.now().UTC(),
		ExpiresAt: t.ExpiresAt,
	}
	r.resetTokens[token.ID] = token
	return token, nil
}

// LastResetTokenAt возвращает время выдачи последнего токена восстановления
// пользователя (в т.ч. погашенного). Нулевое время — токенов не было.
func (r *FakeRepo) LastResetTokenAt(_ context.Context, userID string) (time.Time, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	var last time.Time
	for _, t := range r.resetTokens {
		if t.UserID == userID && t.CreatedAt.After(last) {
			last = t.CreatedAt
		}
	}
	return last, nil
}

// InvalidateActiveResetTokens гасит все активные токены пользователя.
func (r *FakeRepo) InvalidateActiveResetTokens(_ context.Context, userID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	now := r.now().UTC()
	for id, t := range r.resetTokens {
		if t.UserID == userID && t.UsedAt == nil {
			t.UsedAt = &now
			r.resetTokens[id] = t
		}
	}
	return nil
}

// GetActiveResetToken ищет активный токен по хешу. Не найден/просрочен/погашен
// → domain.ErrInvalidResetToken.
func (r *FakeRepo) GetActiveResetToken(_ context.Context, tokenHash string) (domain.ResetToken, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.getActiveResetTokenErr != nil {
		return domain.ResetToken{}, r.getActiveResetTokenErr
	}

	for _, t := range r.resetTokens {
		if t.TokenHash != tokenHash {
			continue
		}
		if t.UsedAt != nil || r.now().UTC().After(t.ExpiresAt) {
			return domain.ResetToken{}, domain.ErrInvalidResetToken
		}
		return t, nil
	}
	return domain.ResetToken{}, domain.ErrInvalidResetToken
}

// MarkResetTokenUsed погашает токен после успешной смены пароля.
func (r *FakeRepo) MarkResetTokenUsed(_ context.Context, id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	t, ok := r.resetTokens[id]
	if !ok {
		return domain.ErrInvalidResetToken
	}
	now := r.now().UTC()
	t.UsedAt = &now
	r.resetTokens[id] = t
	return nil
}

// MarkEmailVerified проставляет EmailVerifiedAt пользователя.
func (r *FakeRepo) MarkEmailVerified(_ context.Context, userID string, at time.Time) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	for key, su := range r.users {
		if su.user.ID == userID {
			verifiedAt := at.UTC()
			su.user.EmailVerifiedAt = &verifiedAt
			r.users[key] = su
			return nil
		}
	}
	return domain.ErrUserNotFound
}

// CreateEmailToken сохраняет новый токен подтверждения/смены адреса.
func (r *FakeRepo) CreateEmailToken(_ context.Context, t domain.NewEmailToken) (domain.EmailToken, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	token := domain.EmailToken{
		ID:        uuid.NewString(),
		UserID:    t.UserID,
		Purpose:   t.Purpose,
		TokenHash: t.TokenHash,
		NewEmail:  t.NewEmail,
		CreatedAt: r.now().UTC(),
		ExpiresAt: t.ExpiresAt,
	}
	r.emailTokens[token.ID] = token
	return token, nil
}

// GetActiveEmailToken ищет активный токен по хешу и назначению. Не найден/
// просрочен/погашен → domain.ErrInvalidEmailToken.
func (r *FakeRepo) GetActiveEmailToken(_ context.Context, tokenHash string, purpose domain.EmailTokenPurpose) (domain.EmailToken, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, t := range r.emailTokens {
		if t.TokenHash != tokenHash || t.Purpose != purpose {
			continue
		}
		if t.UsedAt != nil || r.now().UTC().After(t.ExpiresAt) {
			return domain.EmailToken{}, domain.ErrInvalidEmailToken
		}
		return t, nil
	}
	return domain.EmailToken{}, domain.ErrInvalidEmailToken
}

// MarkEmailTokenUsed погашает токен после успешного использования.
func (r *FakeRepo) MarkEmailTokenUsed(_ context.Context, id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	t, ok := r.emailTokens[id]
	if !ok {
		return domain.ErrInvalidEmailToken
	}
	now := r.now().UTC()
	t.UsedAt = &now
	r.emailTokens[id] = t
	return nil
}

// InvalidateActiveEmailTokens гасит все активные токены пользователя
// данного назначения.
func (r *FakeRepo) InvalidateActiveEmailTokens(_ context.Context, userID string, purpose domain.EmailTokenPurpose) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	now := r.now().UTC()
	for id, t := range r.emailTokens {
		if t.UserID == userID && t.Purpose == purpose && t.UsedAt == nil {
			t.UsedAt = &now
			r.emailTokens[id] = t
		}
	}
	return nil
}

// LastEmailTokenAt возвращает время выдачи последнего токена данного
// назначения (в т.ч. погашенного). Нулевое время — токенов не было.
func (r *FakeRepo) LastEmailTokenAt(_ context.Context, userID string, purpose domain.EmailTokenPurpose) (time.Time, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	var last time.Time
	for _, t := range r.emailTokens {
		if t.UserID == userID && t.Purpose == purpose && t.CreatedAt.After(last) {
			last = t.CreatedAt
		}
	}
	return last, nil
}

// SetPendingEmail проставляет запрошенный новый адрес пользователя.
func (r *FakeRepo) SetPendingEmail(_ context.Context, userID, newEmail string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	for key, su := range r.users {
		if su.user.ID == userID {
			su.user.PendingEmail = newEmail
			r.users[key] = su
			return nil
		}
	}
	return domain.ErrUserNotFound
}

// ApplyEmailChange меняет email пользователя, сбрасывает EmailVerifiedAt в
// nil и очищает PendingEmail. Меняется и ключ карты users (ключ — email).
func (r *FakeRepo) ApplyEmailChange(_ context.Context, userID, newEmail string, at time.Time) (domain.User, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	for key, su := range r.users {
		if su.user.ID == userID {
			delete(r.users, key)
			su.user.Email = newEmail
			su.user.EmailVerifiedAt = nil
			su.user.PendingEmail = ""
			r.users[newEmail] = su
			return su.user, nil
		}
	}
	return domain.User{}, domain.ErrUserNotFound
}

// IsEmailTaken проверяет занятость адреса другой учёткой.
func (r *FakeRepo) IsEmailTaken(_ context.Context, email string) (bool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	_, ok := r.users[email]
	return ok, nil
}

// CreateSession создаёт новую строку реестра сессий.
func (r *FakeRepo) CreateSession(_ context.Context, s domain.NewSession) (domain.Session, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	now := r.now().UTC()
	session := domain.Session{
		ID:         uuid.NewString(),
		UserID:     s.UserID,
		CreatedAt:  now,
		LastSeenAt: now,
		ExpiresAt:  s.ExpiresAt,
	}
	r.sessions[session.ID] = session
	return session, nil
}

// GetSession возвращает сессию по id. Не найдена → ErrSessionNotFound.
func (r *FakeRepo) GetSession(_ context.Context, id string) (domain.Session, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	s, ok := r.sessions[id]
	if !ok {
		return domain.Session{}, domain.ErrSessionNotFound
	}
	return s, nil
}

// TouchSession обновляет LastSeenAt сессии.
func (r *FakeRepo) TouchSession(_ context.Context, id string, at time.Time) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	s, ok := r.sessions[id]
	if !ok {
		return domain.ErrSessionNotFound
	}
	s.LastSeenAt = at.UTC()
	r.sessions[id] = s
	return nil
}

// ListActiveSessions возвращает активные (не отозванные, не просроченные)
// сессии пользователя.
func (r *FakeRepo) ListActiveSessions(_ context.Context, userID string) ([]domain.Session, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	now := r.now().UTC()
	out := make([]domain.Session, 0)
	for _, s := range r.sessions {
		if s.UserID != userID {
			continue
		}
		if s.RevokedAt != nil || now.After(s.ExpiresAt) {
			continue
		}
		out = append(out, s)
	}
	return out, nil
}

// RevokeSession отзывает одну сессию по id (идемпотентно).
func (r *FakeRepo) RevokeSession(_ context.Context, id string, at time.Time) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	s, ok := r.sessions[id]
	if !ok {
		return domain.ErrSessionNotFound
	}
	if s.RevokedAt == nil {
		revokedAt := at.UTC()
		s.RevokedAt = &revokedAt
		r.sessions[id] = s
	}
	return nil
}

// RevokeUserSessions отзывает все активные сессии пользователя, кроме
// exceptID (пустая строка — отзывает все). Возвращает число отозванных.
func (r *FakeRepo) RevokeUserSessions(_ context.Context, userID, exceptID string, at time.Time) (int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	revokedAt := at.UTC()
	n := 0
	for id, s := range r.sessions {
		if s.UserID != userID || id == exceptID {
			continue
		}
		if s.RevokedAt != nil {
			continue
		}
		s.RevokedAt = &revokedAt
		r.sessions[id] = s
		n++
	}
	return n, nil
}

// SetNotificationSettings правит личные переключатели уведомлений.
func (r *FakeRepo) SetNotificationSettings(_ context.Context, userID string, s domain.NotificationSettings) (domain.User, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	for key, su := range r.users {
		if su.user.ID == userID {
			su.user.Notifications = s
			r.users[key] = su
			return su.user, nil
		}
	}
	return domain.User{}, domain.ErrUserNotFound
}
