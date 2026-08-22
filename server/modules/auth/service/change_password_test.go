package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/hema/server/modules/auth/domain"
)

// TestChangePassword_HappyPath — AC-8: смена пароля с верным текущим и
// новым (≥8 символов) выдаёт новую пару, вход новым паролем проходит.
func TestChangePassword_HappyPath(t *testing.T) {
	svc, _ := testService()
	ctx := context.Background()

	_, tokens, err := svc.Register(ctx, "ivan@example.com", "old-password", "Ivan")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	newPair, err := svc.ChangePassword(ctx, tokens.Access, "old-password", "new-password")
	if err != nil {
		t.Fatalf("ChangePassword: %v", err)
	}
	if newPair.Access == "" || newPair.Refresh == "" {
		t.Error("new tokens should not be empty")
	}

	if _, _, err := svc.Login(ctx, "ivan@example.com", "new-password"); err != nil {
		t.Errorf("login with new password should work, got %v", err)
	}
	if _, _, err := svc.Login(ctx, "ivan@example.com", "old-password"); !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Errorf("login with old password should fail, got %v", err)
	}
}

// TestChangePassword_WrongCurrentPassword — AC-9: неверный текущий пароль —
// отказ, пароль не меняется.
func TestChangePassword_WrongCurrentPassword(t *testing.T) {
	svc, _ := testService()
	ctx := context.Background()

	_, tokens, err := svc.Register(ctx, "ivan@example.com", "old-password", "Ivan")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	_, err = svc.ChangePassword(ctx, tokens.Access, "wrong-current", "new-password")
	if !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Errorf("expected ErrInvalidCredentials, got %v", err)
	}

	if _, _, err := svc.Login(ctx, "ivan@example.com", "old-password"); err != nil {
		t.Errorf("old password should still work, got %v", err)
	}
}

// TestChangePassword_WeakNewPasswordRejected — AC-10: единая политика длины.
func TestChangePassword_WeakNewPasswordRejected(t *testing.T) {
	svc, _ := testService()
	ctx := context.Background()

	_, tokens, err := svc.Register(ctx, "ivan@example.com", "old-password", "Ivan")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	_, err = svc.ChangePassword(ctx, tokens.Access, "old-password", "short")
	if !errors.Is(err, domain.ErrWeakPassword) {
		t.Errorf("expected ErrWeakPassword, got %v", err)
	}
}

// TestChangePassword_InvalidAccessToken — без валидного access-токена отказ.
func TestChangePassword_InvalidAccessToken(t *testing.T) {
	svc, _ := testService()

	_, err := svc.ChangePassword(context.Background(), "garbage", "any", "new-password")
	if !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Errorf("expected ErrInvalidCredentials, got %v", err)
	}
}

// TestRefresh_RejectsTokenIssuedBeforePasswordChange — AC-11: продление
// сессии, выданной до смены пароля, отклоняется; свежая пара (выданная
// ChangePassword) продлевается нормально. Часы реальные (не fake-clock):
// нужна фактическая секундная граница между старым iat и PasswordChangedAt,
// а выдача JWT (pkg/jwt) не параметризуется временем — искусственно
// перематывать её нельзя, не трогая pkg/jwt (вне зоны ответственности).
func TestRefresh_RejectsTokenIssuedBeforePasswordChange(t *testing.T) {
	svc, _ := testService()
	ctx := context.Background()

	_, oldTokens, err := svc.Register(ctx, "ivan@example.com", "old-password", "Ivan")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	// Гарантируем, что PasswordChangedAt окажется в следующей целой секунде
	// относительно iat старого refresh-токена (усечение до секунды, решение
	// плана 0037).
	time.Sleep(1100 * time.Millisecond)

	newTokens, err := svc.ChangePassword(ctx, oldTokens.Access, "old-password", "new-password")
	if err != nil {
		t.Fatalf("ChangePassword: %v", err)
	}

	// Старый refresh (выдан до смены пароля) больше не продлевается.
	if _, err := svc.Refresh(ctx, oldTokens.Refresh); !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Errorf("old refresh token should be rejected after password change, got %v", err)
	}

	// Новый refresh (выдан вместе со сменой пароля) работает.
	if _, err := svc.Refresh(ctx, newTokens.Refresh); err != nil {
		t.Errorf("new refresh token should still work, got %v", err)
	}
}
