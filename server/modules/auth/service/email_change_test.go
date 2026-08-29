package service

import (
	"context"
	"errors"
	"testing"

	"github.com/hema/server/modules/auth/domain"
)

// TestRequestEmailChange_WrongCurrentPassword — неверный текущий пароль → отказ.
func TestRequestEmailChange_WrongCurrentPassword(t *testing.T) {
	svc, _ := testService()
	ctx := context.Background()

	user, _, err := svc.Register(ctx, "ivan@example.com", "old-password", "Ivan")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	_, err = svc.RequestEmailChange(ctx, user.ID, "new@example.com", "wrong-password")
	if !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Errorf("expected ErrInvalidCredentials, got %v", err)
	}
}

// TestRequestEmailChange_TakenAddress — новый адрес занят другой учёткой.
func TestRequestEmailChange_TakenAddress(t *testing.T) {
	svc, _ := testService()
	ctx := context.Background()

	user, _, err := svc.Register(ctx, "ivan@example.com", "old-password", "Ivan")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	_, _, err = svc.Register(ctx, "taken@example.com", "password1", "Other")
	if err != nil {
		t.Fatalf("Register other: %v", err)
	}

	_, err = svc.RequestEmailChange(ctx, user.ID, "taken@example.com", "old-password")
	if !errors.Is(err, domain.ErrEmailTaken) {
		t.Errorf("expected ErrEmailTaken, got %v", err)
	}
}

// TestRequestEmailChange_HappyPath — AC-4: адрес учётки не меняется до
// подтверждения; PendingEmail виден; предупреждение уходит на прежний
// адрес; подтверждение — на новый.
func TestRequestEmailChange_HappyPath(t *testing.T) {
	svc, repo, mailer := testServiceWithMailer()
	ctx := context.Background()

	user, _, err := svc.Register(ctx, "ivan@example.com", "old-password", "Ivan")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	mailer.Reset()

	updated, err := svc.RequestEmailChange(ctx, user.ID, "new@example.com", "old-password")
	if err != nil {
		t.Fatalf("RequestEmailChange: %v", err)
	}
	if updated.Email != "ivan@example.com" {
		t.Errorf("Email should remain unchanged before confirmation, got %q", updated.Email)
	}
	if updated.PendingEmail != "new@example.com" {
		t.Errorf("PendingEmail = %q, want %q", updated.PendingEmail, "new@example.com")
	}

	got, err := repo.GetUserByID(ctx, user.ID)
	if err != nil {
		t.Fatalf("GetUserByID: %v", err)
	}
	if got.Email != "ivan@example.com" || got.PendingEmail != "new@example.com" {
		t.Errorf("stored user = %+v, want unchanged email + pending new@example.com", got)
	}

	confirmation := mailer.LastChangeConfirmation()
	if confirmation == nil || confirmation.To != "new@example.com" {
		t.Errorf("expected confirmation mail to new address, got %+v", confirmation)
	}
	notice := mailer.LastChangeNotice()
	if notice == nil || notice.OldAddr != "ivan@example.com" || notice.NewAddr != "new@example.com" {
		t.Errorf("expected notice mail to old address, got %+v", notice)
	}
}

// TestConfirmEmailChange_HappyPath — подтверждение меняет адрес и
// сбрасывает признак подтверждённости (см. tasks.md T8), очищает PendingEmail.
func TestConfirmEmailChange_HappyPath(t *testing.T) {
	svc, repo, mailer := testServiceWithMailer()
	ctx := context.Background()

	user, _, err := svc.Register(ctx, "ivan@example.com", "old-password", "Ivan")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	// Подтвердим исходный адрес, чтобы убедиться, что смена его сбрасывает.
	verifyRaw := tokenFromLink(t, mailer.LastVerification().Link)
	if err := svc.VerifyEmail(ctx, verifyRaw); err != nil {
		t.Fatalf("VerifyEmail: %v", err)
	}

	if _, err := svc.RequestEmailChange(ctx, user.ID, "new@example.com", "old-password"); err != nil {
		t.Fatalf("RequestEmailChange: %v", err)
	}
	changeRaw := tokenFromLink(t, mailer.LastChangeConfirmation().Link)

	updated, err := svc.ConfirmEmailChange(ctx, changeRaw)
	if err != nil {
		t.Fatalf("ConfirmEmailChange: %v", err)
	}
	if updated.Email != "new@example.com" {
		t.Errorf("Email = %q, want %q", updated.Email, "new@example.com")
	}
	if updated.PendingEmail != "" {
		t.Errorf("PendingEmail should be cleared, got %q", updated.PendingEmail)
	}
	if updated.EmailVerifiedAt != nil {
		t.Error("EmailVerifiedAt should be reset after email change")
	}

	got, err := repo.GetUserByID(ctx, user.ID)
	if err != nil {
		t.Fatalf("GetUserByID: %v", err)
	}
	if got.Email != "new@example.com" {
		t.Errorf("stored email = %q, want %q", got.Email, "new@example.com")
	}
}

// TestConfirmEmailChange_TakenAtConfirmation — AC-5: адрес занят к моменту
// перехода по ссылке → отказ, адрес учётки не меняется, токен не погашен.
func TestConfirmEmailChange_TakenAtConfirmation(t *testing.T) {
	svc, repo, mailer := testServiceWithMailer()
	ctx := context.Background()

	user, _, err := svc.Register(ctx, "ivan@example.com", "old-password", "Ivan")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	if _, err := svc.RequestEmailChange(ctx, user.ID, "new@example.com", "old-password"); err != nil {
		t.Fatalf("RequestEmailChange: %v", err)
	}
	changeRaw := tokenFromLink(t, mailer.LastChangeConfirmation().Link)

	// Кто-то другой занял адрес, пока ссылка не была использована.
	if _, _, err := svc.Register(ctx, "new@example.com", "password1", "Someone Else"); err != nil {
		t.Fatalf("Register other: %v", err)
	}

	_, err = svc.ConfirmEmailChange(ctx, changeRaw)
	if !errors.Is(err, domain.ErrEmailTaken) {
		t.Errorf("expected ErrEmailTaken, got %v", err)
	}

	got, err := repo.GetUserByID(ctx, user.ID)
	if err != nil {
		t.Fatalf("GetUserByID: %v", err)
	}
	if got.Email != "ivan@example.com" {
		t.Errorf("email should remain unchanged, got %q", got.Email)
	}
}

// TestConfirmEmailChange_InvalidToken — несуществующий/просроченный/
// погашенный токен → ErrInvalidEmailToken.
func TestConfirmEmailChange_InvalidToken(t *testing.T) {
	svc, _ := testService()
	ctx := context.Background()

	_, err := svc.ConfirmEmailChange(ctx, "does-not-exist")
	if !errors.Is(err, domain.ErrInvalidEmailToken) {
		t.Errorf("expected ErrInvalidEmailToken, got %v", err)
	}
}

// TestCancelEmailChange_ClearsPendingRequest — отмена очищает запрос:
// PendingEmail пуст, прежний токен подтверждения больше не действует.
func TestCancelEmailChange_ClearsPendingRequest(t *testing.T) {
	svc, repo, mailer := testServiceWithMailer()
	ctx := context.Background()

	user, _, err := svc.Register(ctx, "ivan@example.com", "old-password", "Ivan")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	if _, err := svc.RequestEmailChange(ctx, user.ID, "new@example.com", "old-password"); err != nil {
		t.Fatalf("RequestEmailChange: %v", err)
	}
	changeRaw := tokenFromLink(t, mailer.LastChangeConfirmation().Link)

	updated, err := svc.CancelEmailChange(ctx, user.ID)
	if err != nil {
		t.Fatalf("CancelEmailChange: %v", err)
	}
	if updated.PendingEmail != "" {
		t.Errorf("PendingEmail should be cleared after cancel, got %q", updated.PendingEmail)
	}

	got, err := repo.GetUserByID(ctx, user.ID)
	if err != nil {
		t.Fatalf("GetUserByID: %v", err)
	}
	if got.PendingEmail != "" {
		t.Errorf("stored PendingEmail should be cleared, got %q", got.PendingEmail)
	}

	if _, err := svc.ConfirmEmailChange(ctx, changeRaw); !errors.Is(err, domain.ErrInvalidEmailToken) {
		t.Errorf("cancelled token should no longer confirm, got %v", err)
	}
}
