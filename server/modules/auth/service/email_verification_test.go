package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/hema/server/modules/auth/domain"
)

// TestRegister_SendsVerificationMail — FR-3: регистрация отправляет письмо
// подтверждения на указанный адрес.
func TestRegister_SendsVerificationMail(t *testing.T) {
	c := &clock{t: time.Now()}
	svc, _, mailer := testServiceWithClock(c)

	_, _, err := svc.Register(context.Background(), "ivan@example.com", "password1", "Ivan")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	sent := mailer.LastVerification()
	if sent == nil {
		t.Fatal("expected verification mail to be sent")
	}
	if sent.To != "ivan@example.com" {
		t.Errorf("To = %q", sent.To)
	}
	if sent.Link == "" {
		t.Error("verification link should not be empty")
	}
}

// TestRegister_VerificationMailerErrorDoesNotFailRegistration — почта
// побочный эффект: сбой отправки не должен ронять регистрацию.
func TestRegister_VerificationMailerErrorDoesNotFailRegistration(t *testing.T) {
	c := &clock{t: time.Now()}
	svc, _, mailer := testServiceWithClock(c)
	mailer.Err = errors.New("smtp: connection refused")

	_, _, err := svc.Register(context.Background(), "ivan@example.com", "password1", "Ivan")
	if err != nil {
		t.Fatalf("Register should not fail when verification mail fails to send, got %v", err)
	}
}

// TestVerifyEmail_HappyPath — AC: подтверждение по валидному токену
// переводит EmailVerifiedAt в не-nil.
func TestVerifyEmail_HappyPath(t *testing.T) {
	c := &clock{t: time.Now()}
	svc, repo, mailer := testServiceWithClock(c)

	user, _, err := svc.Register(context.Background(), "ivan@example.com", "password1", "Ivan")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	raw := tokenFromLink(t, mailer.LastVerification().Link)

	if err := svc.VerifyEmail(context.Background(), raw); err != nil {
		t.Fatalf("VerifyEmail: %v", err)
	}

	got, err := repo.GetUserByID(context.Background(), user.ID)
	if err != nil {
		t.Fatalf("GetUserByID: %v", err)
	}
	if got.EmailVerifiedAt == nil {
		t.Fatal("EmailVerifiedAt should be set after verification")
	}
}

// TestVerifyEmail_ExpiredTokenRejected — просроченный токен →
// ErrInvalidEmailToken.
func TestVerifyEmail_ExpiredTokenRejected(t *testing.T) {
	c := &clock{t: time.Now()}
	svc, _, mailer := testServiceWithClock(c)

	_, _, err := svc.Register(context.Background(), "ivan@example.com", "password1", "Ivan")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	raw := tokenFromLink(t, mailer.LastVerification().Link)

	c.advance(31 * time.Minute) // TTL в тестовом сервисе — 30 минут

	if err := svc.VerifyEmail(context.Background(), raw); !errors.Is(err, domain.ErrInvalidEmailToken) {
		t.Errorf("expected ErrInvalidEmailToken for expired token, got %v", err)
	}
}

// TestVerifyEmail_UsedTokenRejected — повторное использование того же
// токена → ErrInvalidEmailToken.
func TestVerifyEmail_UsedTokenRejected(t *testing.T) {
	c := &clock{t: time.Now()}
	svc, _, mailer := testServiceWithClock(c)

	_, _, err := svc.Register(context.Background(), "ivan@example.com", "password1", "Ivan")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	raw := tokenFromLink(t, mailer.LastVerification().Link)

	if err := svc.VerifyEmail(context.Background(), raw); err != nil {
		t.Fatalf("first VerifyEmail: %v", err)
	}
	if err := svc.VerifyEmail(context.Background(), raw); !errors.Is(err, domain.ErrInvalidEmailToken) {
		t.Errorf("expected ErrInvalidEmailToken on reuse, got %v", err)
	}
}

// TestVerifyEmail_UnknownTokenRejected — несуществующий токен →
// ErrInvalidEmailToken (тот же код, что и просроченный/погашенный — не
// раскрывает причину).
func TestVerifyEmail_UnknownTokenRejected(t *testing.T) {
	c := &clock{t: time.Now()}
	svc, _, _ := testServiceWithClock(c)

	if err := svc.VerifyEmail(context.Background(), "does-not-exist"); !errors.Is(err, domain.ErrInvalidEmailToken) {
		t.Errorf("expected ErrInvalidEmailToken, got %v", err)
	}
}

// TestResendEmailVerification_ThrottledWithinMinute — повторная отправка
// раньше минуты → ErrThrottled, письмо не уходит повторно.
func TestResendEmailVerification_ThrottledWithinMinute(t *testing.T) {
	c := &clock{t: time.Now()}
	svc, _, mailer := testServiceWithClock(c)

	user, _, err := svc.Register(context.Background(), "ivan@example.com", "password1", "Ivan")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	mailer.Reset()

	c.advance(30 * time.Second)
	err = svc.ResendEmailVerification(context.Background(), user.ID)
	if !errors.Is(err, domain.ErrThrottled) {
		t.Errorf("expected ErrThrottled, got %v", err)
	}
	if mailer.LastVerification() != nil {
		t.Error("expected no mail sent while throttled")
	}
}

// TestResendEmailVerification_AfterMinute_InvalidatesPriorToken — повторный
// запрос спустя минуту гасит прежний токен и выдаёт новый; старый токен
// после этого тоже даёт ErrInvalidEmailToken.
func TestResendEmailVerification_AfterMinute_InvalidatesPriorToken(t *testing.T) {
	c := &clock{t: time.Now()}
	svc, _, mailer := testServiceWithClock(c)

	user, _, err := svc.Register(context.Background(), "ivan@example.com", "password1", "Ivan")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	firstRaw := tokenFromLink(t, mailer.LastVerification().Link)
	mailer.Reset()

	c.advance(61 * time.Second)
	if err := svc.ResendEmailVerification(context.Background(), user.ID); err != nil {
		t.Fatalf("ResendEmailVerification: %v", err)
	}
	second := mailer.LastVerification()
	if second == nil {
		t.Fatal("expected a second verification mail after throttle window elapsed")
	}
	secondRaw := tokenFromLink(t, second.Link)
	if secondRaw == firstRaw {
		t.Fatal("second token should differ from the first")
	}

	// Прежний токен погашен — тоже даёт ErrInvalidEmailToken.
	if err := svc.VerifyEmail(context.Background(), firstRaw); !errors.Is(err, domain.ErrInvalidEmailToken) {
		t.Errorf("prior token should be invalidated by the new request, got %v", err)
	}
	// Новый токен активен.
	if err := svc.VerifyEmail(context.Background(), secondRaw); err != nil {
		t.Errorf("new token should be active, got %v", err)
	}
}
