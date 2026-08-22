package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/hema/server/modules/auth/domain"
	"github.com/hema/server/modules/auth/testutil"
	"github.com/hema/server/pkg/crypto"
	"github.com/hema/server/pkg/jwt"
)

func testService() (*Service, *testutil.FakeRepo) {
	svc, repo, _ := testServiceWithMailer()
	return svc, repo
}

// testServiceWithMailer создаёт сервис с реальными часами (time.Now) — для
// тестов, которым не важна детерминированность TTL/троттлинга сброса пароля.
// Тесты сброса пароля (password_reset_test.go) используют собственный
// конструктор с управляемыми часами.
func testServiceWithMailer() (*Service, *testutil.FakeRepo, *testutil.FakeMailer) {
	repo := testutil.NewFakeRepo()
	mailer := testutil.NewFakeMailer()
	tokens := jwt.NewManager("access-secret", "refresh-secret", 15*time.Minute, 720*time.Hour)
	svc := New(repo, tokens, mailer, "https://app.hema.test", 30*time.Minute, time.Now)
	return svc, repo, mailer
}

func TestRegister_HappyPath(t *testing.T) {
	svc, _ := testService()

	user, tokens, err := svc.Register(context.Background(), "knight@hema.test", "longsword123", "Sir Test")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	if user.Email != "knight@hema.test" {
		t.Errorf("Email = %q", user.Email)
	}
	if user.DisplayName != "Sir Test" {
		t.Errorf("DisplayName = %q", user.DisplayName)
	}
	if user.ID == "" {
		t.Error("ID should not be empty")
	}
	if tokens.Access == "" || tokens.Refresh == "" {
		t.Error("tokens should not be empty")
	}
}

func TestRegister_NormalizesEmail(t *testing.T) {
	svc, _ := testService()

	user, _, err := svc.Register(context.Background(), "  Knight@HEMA.Test  ", "password1", "Name")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	if user.Email != "knight@hema.test" {
		t.Errorf("Email not normalized: %q", user.Email)
	}
}

func TestRegister_DuplicateEmail(t *testing.T) {
	svc, _ := testService()

	_, _, err := svc.Register(context.Background(), "dup@hema.test", "password1", "First")
	if err != nil {
		t.Fatalf("first Register: %v", err)
	}

	_, _, err = svc.Register(context.Background(), "dup@hema.test", "password1", "Second")
	if !errors.Is(err, domain.ErrUserExists) {
		t.Errorf("expected ErrUserExists, got %v", err)
	}
}

func TestRegister_EmptyFields(t *testing.T) {
	svc, _ := testService()

	cases := []struct {
		name     string
		email    string
		password string
	}{
		{"empty email", "", "password1"},
		{"empty password", "a@b.test", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, _, err := svc.Register(context.Background(), tc.email, tc.password, "Name")
			if !errors.Is(err, domain.ErrInvalidCredentials) {
				t.Errorf("expected ErrInvalidCredentials, got %v", err)
			}
		})
	}
}

func TestRegister_PasswordIsHashed(t *testing.T) {
	svc, repo := testService()

	_, _, err := svc.Register(context.Background(), "hash@hema.test", "plain-pass", "Name")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	_, storedHash, err := repo.GetCredentialsByEmail(context.Background(), "hash@hema.test")
	if err != nil {
		t.Fatalf("GetCredentialsByEmail: %v", err)
	}
	if storedHash == "plain-pass" {
		t.Error("password should be hashed, not stored in plain text")
	}
	ok, _ := crypto.VerifyPassword("plain-pass", storedHash)
	if !ok {
		t.Error("stored hash should verify against original password")
	}
}

func TestLogin_HappyPath(t *testing.T) {
	svc, _ := testService()

	_, _, err := svc.Register(context.Background(), "login@hema.test", "mypassword", "Login User")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	user, tokens, err := svc.Login(context.Background(), "login@hema.test", "mypassword")
	if err != nil {
		t.Fatalf("Login: %v", err)
	}
	if user.Email != "login@hema.test" {
		t.Errorf("Email = %q", user.Email)
	}
	if tokens.Access == "" {
		t.Error("access token should not be empty")
	}
}

func TestLogin_WrongPassword(t *testing.T) {
	svc, _ := testService()

	_, _, _ = svc.Register(context.Background(), "login@hema.test", "correct-pass", "User")

	_, _, err := svc.Login(context.Background(), "login@hema.test", "wrong-pass")
	if !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Errorf("expected ErrInvalidCredentials, got %v", err)
	}
}

func TestLogin_NonexistentUser(t *testing.T) {
	svc, _ := testService()

	_, _, err := svc.Login(context.Background(), "ghost@hema.test", "password1")
	if !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Errorf("expected ErrInvalidCredentials (not ErrUserNotFound), got %v", err)
	}
}

func TestRefresh_HappyPath(t *testing.T) {
	svc, _ := testService()

	_, tokens, err := svc.Register(context.Background(), "refresh@hema.test", "password1", "User")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	newPair, err := svc.Refresh(context.Background(), tokens.Refresh)
	if err != nil {
		t.Fatalf("Refresh: %v", err)
	}
	if newPair.Access == "" || newPair.Refresh == "" {
		t.Error("new tokens should not be empty")
	}
}

func TestRefresh_InvalidToken(t *testing.T) {
	svc, _ := testService()

	_, err := svc.Refresh(context.Background(), "garbage-token")
	if !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Errorf("expected ErrInvalidCredentials, got %v", err)
	}
}

func TestRefresh_AccessTokenRejected(t *testing.T) {
	svc, _ := testService()

	_, tokens, _ := svc.Register(context.Background(), "rt@hema.test", "password1", "User")

	_, err := svc.Refresh(context.Background(), tokens.Access)
	if !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Errorf("access token should not work as refresh, got %v", err)
	}
}

func TestMe_HappyPath(t *testing.T) {
	svc, _ := testService()

	_, tokens, err := svc.Register(context.Background(), "me@hema.test", "password1", "Me User")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	user, err := svc.Me(context.Background(), tokens.Access)
	if err != nil {
		t.Fatalf("Me: %v", err)
	}
	if user.Email != "me@hema.test" {
		t.Errorf("Email = %q", user.Email)
	}
}

func TestMe_InvalidToken(t *testing.T) {
	svc, _ := testService()

	_, err := svc.Me(context.Background(), "garbage")
	if !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Errorf("expected ErrInvalidCredentials, got %v", err)
	}
}

func TestMe_RefreshTokenRejected(t *testing.T) {
	svc, _ := testService()

	_, tokens, _ := svc.Register(context.Background(), "rt@hema.test", "password1", "User")

	_, err := svc.Me(context.Background(), tokens.Refresh)
	if !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Errorf("refresh token should not work as access, got %v", err)
	}
}

func TestDisplayNames_HappyPath(t *testing.T) {
	svc, _ := testService()
	ctx := context.Background()

	u1, _, err := svc.Register(ctx, "one@hema.test", "password1", "Fighter One")
	if err != nil {
		t.Fatalf("Register 1: %v", err)
	}
	u2, _, err := svc.Register(ctx, "two@hema.test", "password1", "Fighter Two")
	if err != nil {
		t.Fatalf("Register 2: %v", err)
	}

	names, err := svc.DisplayNames(ctx, []string{u1.ID, u2.ID})
	if err != nil {
		t.Fatalf("DisplayNames: %v", err)
	}
	if names[u1.ID] != "Fighter One" {
		t.Errorf("names[u1.ID] = %q, want %q", names[u1.ID], "Fighter One")
	}
	if names[u2.ID] != "Fighter Two" {
		t.Errorf("names[u2.ID] = %q, want %q", names[u2.ID], "Fighter Two")
	}
}

func TestDisplayNames_UnknownIDSkippedGracefully(t *testing.T) {
	svc, _ := testService()
	ctx := context.Background()

	u1, _, err := svc.Register(ctx, "known@hema.test", "password1", "Known User")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	names, err := svc.DisplayNames(ctx, []string{u1.ID, "00000000-0000-0000-0000-000000000000"})
	if err != nil {
		t.Fatalf("DisplayNames: %v", err)
	}
	if len(names) != 1 {
		t.Fatalf("expected only known id in result, got %+v", names)
	}
	if names[u1.ID] != "Known User" {
		t.Errorf("names[u1.ID] = %q, want %q", names[u1.ID], "Known User")
	}
}

func TestDisplayNames_EmptyInput(t *testing.T) {
	svc, _ := testService()

	names, err := svc.DisplayNames(context.Background(), nil)
	if err != nil {
		t.Fatalf("DisplayNames: %v", err)
	}
	if len(names) != 0 {
		t.Fatalf("expected empty map, got %+v", names)
	}
}
