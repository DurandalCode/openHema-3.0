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
}
