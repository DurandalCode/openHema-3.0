// Package config загружает конфигурацию сервера из переменных окружения.
package config

import (
	"fmt"
	"os"
	"time"
)

// Config — вся конфигурация сервера. Читается из окружения (12-factor).
type Config struct {
	ServerHost string
	ServerPort string

	DatabaseURL string

	JWTAccessSecret  string
	JWTRefreshSecret string
	JWTAccessTTL     time.Duration
	JWTRefreshTTL    time.Duration

	// BootstrapAdmin — креды для создания первого админа при старте сервера.
	// Все поля необязательны: если email или password пусты, бутстрап пропускается.
	// После первого входа админа рекомендуется ротировать пароль и убрать
	// эти переменные из окружения.
	BootstrapAdminEmail       string
	BootstrapAdminPassword    string
	BootstrapAdminDisplayName string
}

// Load собирает Config из окружения, применяя разумные значения по умолчанию
// для необязательных полей. Возвращает ошибку, если обязательное поле пусто.
func Load() (Config, error) {
	cfg := Config{
		ServerHost:                env("SERVER_HOST", "0.0.0.0"),
		ServerPort:                env("SERVER_PORT", "8080"),
		DatabaseURL:               env("DATABASE_URL", ""),
		JWTAccessSecret:           env("JWT_ACCESS_SECRET", ""),
		JWTRefreshSecret:          env("JWT_REFRESH_SECRET", ""),
		BootstrapAdminEmail:       env("BOOTSTRAP_ADMIN_EMAIL", ""),
		BootstrapAdminPassword:    env("BOOTSTRAP_ADMIN_PASSWORD", ""),
		BootstrapAdminDisplayName: env("BOOTSTRAP_ADMIN_DISPLAY_NAME", "Admin"),
	}

	accessTTL, err := time.ParseDuration(env("JWT_ACCESS_TTL", "15m"))
	if err != nil {
		return Config{}, fmt.Errorf("parse JWT_ACCESS_TTL: %w", err)
	}
	refreshTTL, err := time.ParseDuration(env("JWT_REFRESH_TTL", "720h"))
	if err != nil {
		return Config{}, fmt.Errorf("parse JWT_REFRESH_TTL: %w", err)
	}
	cfg.JWTAccessTTL = accessTTL
	cfg.JWTRefreshTTL = refreshTTL

	if cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required")
	}
	if cfg.JWTAccessSecret == "" || cfg.JWTRefreshSecret == "" {
		return Config{}, fmt.Errorf("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET are required")
	}

	return cfg, nil
}

// Addr возвращает адрес прослушивания вида host:port.
func (c Config) Addr() string {
	return c.ServerHost + ":" + c.ServerPort
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
