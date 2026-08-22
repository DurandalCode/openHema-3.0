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
