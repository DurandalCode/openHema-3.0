// Package domain описывает сущности, порты и ошибки модуля auth.
package domain

import (
	"context"
	"errors"
	"time"
)

// Доменные ошибки. Слой api мапит их в connect.Code.
var (
	ErrUserExists         = errors.New("auth: user already exists")
	ErrUserNotFound       = errors.New("auth: user not found")
	ErrInvalidCredentials = errors.New("auth: invalid credentials")
	ErrForbidden          = errors.New("auth: forbidden")
	// ErrInvalidResetToken — токен восстановления не найден, просрочен или
	// уже использован. Один код для всех трёх случаев: спека 0037 (FR-8)
	// запрещает различать их в ответе — иначе по коду ошибки читалось бы,
	// существует ли аккаунт/ссылка вообще.
	ErrInvalidResetToken = errors.New("auth: invalid reset token")
	// ErrWeakPassword — пароль короче единой политики длины (FR-11).
	ErrWeakPassword = errors.New("auth: password too weak")
	// ErrInvalidProfile — недопустимые данные профиля (напр. пустое имя, FR-14).
	ErrInvalidProfile = errors.New("auth: invalid profile")
	// ErrInvalidEmail — email не проходит валидацию формата (в т.ч. CR/LF —
	// вектор SMTP header injection через письмо восстановления пароля).
	ErrInvalidEmail = errors.New("auth: invalid email")
	// ErrInvalidEmailToken — токен подтверждения/смены адреса не найден,
	// просрочен или уже использован. Один код на все три случая — тем же
	// приёмом, что ErrInvalidResetToken (спека 0042).
	ErrInvalidEmailToken = errors.New("auth: invalid email token")
	// ErrEmailTaken — запрошенный новый адрес уже занят другой учёткой
	// (проверяется и при запросе смены, и повторно при подтверждении, FR-8).
	ErrEmailTaken = errors.New("auth: email already taken")
	// ErrEmailNotVerified — попытка включить вид уведомлений при
	// неподтверждённом адресе учётки (FR-21).
	ErrEmailNotVerified = errors.New("auth: email not verified")
	// ErrSessionNotFound — сессия с таким id не существует.
	ErrSessionNotFound = errors.New("auth: session not found")
	// ErrThrottled — повторный запрос (письмо подтверждения/смены адреса)
	// раньше минимального интервала (FR-4/FR-6).
	ErrThrottled = errors.New("auth: throttled")
)

// Role — роль пользователя. Хранится в БД как TEXT с CHECK-ограничением.
type Role string

const (
	RoleUser  Role = "user"
	RoleAdmin Role = "admin"
)

// User — доменная сущность пользователя (без пароля).
type User struct {
	ID          string
	Email       string
	DisplayName string
	Role        Role
	CreatedAt   time.Time
	// Club — клуб пользователя (данные учётки, не бойца: спеки 0007/0026
	// связь учётка↔боец не восстанавливают). Пустая строка — «не указан».
	Club string
	// PasswordChangedAt — момент последней смены/сброса пароля. Refresh
	// сверяет с ним iat токена, чтобы оборвать продление старых сессий
	// после смены пароля (FR-12).
	PasswordChangedAt time.Time
	// EmailVerifiedAt — момент подтверждения текущего адреса. nil — адрес
	// не подтверждён (спека 0042, FR-1). Учётки, существующие на момент
	// внедрения фичи, считаются подтверждёнными (grandfather, миграция 00003).
	EmailVerifiedAt *time.Time
	// PendingEmail — новый адрес, ожидающий подтверждения по ссылке из
	// письма (FR-6). Пустая строка — запроса смены нет.
	PendingEmail string
	// Notifications — личные переключатели уведомлений (FR-20). Оба
	// выключены по умолчанию у новых учёток.
	Notifications NotificationSettings
}

// NotificationSettings — виды уведомлений, зеркалит proto
// hema.v1.NotificationSettings. Используется и для личных переключателей
// (auth.users), и для глобальных (модуль tournament) — набор видов один и
// тот же (спека 0042, решение из plan.md).
type NotificationSettings struct {
	// ApplicationState — о состоянии моей заявки, изменённом не мной (FR-23).
	ApplicationState bool
	// PoolSeated — о постановке моего пула на площадку (FR-24).
	PoolSeated bool
}

// EmailTokenPurpose различает назначение одноразового токена: подтверждение
// текущего адреса или подтверждение смены на новый.
type EmailTokenPurpose string

const (
	EmailTokenVerify EmailTokenPurpose = "verify"
	EmailTokenChange EmailTokenPurpose = "change"
)

// EmailToken — одноразовый токен подтверждения/смены адреса. Хранится
// только sha256-хеш сырого токена (NFR-1) — сам токен живёт лишь в письме.
// Отдельный тип и таблица от ResetToken: другой жизненный цикл (два
// назначения) и другая полезная нагрузка (NewEmail у purpose=change).
type EmailToken struct {
	ID        string
	UserID    string
	Purpose   EmailTokenPurpose
	TokenHash string
	// NewEmail — заполнен только у Purpose == EmailTokenChange.
	NewEmail  string
	CreatedAt time.Time
	ExpiresAt time.Time
	// UsedAt — момент погашения (использован либо вытеснен новым запросом).
	// nil — токен активен.
	UsedAt *time.Time
}

// NewEmailToken — данные для создания токена подтверждения/смены адреса.
type NewEmailToken struct {
	UserID    string
	Purpose   EmailTokenPurpose
	TokenHash string
	NewEmail  string
	ExpiresAt time.Time
}

// Session — одна выданная refresh-сессия пользователя (ADR 0018, FR-10..
// FR-17). Без устройства/браузера/IP (решение 2 спеки 0042, NFR-8) —
// только времена.
type Session struct {
	ID         string
	UserID     string
	CreatedAt  time.Time
	LastSeenAt time.Time
	ExpiresAt  time.Time
	// RevokedAt — момент отзыва (поштучно, «выйти со всех устройств»,
	// смена/сброс пароля). nil — сессия активна.
	RevokedAt *time.Time
}

// NewSession — данные для создания сессии.
type NewSession struct {
	UserID    string
	ExpiresAt time.Time
}

// ResetToken — одноразовый токен восстановления пароля. Хранится только
// sha256-хеш сырого токена (NFR-1) — сам токен живёт лишь в письме.
type ResetToken struct {
	ID        string
	UserID    string
	TokenHash string
	CreatedAt time.Time
	ExpiresAt time.Time
	// UsedAt — момент погашения: использован (FR-4) либо вытеснен новым
	// запросом (FR-5). nil — токен активен.
	UsedAt *time.Time
}

// NewResetToken — данные для создания токена восстановления.
type NewResetToken struct {
	UserID    string
	TokenHash string
	ExpiresAt time.Time
}

// Mailer — доменный порт отправки писем. Домен знает только «отправить
// ссылку восстановления», не знает про SMTP (спека 0037, решение 3).
type Mailer interface {
	SendPasswordReset(ctx context.Context, to, link string) error
	// SendEmailVerification — письмо подтверждения адреса (FR-3).
	SendEmailVerification(ctx context.Context, to, link string) error
	// SendEmailChangeConfirmation — письмо со ссылкой подтверждения на
	// НОВЫЙ адрес (FR-6).
	SendEmailChangeConfirmation(ctx context.Context, newAddr, link string) error
	// SendEmailChangeNotice — письмо-предупреждение на ПРЕЖНИЙ адрес, без
	// ссылки (FR-7): просто уведомляет, что запрошена смена на newAddr.
	SendEmailChangeNotice(ctx context.Context, oldAddr, newAddr string) error
}

// NewUser — данные для создания пользователя.
type NewUser struct {
	Email        string
	PasswordHash string
	DisplayName  string
	Role         Role
}

// ListParams — параметры постраничной выборки пользователей.
type ListParams struct {
	Limit  int32
	Offset int32
}

// Repository — порт доступа к хранилищу пользователей.
// Реализуется в слое repo; service зависит от этого интерфейса, не от pg.
type Repository interface {
	CreateUser(ctx context.Context, u NewUser) (User, error)
	// GetCredentialsByEmail возвращает пользователя и его хеш пароля.
	GetCredentialsByEmail(ctx context.Context, email string) (User, string, error)
	GetUserByID(ctx context.Context, id string) (User, error)
	// GetUsersByIDs возвращает пользователей по набору идентификаторов
	// (батч-резолв; неизвестные id просто отсутствуют в результате).
	GetUsersByIDs(ctx context.Context, ids []string) ([]User, error)
	CountAdmins(ctx context.Context) (int, error)
	ListAdmins(ctx context.Context) ([]User, error)
	ListUsers(ctx context.Context, p ListParams) ([]User, error)
	SetUserRole(ctx context.Context, id string, role Role) (User, error)

	// UpdatePassword заменяет хеш пароля пользователя и ставит
	// PasswordChangedAt в переданное значение (используется Refresh для
	// обрыва старых сессий, FR-12). changedAt приходит от вызывающего
	// сервиса (его источник времени, `Service.now`) — а не вычисляется
	// в хранилище (`now()` на стороне PG): iat токена и PasswordChangedAt
	// иначе сравнивались бы по часам двух разных хостов (app vs DB),
	// и малейший рассинхрон отклонял бы свежевыданный токен на первом
	// же Refresh.
	UpdatePassword(ctx context.Context, userID, passwordHash string, changedAt time.Time) error
	// UpdateProfile правит отображаемое имя и клуб пользователя.
	UpdateProfile(ctx context.Context, userID, displayName, club string) (User, error)

	// CreateResetToken сохраняет новый токен восстановления (хеш, не сырой).
	CreateResetToken(ctx context.Context, t NewResetToken) (ResetToken, error)
	// LastResetTokenAt возвращает время выдачи последнего токена
	// восстановления пользователя (в т.ч. уже погашенного) — троттлинг FR-6.
	// Нулевое время — токенов не было.
	LastResetTokenAt(ctx context.Context, userID string) (time.Time, error)
	// InvalidateActiveResetTokens гасит все активные токены пользователя
	// (FR-5: новый запрос обесценивает прежние неиспользованные ссылки).
	InvalidateActiveResetTokens(ctx context.Context, userID string) error
	// GetActiveResetToken ищет активный (не погашенный, не просроченный)
	// токен по хешу. Не найден/просрочен/погашен → ErrInvalidResetToken.
	GetActiveResetToken(ctx context.Context, tokenHash string) (ResetToken, error)
	// MarkResetTokenUsed погашает токен после успешной смены пароля (FR-4).
	MarkResetTokenUsed(ctx context.Context, id string) error

	// MarkEmailVerified проставляет EmailVerifiedAt (FR-3).
	MarkEmailVerified(ctx context.Context, userID string, at time.Time) error
	// CreateEmailToken сохраняет новый токен подтверждения/смены адреса.
	CreateEmailToken(ctx context.Context, t NewEmailToken) (EmailToken, error)
	// GetActiveEmailToken ищет активный (не погашенный, не просроченный)
	// токен по хешу и назначению. Не найден/просрочен/погашен →
	// ErrInvalidEmailToken.
	GetActiveEmailToken(ctx context.Context, tokenHash string, purpose EmailTokenPurpose) (EmailToken, error)
	// MarkEmailTokenUsed погашает токен после успешного использования.
	MarkEmailTokenUsed(ctx context.Context, id string) error
	// InvalidateActiveEmailTokens гасит все активные токены пользователя
	// данного назначения (новый запрос обесценивает прежние
	// неиспользованные ссылки).
	InvalidateActiveEmailTokens(ctx context.Context, userID string, purpose EmailTokenPurpose) error
	// LastEmailTokenAt возвращает время выдачи последнего токена данного
	// назначения (в т.ч. погашенного) — троттлинг FR-4/FR-6. Нулевое время —
	// токенов не было.
	LastEmailTokenAt(ctx context.Context, userID string, purpose EmailTokenPurpose) (time.Time, error)
	// SetPendingEmail проставляет запрошенный новый адрес (FR-6).
	SetPendingEmail(ctx context.Context, userID, newEmail string) error
	// ApplyEmailChange меняет email пользователя на newEmail, сбрасывает
	// EmailVerifiedAt в nil (новый адрес ещё не подтверждён — но раз мы
	// сюда попали по токену purpose=change, значит подтверждение как раз
	// произошло — см. ConfirmEmailChange) и очищает PendingEmail.
	ApplyEmailChange(ctx context.Context, userID, newEmail string, at time.Time) (User, error)
	// IsEmailTaken проверяет занятость адреса другой учёткой.
	IsEmailTaken(ctx context.Context, email string) (bool, error)

	// CreateSession создаёт новую строку реестра сессий (ADR 0018).
	CreateSession(ctx context.Context, s NewSession) (Session, error)
	// GetSession возвращает сессию по id. Не найдена → ErrSessionNotFound.
	GetSession(ctx context.Context, id string) (Session, error)
	// TouchSession обновляет LastSeenAt (на каждом Refresh, FR-11).
	TouchSession(ctx context.Context, id string, at time.Time) error
	// ListActiveSessions возвращает активные (не отозванные, не
	// просроченные) сессии пользователя.
	ListActiveSessions(ctx context.Context, userID string) ([]Session, error)
	// RevokeSession отзывает одну сессию по id (идемпотентно).
	RevokeSession(ctx context.Context, id string, at time.Time) error
	// RevokeUserSessions отзывает все активные сессии пользователя, кроме
	// exceptID (пустая строка — отзывает все). Возвращает число отозванных.
	RevokeUserSessions(ctx context.Context, userID, exceptID string, at time.Time) (int, error)

	// SetNotificationSettings правит личные переключатели уведомлений (FR-20).
	SetNotificationSettings(ctx context.Context, userID string, s NotificationSettings) (User, error)
}
