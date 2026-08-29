package config

import "testing"

// baseEnv выставляет обязательные переменные (DATABASE_URL, JWT-секреты),
// без которых Load всегда падает — тесты этого файла проверяют остальные
// поля, не обязательность этих двух (уже покрыта существующим поведением).
func baseEnv(t *testing.T) {
	t.Helper()
	t.Setenv("DATABASE_URL", "postgres://localhost/test")
	t.Setenv("JWT_ACCESS_SECRET", "access-secret")
	t.Setenv("JWT_REFRESH_SECRET", "refresh-secret")
}

func TestLoad_MailDefaults(t *testing.T) {
	baseEnv(t)

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if cfg.PublicAppURL != "http://localhost:3000" {
		t.Errorf("PublicAppURL = %q, want default http://localhost:3000", cfg.PublicAppURL)
	}
	if cfg.PasswordResetTTL.String() != "30m0s" {
		t.Errorf("PasswordResetTTL = %v, want 30m", cfg.PasswordResetTTL)
	}
	if cfg.SMTPHost != "" {
		t.Errorf("SMTPHost = %q, want empty by default", cfg.SMTPHost)
	}
}

// TestLoad_EmptySMTPHostIsLegal — спека 0037 NFR-3: развёртывание без
// настроенного почтового сервера остаётся рабочим (Load не должен требовать
// SMTP_HOST). Композиция сервера сама выбирает лог-адаптер, когда он пуст.
func TestLoad_EmptySMTPHostIsLegal(t *testing.T) {
	baseEnv(t)
	t.Setenv("SMTP_HOST", "")

	if _, err := Load(); err != nil {
		t.Fatalf("Load() with empty SMTP_HOST error = %v, want nil", err)
	}
}

func TestLoad_MailOverrides(t *testing.T) {
	baseEnv(t)
	t.Setenv("PUBLIC_APP_URL", "https://hema.example")
	t.Setenv("PASSWORD_RESET_TTL", "45m")
	t.Setenv("SMTP_HOST", "smtp.example.com")
	t.Setenv("SMTP_PORT", "587")
	t.Setenv("SMTP_USERNAME", "bot")
	t.Setenv("SMTP_PASSWORD", "secret")
	t.Setenv("SMTP_FROM", "no-reply@hema.example")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if cfg.PublicAppURL != "https://hema.example" {
		t.Errorf("PublicAppURL = %q", cfg.PublicAppURL)
	}
	if cfg.PasswordResetTTL.String() != "45m0s" {
		t.Errorf("PasswordResetTTL = %v", cfg.PasswordResetTTL)
	}
	if cfg.SMTPHost != "smtp.example.com" || cfg.SMTPPort != "587" ||
		cfg.SMTPUsername != "bot" || cfg.SMTPPassword != "secret" ||
		cfg.SMTPFrom != "no-reply@hema.example" {
		t.Errorf("SMTP fields not wired: %+v", cfg)
	}
}

func TestLoad_InvalidPasswordResetTTL(t *testing.T) {
	baseEnv(t)
	t.Setenv("PASSWORD_RESET_TTL", "not-a-duration")

	if _, err := Load(); err == nil {
		t.Fatal("Load() error = nil, want error for invalid PASSWORD_RESET_TTL")
	}
}

// TestLoad_Spec0042Defaults — спека 0042: дефолты новых полей конфигурации
// (T21, значения из plan.md) при пустом окружении.
func TestLoad_Spec0042Defaults(t *testing.T) {
	baseEnv(t)

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if cfg.EmailTokenTTL.String() != "24h0m0s" {
		t.Errorf("EmailTokenTTL = %v, want 24h", cfg.EmailTokenTTL)
	}
	// FILE_STORAGE_DIR пуст по умолчанию — хранилище выключено (NFR-4), это
	// легальная конфигурация, не ошибка.
	if cfg.FileStorageDir != "" {
		t.Errorf("FileStorageDir = %q, want empty by default", cfg.FileStorageDir)
	}
	if cfg.RegulationsMaxBytes != 10485760 {
		t.Errorf("RegulationsMaxBytes = %d, want 10485760", cfg.RegulationsMaxBytes)
	}
	if cfg.EmblemMaxBytes != 5242880 {
		t.Errorf("EmblemMaxBytes = %d, want 5242880", cfg.EmblemMaxBytes)
	}
	if cfg.RateLimitRequests != 20 {
		t.Errorf("RateLimitRequests = %d, want 20", cfg.RateLimitRequests)
	}
	if cfg.RateLimitWindow.String() != "1m0s" {
		t.Errorf("RateLimitWindow = %v, want 1m", cfg.RateLimitWindow)
	}
	if cfg.RateLimitTrustProxy != false {
		t.Errorf("RateLimitTrustProxy = %v, want false by default (NFR-6)", cfg.RateLimitTrustProxy)
	}
}

// TestLoad_Spec0042Overrides — переопределение всех новых полей через
// окружение.
func TestLoad_Spec0042Overrides(t *testing.T) {
	baseEnv(t)
	t.Setenv("EMAIL_TOKEN_TTL", "48h")
	t.Setenv("FILE_STORAGE_DIR", "/data/files")
	t.Setenv("REGULATIONS_MAX_BYTES", "1000")
	t.Setenv("EMBLEM_MAX_BYTES", "2000")
	t.Setenv("RATE_LIMIT_REQUESTS", "5")
	t.Setenv("RATE_LIMIT_WINDOW", "30s")
	t.Setenv("RATE_LIMIT_TRUST_PROXY", "true")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if cfg.EmailTokenTTL.String() != "48h0m0s" {
		t.Errorf("EmailTokenTTL = %v, want 48h", cfg.EmailTokenTTL)
	}
	if cfg.FileStorageDir != "/data/files" {
		t.Errorf("FileStorageDir = %q, want /data/files", cfg.FileStorageDir)
	}
	if cfg.RegulationsMaxBytes != 1000 {
		t.Errorf("RegulationsMaxBytes = %d, want 1000", cfg.RegulationsMaxBytes)
	}
	if cfg.EmblemMaxBytes != 2000 {
		t.Errorf("EmblemMaxBytes = %d, want 2000", cfg.EmblemMaxBytes)
	}
	if cfg.RateLimitRequests != 5 {
		t.Errorf("RateLimitRequests = %d, want 5", cfg.RateLimitRequests)
	}
	if cfg.RateLimitWindow.String() != "30s" {
		t.Errorf("RateLimitWindow = %v, want 30s", cfg.RateLimitWindow)
	}
	if !cfg.RateLimitTrustProxy {
		t.Error("RateLimitTrustProxy = false, want true")
	}
}

func TestLoad_InvalidEmailTokenTTL(t *testing.T) {
	baseEnv(t)
	t.Setenv("EMAIL_TOKEN_TTL", "not-a-duration")

	if _, err := Load(); err == nil {
		t.Fatal("Load() error = nil, want error for invalid EMAIL_TOKEN_TTL")
	}
}

func TestLoad_InvalidRateLimitWindow(t *testing.T) {
	baseEnv(t)
	t.Setenv("RATE_LIMIT_WINDOW", "not-a-duration")

	if _, err := Load(); err == nil {
		t.Fatal("Load() error = nil, want error for invalid RATE_LIMIT_WINDOW")
	}
}

func TestLoad_InvalidRegulationsMaxBytes(t *testing.T) {
	baseEnv(t)
	t.Setenv("REGULATIONS_MAX_BYTES", "not-a-number")

	if _, err := Load(); err == nil {
		t.Fatal("Load() error = nil, want error for invalid REGULATIONS_MAX_BYTES")
	}
}

func TestLoad_InvalidEmblemMaxBytes(t *testing.T) {
	baseEnv(t)
	t.Setenv("EMBLEM_MAX_BYTES", "not-a-number")

	if _, err := Load(); err == nil {
		t.Fatal("Load() error = nil, want error for invalid EMBLEM_MAX_BYTES")
	}
}

func TestLoad_InvalidRateLimitRequests(t *testing.T) {
	baseEnv(t)
	t.Setenv("RATE_LIMIT_REQUESTS", "not-a-number")

	if _, err := Load(); err == nil {
		t.Fatal("Load() error = nil, want error for invalid RATE_LIMIT_REQUESTS")
	}
}

func TestLoad_InvalidRateLimitTrustProxy(t *testing.T) {
	baseEnv(t)
	t.Setenv("RATE_LIMIT_TRUST_PROXY", "not-a-bool")

	if _, err := Load(); err == nil {
		t.Fatal("Load() error = nil, want error for invalid RATE_LIMIT_TRUST_PROXY")
	}
}
