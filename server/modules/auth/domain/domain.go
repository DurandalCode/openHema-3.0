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

	// UpdatePassword заменяет хеш пароля пользователя и двигает
	// PasswordChangedAt (используется Refresh для обрыва старых сессий, FR-12).
	UpdatePassword(ctx context.Context, userID, passwordHash string) error
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
}
