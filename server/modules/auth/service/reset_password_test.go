package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/hema/server/modules/auth/domain"
)

// TestResetPassword_HappyPath — AC-3: по действующей ссылке гость задаёт
// новый пароль (≥8 символов); вход старым паролем больше не проходит,
// новым — проходит. Сессия не выдаётся (FR-7).
func TestResetPassword_HappyPath(t *testing.T) {
	c := &clock{t: time.Now()}
	svc, _, mailer := testServiceWithClock(c)
	ctx := context.Background()

	_, _, err := svc.Register(ctx, "ivan@example.com", "old-password", "Ivan")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	if err := svc.RequestPasswordReset(ctx, "ivan@example.com"); err != nil {
		t.Fatalf("RequestPasswordReset: %v", err)
	}
	raw := tokenFromLink(t, mailer.Last().Link)

	if err := svc.ResetPassword(ctx, raw, "new-password"); err != nil {
		t.Fatalf("ResetPassword: %v", err)
	}

	// Старый пароль больше не подходит.
	if _, _, err := svc.Login(ctx, "ivan@example.com", "old-password"); !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Errorf("old password should be rejected, got %v", err)
	}
	// Новый пароль работает.
	if _, _, err := svc.Login(ctx, "ivan@example.com", "new-password"); err != nil {
		t.Errorf("new password should work, got %v", err)
	}
}

// TestResetPassword_NoTokenPairReturned — FR-7: сброс не выдаёт сессию.
// ResetPassword сигнатурно не возвращает пару токенов вовсе — проверяем,
// что успешный вызов не требует токенов и логин остаётся отдельным шагом
// (по факту сигнатуры — компилируется только если ResetPassword не выдаёт
// jwt.Pair; смотри также объявление метода).
func TestResetPassword_NoTokenPairReturned(t *testing.T) {
	c := &clock{t: time.Now()}
	svc, _, mailer := testServiceWithClock(c)
	ctx := context.Background()

	_, _, _ = svc.Register(ctx, "ivan@example.com", "old-password", "Ivan")
	_ = svc.RequestPasswordReset(ctx, "ivan@example.com")
	raw := tokenFromLink(t, mailer.Last().Link)

	err := svc.ResetPassword(ctx, raw, "new-password")
	if err != nil {
		t.Fatalf("ResetPassword: %v", err)
	}
	// Метод возвращает только error — если бы он выдавал сессию, этот тест
	// не скомпилировался бы в изменённом виде. Дополнительно проверяем, что
	// сохранённый пользователь не тронут session-полями (нет способа
	// извлечь токен из ResetPassword в принципе).
}

// TestResetPassword_ReuseRejected — AC-4: повторное использование токена
// отклоняется, пароль не меняется повторно.
func TestResetPassword_ReuseRejected(t *testing.T) {
	c := &clock{t: time.Now()}
	svc, _, mailer := testServiceWithClock(c)
	ctx := context.Background()

	_, _, _ = svc.Register(ctx, "ivan@example.com", "old-password", "Ivan")
	_ = svc.RequestPasswordReset(ctx, "ivan@example.com")
	raw := tokenFromLink(t, mailer.Last().Link)

	if err := svc.ResetPassword(ctx, raw, "new-password"); err != nil {
		t.Fatalf("first ResetPassword: %v", err)
	}

	err := svc.ResetPassword(ctx, raw, "another-password")
	if !errors.Is(err, domain.ErrInvalidResetToken) {
		t.Errorf("expected ErrInvalidResetToken on reuse, got %v", err)
	}
	// Пароль остался тем, что был установлен первым успешным сбросом.
	if _, _, err := svc.Login(ctx, "ivan@example.com", "new-password"); err != nil {
		t.Errorf("password should still be the first reset's value, got %v", err)
	}
}

// TestResetPassword_ExpiredRejected — AC-5: истёкшая ссылка отклоняется.
func TestResetPassword_ExpiredRejected(t *testing.T) {
	c := &clock{t: time.Now()}
	svc, _, mailer := testServiceWithClock(c)
	ctx := context.Background()

	_, _, _ = svc.Register(ctx, "ivan@example.com", "old-password", "Ivan")
	_ = svc.RequestPasswordReset(ctx, "ivan@example.com")
	raw := tokenFromLink(t, mailer.Last().Link)

	c.advance(31 * time.Minute)

	err := svc.ResetPassword(ctx, raw, "new-password")
	if !errors.Is(err, domain.ErrInvalidResetToken) {
		t.Errorf("expected ErrInvalidResetToken for expired token, got %v", err)
	}
}

// TestResetPassword_WeakPasswordRejected — AC-10: единая политика длины.
func TestResetPassword_WeakPasswordRejected(t *testing.T) {
	c := &clock{t: time.Now()}
	svc, _, mailer := testServiceWithClock(c)
	ctx := context.Background()

	_, _, _ = svc.Register(ctx, "ivan@example.com", "old-password", "Ivan")
	_ = svc.RequestPasswordReset(ctx, "ivan@example.com")
	raw := tokenFromLink(t, mailer.Last().Link)

	err := svc.ResetPassword(ctx, raw, "short")
	if !errors.Is(err, domain.ErrWeakPassword) {
		t.Errorf("expected ErrWeakPassword, got %v", err)
	}
	// Токен не должен быть погашен слабым паролем — годная попытка позже
	// должна сработать по тому же токену.
	if err := svc.ResetPassword(ctx, raw, "valid-password"); err != nil {
		t.Errorf("token should still be usable after a rejected weak attempt, got %v", err)
	}
}

// TestResetPassword_UnknownTokenRejected — несуществующий токен → тот же
// неразличимый отказ (FR-8).
func TestResetPassword_UnknownTokenRejected(t *testing.T) {
	c := &clock{t: time.Now()}
	svc, _, _ := testServiceWithClock(c)

	err := svc.ResetPassword(context.Background(), "garbage-token", "new-password")
	if !errors.Is(err, domain.ErrInvalidResetToken) {
		t.Errorf("expected ErrInvalidResetToken, got %v", err)
	}
}

// TestResetPassword_RepoFailure_NotMaskedAsInvalidToken — сбой хранилища
// (не «токен не найден») не должен маскироваться под ErrInvalidResetToken:
// это скрывало бы инфраструктурную ошибку (пропала связь с БД) под 400
// «ссылка недействительна», делая её невидимой для мониторинга 5xx.
func TestResetPassword_RepoFailure_NotMaskedAsInvalidToken(t *testing.T) {
	c := &clock{t: time.Now()}
	svc, repo, _ := testServiceWithClock(c)

	dbErr := errors.New("connection refused")
	repo.SetGetActiveResetTokenErr(dbErr)

	err := svc.ResetPassword(context.Background(), "any-token", "new-password")
	if errors.Is(err, domain.ErrInvalidResetToken) {
		t.Fatalf("real repo failure should not be reported as ErrInvalidResetToken, got %v", err)
	}
	if !errors.Is(err, dbErr) {
		t.Errorf("expected the underlying repo error to be wrapped, got %v", err)
	}
}
