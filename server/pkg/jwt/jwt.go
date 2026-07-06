// Package jwt выпускает и валидирует access/refresh JWT (HS256).
package jwt

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// TokenType различает access и refresh токены (клейм "typ").
type TokenType string

const (
	AccessToken  TokenType = "access"
	RefreshToken TokenType = "refresh"
)

// ErrInvalidToken — токен невалиден, истёк или не того типа.
var ErrInvalidToken = errors.New("jwt: invalid token")

// Claims — полезная нагрузка токена.
type Claims struct {
	UserID string    `json:"uid"`
	Role   string    `json:"rol,omitempty"`
	Type   TokenType `json:"typ"`
	jwt.RegisteredClaims
}

// Manager выпускает и проверяет токены двух типов с разными секретами и TTL.
type Manager struct {
	accessSecret  []byte
	refreshSecret []byte
	accessTTL     time.Duration
	refreshTTL    time.Duration
}

// NewManager создаёт менеджер токенов.
func NewManager(accessSecret, refreshSecret string, accessTTL, refreshTTL time.Duration) *Manager {
	return &Manager{
		accessSecret:  []byte(accessSecret),
		refreshSecret: []byte(refreshSecret),
		accessTTL:     accessTTL,
		refreshTTL:    refreshTTL,
	}
}

// Pair — пара выпущенных токенов.
type Pair struct {
	Access  string
	Refresh string
}

// Issue выпускает пару access+refresh для указанного пользователя с заданной ролью.
// Роль попадает только в access-токен (refresh не несёт авторизационного смысла).
func (m *Manager) Issue(userID, role string) (Pair, error) {
	access, err := m.sign(userID, role, AccessToken, m.accessSecret, m.accessTTL)
	if err != nil {
		return Pair{}, err
	}
	refresh, err := m.sign(userID, "", RefreshToken, m.refreshSecret, m.refreshTTL)
	if err != nil {
		return Pair{}, err
	}
	return Pair{Access: access, Refresh: refresh}, nil
}

// ParseAccess проверяет access-токен и возвращает его клеймы.
func (m *Manager) ParseAccess(token string) (*Claims, error) {
	return m.parse(token, AccessToken, m.accessSecret)
}

// ParseRefresh проверяет refresh-токен и возвращает его клеймы.
func (m *Manager) ParseRefresh(token string) (*Claims, error) {
	return m.parse(token, RefreshToken, m.refreshSecret)
}

func (m *Manager) sign(userID, role string, typ TokenType, secret []byte, ttl time.Duration) (string, error) {
	now := time.Now()
	claims := Claims{
		UserID: userID,
		Role:   role,
		Type:   typ,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(secret)
	if err != nil {
		return "", fmt.Errorf("sign token: %w", err)
	}
	return signed, nil
}

func (m *Manager) parse(tokenStr string, want TokenType, secret []byte) (*Claims, error) {
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrInvalidToken
		}
		return secret, nil
	})
	if err != nil || !token.Valid {
		return nil, ErrInvalidToken
	}
	if claims.Type != want {
		return nil, ErrInvalidToken
	}
	return claims, nil
}
