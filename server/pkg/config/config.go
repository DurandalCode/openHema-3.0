// Package config загружает конфигурацию сервера из переменных окружения.
package config

import (
	"fmt"
	"os"
	"strconv"
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

	// PublicAppURL — базовый адрес публичного веб-приложения. Используется
	// для сборки ссылки восстановления пароля в письме (спека 0037).
	PublicAppURL string
	// PasswordResetTTL — срок жизни ссылки восстановления пароля (FR-4).
	PasswordResetTTL time.Duration

	// SMTP* — креды почтового адаптера отправки писем. Все поля
	// необязательны: пустой SMTPHost — легальная конфигурация (NFR-3),
	// composition root тогда выбирает лог-адаптер вместо SMTP.
	SMTPHost     string
	SMTPPort     string
	SMTPUsername string
	SMTPPassword string
	SMTPFrom     string

	// EmailTokenTTL — срок жизни одноразовых ссылок подтверждения адреса и
	// подтверждения смены адреса (спека 0042, FR-3/FR-6, NFR-1).
	EmailTokenTTL time.Duration

	// FileStorageDir — каталог локального тома файлового хранилища
	// (регламент и эмблема турнира, спека 0042 FR-30/FR-31). Пустое
	// значение — легальная конфигурация: хранилище выключено, загрузка
	// файлов недоступна, а регламент/эмблема остаются доступны по ссылке
	// (NFR-4).
	FileStorageDir string
	// RegulationsMaxBytes/EmblemMaxBytes — пороги размера загружаемого
	// файла на каждый вид (FR-32); допустимые типы — константы политики в
	// модуле tournament, а не конфигурация (plan.md — их расширение требует
	// поддержки в Sniff).
	RegulationsMaxBytes int64
	EmblemMaxBytes      int64

	// RateLimitRequests/RateLimitWindow — порог и окно ограничения частоты
	// запросов по адресу источника (спека 0042 FR-39/FR-42).
	RateLimitRequests int
	RateLimitWindow   time.Duration
	// RateLimitTrustProxy — доверять ли заголовку X-Forwarded-For при
	// определении адреса клиента. По умолчанию false: без доверенного
	// прокси перед сервером клиент мог бы подделать заголовок и обойти
	// ограничение (NFR-6).
	RateLimitTrustProxy bool
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
		PublicAppURL:              env("PUBLIC_APP_URL", "http://localhost:3000"),
		SMTPHost:                  env("SMTP_HOST", ""),
		SMTPPort:                  env("SMTP_PORT", ""),
		SMTPUsername:              env("SMTP_USERNAME", ""),
		SMTPPassword:              env("SMTP_PASSWORD", ""),
		SMTPFrom:                  env("SMTP_FROM", ""),
		FileStorageDir:            env("FILE_STORAGE_DIR", ""),
	}

	accessTTL, err := time.ParseDuration(env("JWT_ACCESS_TTL", "15m"))
	if err != nil {
		return Config{}, fmt.Errorf("parse JWT_ACCESS_TTL: %w", err)
	}
	refreshTTL, err := time.ParseDuration(env("JWT_REFRESH_TTL", "720h"))
	if err != nil {
		return Config{}, fmt.Errorf("parse JWT_REFRESH_TTL: %w", err)
	}
	passwordResetTTL, err := time.ParseDuration(env("PASSWORD_RESET_TTL", "30m"))
	if err != nil {
		return Config{}, fmt.Errorf("parse PASSWORD_RESET_TTL: %w", err)
	}
	cfg.JWTAccessTTL = accessTTL
	cfg.JWTRefreshTTL = refreshTTL
	cfg.PasswordResetTTL = passwordResetTTL

	emailTokenTTL, err := time.ParseDuration(env("EMAIL_TOKEN_TTL", "24h"))
	if err != nil {
		return Config{}, fmt.Errorf("parse EMAIL_TOKEN_TTL: %w", err)
	}
	cfg.EmailTokenTTL = emailTokenTTL

	rateLimitWindow, err := time.ParseDuration(env("RATE_LIMIT_WINDOW", "1m"))
	if err != nil {
		return Config{}, fmt.Errorf("parse RATE_LIMIT_WINDOW: %w", err)
	}
	cfg.RateLimitWindow = rateLimitWindow

	regulationsMaxBytes, err := envInt64("REGULATIONS_MAX_BYTES", 10485760)
	if err != nil {
		return Config{}, err
	}
	cfg.RegulationsMaxBytes = regulationsMaxBytes

	emblemMaxBytes, err := envInt64("EMBLEM_MAX_BYTES", 5242880)
	if err != nil {
		return Config{}, err
	}
	cfg.EmblemMaxBytes = emblemMaxBytes

	rateLimitRequests, err := envInt("RATE_LIMIT_REQUESTS", 20)
	if err != nil {
		return Config{}, err
	}
	cfg.RateLimitRequests = rateLimitRequests

	rateLimitTrustProxy, err := envBool("RATE_LIMIT_TRUST_PROXY", false)
	if err != nil {
		return Config{}, err
	}
	cfg.RateLimitTrustProxy = rateLimitTrustProxy

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

// envInt читает переменную окружения как int; пустая переменная — def,
// нечисловое значение — ошибка (по тому же простому паттерну, что env, без
// внешних библиотек парсинга).
func envInt(key string, def int) (int, error) {
	v := os.Getenv(key)
	if v == "" {
		return def, nil
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return 0, fmt.Errorf("parse %s: %w", key, err)
	}
	return n, nil
}

// envInt64 — как envInt, но для int64 (пороги размера файлов в байтах,
// FR-32).
func envInt64(key string, def int64) (int64, error) {
	v := os.Getenv(key)
	if v == "" {
		return def, nil
	}
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("parse %s: %w", key, err)
	}
	return n, nil
}

// envBool — как envInt, но для bool (strconv.ParseBool принимает
// "1"/"t"/"T"/"TRUE"/"true"/"True" и обратные для false).
func envBool(key string, def bool) (bool, error) {
	v := os.Getenv(key)
	if v == "" {
		return def, nil
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return false, fmt.Errorf("parse %s: %w", key, err)
	}
	return b, nil
}
