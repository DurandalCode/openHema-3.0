package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/hema/server/modules/auth/domain"
	"github.com/hema/server/modules/auth/testutil"
	"github.com/hema/server/pkg/jwt"
)

// clock — управляемый источник времени для детерминированных тестов TTL/
// троттлинга сброса пароля.
type clock struct {
	t time.Time
}

func (c *clock) now() time.Time          { return c.t }
func (c *clock) advance(d time.Duration) { c.t = c.t.Add(d) }

func testServiceWithClock(c *clock) (*Service, *testutil.FakeRepo, *testutil.FakeMailer) {
	repo := testutil.NewFakeRepo()
	repo.SetNow(c.now) // репо и сервис должны видеть одно и то же время
	mailer := testutil.NewFakeMailer()
	tokens := jwt.NewManager("access-secret", "refresh-secret", 15*time.Minute, 720*time.Hour)
	svc := New(repo, tokens, mailer, "https://app.hema.test", 30*time.Minute, c.now)
	return svc, repo, mailer
}

// tokenFromLink извлекает сырой токен восстановления из ссылки письма.
func tokenFromLink(t *testing.T, link string) string {
	t.Helper()
	u, err := url.Parse(link)
	if err != nil {
		t.Fatalf("parse link: %v", err)
	}
	tok := u.Query().Get("token")
	if tok == "" {
		t.Fatalf("link has no token: %q", link)
	}
	return tok
}

func hashRawToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

// TestRequestPasswordReset_NonexistentEmail_SilentSuccess — AC-2: ответ
// одинаков независимо от существования аккаунта, письмо не отправляется.
func TestRequestPasswordReset_NonexistentEmail_SilentSuccess(t *testing.T) {
	c := &clock{t: time.Now()}
	svc, _, mailer := testServiceWithClock(c)

	err := svc.RequestPasswordReset(context.Background(), "nobody@example.com")
	if err != nil {
		t.Fatalf("RequestPasswordReset: %v", err)
	}
	if mailer.Last() != nil {
		t.Errorf("expected no mail sent, got %+v", mailer.Last())
	}
}

// TestRequestPasswordReset_ExistingEmail_SendsMailWithToken — AC-1: письмо
// уходит на существующий адрес, ссылка содержит выданный токен, в
// репозитории лежит только его sha256-хеш (NFR-1).
func TestRequestPasswordReset_ExistingEmail_SendsMailWithToken(t *testing.T) {
	c := &clock{t: time.Now()}
	svc, repo, mailer := testServiceWithClock(c)

	_, _, err := svc.Register(context.Background(), "ivan@example.com", "password1", "Ivan")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	err = svc.RequestPasswordReset(context.Background(), "ivan@example.com")
	if err != nil {
		t.Fatalf("RequestPasswordReset: %v", err)
	}

	sent := mailer.Last()
	if sent == nil {
		t.Fatal("expected mail to be sent")
	}
	if sent.To != "ivan@example.com" {
		t.Errorf("To = %q", sent.To)
	}
	raw := tokenFromLink(t, sent.Link)

	// Активный токен находится по хешу сырого значения...
	active, err := repo.GetActiveResetToken(context.Background(), hashRawToken(raw))
	if err != nil {
		t.Fatalf("GetActiveResetToken(hash): %v", err)
	}
	if active.TokenHash != hashRawToken(raw) {
		t.Errorf("stored hash mismatch")
	}
	// ...но не по самому сырому токену (NFR-1: хранится только хеш).
	if _, err := repo.GetActiveResetToken(context.Background(), raw); !errors.Is(err, domain.ErrInvalidResetToken) {
		t.Error("raw token should not be usable as a repo key — only its hash is stored")
	}
}

// TestRequestPasswordReset_ThrottledWithinMinute — AC-7: повтор в пределах
// минуты не порождает второго письма, ответ остаётся успешным.
func TestRequestPasswordReset_ThrottledWithinMinute(t *testing.T) {
	c := &clock{t: time.Now()}
	svc, _, mailer := testServiceWithClock(c)

	_, _, _ = svc.Register(context.Background(), "ivan@example.com", "password1", "Ivan")

	if err := svc.RequestPasswordReset(context.Background(), "ivan@example.com"); err != nil {
		t.Fatalf("first RequestPasswordReset: %v", err)
	}
	firstLink := mailer.Last().Link
	mailer.Reset()

	c.advance(30 * time.Second)
	if err := svc.RequestPasswordReset(context.Background(), "ivan@example.com"); err != nil {
		t.Fatalf("second RequestPasswordReset: %v", err)
	}
	if mailer.Last() != nil {
		t.Errorf("expected no second mail within throttle window, got %+v", mailer.Last())
	}
	_ = firstLink
}

// TestRequestPasswordReset_AfterMinute_InvalidatesPriorToken — AC-6: повтор
// спустя более минуты гасит прежний токен, выдаёт новый.
func TestRequestPasswordReset_AfterMinute_InvalidatesPriorToken(t *testing.T) {
	c := &clock{t: time.Now()}
	svc, repo, mailer := testServiceWithClock(c)

	_, _, _ = svc.Register(context.Background(), "ivan@example.com", "password1", "Ivan")

	if err := svc.RequestPasswordReset(context.Background(), "ivan@example.com"); err != nil {
		t.Fatalf("first RequestPasswordReset: %v", err)
	}
	firstRaw := tokenFromLink(t, mailer.Last().Link)
	mailer.Reset()

	c.advance(61 * time.Second)
	if err := svc.RequestPasswordReset(context.Background(), "ivan@example.com"); err != nil {
		t.Fatalf("second RequestPasswordReset: %v", err)
	}
	if mailer.Last() == nil {
		t.Fatal("expected a second mail after throttle window elapsed")
	}
	secondRaw := tokenFromLink(t, mailer.Last().Link)
	if secondRaw == firstRaw {
		t.Fatal("second token should differ from the first")
	}

	// Прежний токен погашен.
	if _, err := repo.GetActiveResetToken(context.Background(), hashRawToken(firstRaw)); !errors.Is(err, domain.ErrInvalidResetToken) {
		t.Error("prior token should be invalidated by the new request")
	}
	// Новый токен активен.
	if _, err := repo.GetActiveResetToken(context.Background(), hashRawToken(secondRaw)); err != nil {
		t.Errorf("new token should be active, got %v", err)
	}
}

// TestRequestPasswordReset_MailerErrorDoesNotSurface — NFR-2: сбой отправки
// не превращается в ошибку RPC (сервис молча продолжает считать это успехом
// с точки зрения гостя), а вызывающий код может залогировать ошибку.
func TestRequestPasswordReset_MailerErrorDoesNotSurface(t *testing.T) {
	c := &clock{t: time.Now()}
	svc, _, mailer := testServiceWithClock(c)
	mailer.Err = errors.New("smtp: connection refused")

	_, _, _ = svc.Register(context.Background(), "ivan@example.com", "password1", "Ivan")

	err := svc.RequestPasswordReset(context.Background(), "ivan@example.com")
	if err != nil {
		t.Fatalf("RequestPasswordReset should not surface mailer error, got %v", err)
	}
}

// TestRequestPasswordReset_EmailNormalized проверяет, что поиск идёт по
// нормализованному email (регистр/пробелы не имеют значения).
func TestRequestPasswordReset_EmailNormalized(t *testing.T) {
	c := &clock{t: time.Now()}
	svc, _, mailer := testServiceWithClock(c)

	_, _, _ = svc.Register(context.Background(), "ivan@example.com", "password1", "Ivan")

	err := svc.RequestPasswordReset(context.Background(), "  Ivan@Example.com  ")
	if err != nil {
		t.Fatalf("RequestPasswordReset: %v", err)
	}
	if mailer.Last() == nil {
		t.Fatal("expected mail to be sent for normalized email match")
	}
}

// TestRequestPasswordReset_LinkContainsPublicAppURL — ссылка строится из
// publicAppURL, ведёт на /reset-password с токеном в query.
func TestRequestPasswordReset_LinkContainsPublicAppURL(t *testing.T) {
	c := &clock{t: time.Now()}
	svc, _, mailer := testServiceWithClock(c)

	_, _, _ = svc.Register(context.Background(), "ivan@example.com", "password1", "Ivan")
	if err := svc.RequestPasswordReset(context.Background(), "ivan@example.com"); err != nil {
		t.Fatalf("RequestPasswordReset: %v", err)
	}

	link := mailer.Last().Link
	if !strings.HasPrefix(link, "https://app.hema.test/reset-password?token=") {
		t.Errorf("unexpected link shape: %q", link)
	}
}
