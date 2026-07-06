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
)

// User — доменная сущность пользователя (без пароля).
type User struct {
	ID          string
	Email       string
	DisplayName string
	CreatedAt   time.Time
}

// NewUser — данные для создания пользователя.
type NewUser struct {
	Email        string
	PasswordHash string
	DisplayName  string
}

// Repository — порт доступа к хранилищу пользователей.
// Реализуется в слое repo; service зависит от этого интерфейса, не от pg.
type Repository interface {
	CreateUser(ctx context.Context, u NewUser) (User, error)
	// GetCredentialsByEmail возвращает пользователя и его хеш пароля.
	GetCredentialsByEmail(ctx context.Context, email string) (User, string, error)
	GetUserByID(ctx context.Context, id string) (User, error)
}
