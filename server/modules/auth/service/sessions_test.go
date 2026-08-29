package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/hema/server/modules/auth/domain"
)

// sessionIDOf декодирует sid из refresh-токена (white-box: тесты живут в
// том же пакете service, что и Service.tokens).
func sessionIDOf(t *testing.T, svc *Service, refreshToken string) string {
	t.Helper()
	claims, err := svc.tokens.ParseRefresh(refreshToken)
	if err != nil {
		t.Fatalf("ParseRefresh: %v", err)
	}
	if claims.SessionID == "" {
		t.Fatal("refresh token should carry sid")
	}
	return claims.SessionID
}

// TestRegister_CreatesSession — FR-10: регистрация создаёт запись сессии,
// её id — в клейме sid выданного refresh-токена.
func TestRegister_CreatesSession(t *testing.T) {
	svc, repo := testService()
	ctx := context.Background()

	user, tokens, err := svc.Register(ctx, "ivan@example.com", "password1", "Ivan")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	sid := sessionIDOf(t, svc, tokens.Refresh)

	session, err := repo.GetSession(ctx, sid)
	if err != nil {
		t.Fatalf("GetSession: %v", err)
	}
	if session.UserID != user.ID {
		t.Errorf("session.UserID = %q, want %q", session.UserID, user.ID)
	}
	if session.RevokedAt != nil {
		t.Error("newly created session should not be revoked")
	}
}

// TestLogin_CreatesSession — FR-10: вход тоже создаёт новую сессию (не
// переиспользует ничью прежнюю).
func TestLogin_CreatesSession(t *testing.T) {
	svc, repo := testService()
	ctx := context.Background()

	_, regTokens, err := svc.Register(ctx, "ivan@example.com", "password1", "Ivan")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	_, loginTokens, err := svc.Login(ctx, "ivan@example.com", "password1")
	if err != nil {
		t.Fatalf("Login: %v", err)
	}

	regSID := sessionIDOf(t, svc, regTokens.Refresh)
	loginSID := sessionIDOf(t, svc, loginTokens.Refresh)
	if regSID == loginSID {
		t.Fatal("Login should create its own session, distinct from Register's")
	}
	if _, err := repo.GetSession(ctx, loginSID); err != nil {
		t.Errorf("GetSession(loginSID): %v", err)
	}
}

// TestRefresh_UpdatesLastSeenAt — FR-11: Refresh обновляет last_seen_at
// сессии.
func TestRefresh_UpdatesLastSeenAt(t *testing.T) {
	c := &clock{t: time.Now()}
	svc, repo, _ := testServiceWithClock(c)
	ctx := context.Background()

	_, tokens, err := svc.Register(ctx, "ivan@example.com", "password1", "Ivan")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	sid := sessionIDOf(t, svc, tokens.Refresh)

	before, err := repo.GetSession(ctx, sid)
	if err != nil {
		t.Fatalf("GetSession: %v", err)
	}

	c.advance(5 * time.Minute)
	if _, err := svc.Refresh(ctx, tokens.Refresh); err != nil {
		t.Fatalf("Refresh: %v", err)
	}

	after, err := repo.GetSession(ctx, sid)
	if err != nil {
		t.Fatalf("GetSession: %v", err)
	}
	if !after.LastSeenAt.After(before.LastSeenAt) {
		t.Errorf("LastSeenAt should advance: before=%v after=%v", before.LastSeenAt, after.LastSeenAt)
	}
}

// TestRefresh_RevokedSessionRejected — отозванная сессия не продлевается,
// даже если refresh-токен ещё не истёк по exp.
func TestRefresh_RevokedSessionRejected(t *testing.T) {
	svc, repo := testService()
	ctx := context.Background()

	_, tokens, err := svc.Register(ctx, "ivan@example.com", "password1", "Ivan")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	sid := sessionIDOf(t, svc, tokens.Refresh)

	if err := repo.RevokeSession(ctx, sid, time.Now()); err != nil {
		t.Fatalf("RevokeSession: %v", err)
	}

	if _, err := svc.Refresh(ctx, tokens.Refresh); !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Errorf("expected ErrInvalidCredentials for revoked session, got %v", err)
	}
}

// TestRefresh_NonexistentSessionRejected — sid, не соответствующий ни
// одной строке реестра (напр. токен подделан или сессия была физически
// удалена), отклоняется.
func TestRefresh_NonexistentSessionRejected(t *testing.T) {
	svc, _ := testService()
	ctx := context.Background()

	pair, err := svc.tokens.Issue("some-user-id", "user", "00000000-0000-0000-0000-000000000000")
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}

	if _, err := svc.Refresh(ctx, pair.Refresh); !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Errorf("expected ErrInvalidCredentials for nonexistent session, got %v", err)
	}
}

// TestRefresh_TokenWithoutSessionIDRejected — ADR 0018 п.4: refresh-токен
// без клейма sid (выпущенный до внедрения реестра) трактуется как невалидный.
func TestRefresh_TokenWithoutSessionIDRejected(t *testing.T) {
	svc, _ := testService()
	ctx := context.Background()

	pair, err := svc.tokens.Issue("some-user-id", "user", "")
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}

	if _, err := svc.Refresh(ctx, pair.Refresh); !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Errorf("expected ErrInvalidCredentials for sid-less token, got %v", err)
	}
}

// TestListSessions_ReturnsActiveSessions — FR-11: список отдаёт только
// активные сессии пользователя.
func TestListSessions_ReturnsActiveSessions(t *testing.T) {
	svc, _ := testService()
	ctx := context.Background()

	user, tokensA, err := svc.Register(ctx, "ivan@example.com", "password1", "Ivan")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	_, tokensB, err := svc.Login(ctx, "ivan@example.com", "password1")
	if err != nil {
		t.Fatalf("Login: %v", err)
	}
	sidA := sessionIDOf(t, svc, tokensA.Refresh)
	sidB := sessionIDOf(t, svc, tokensB.Refresh)

	sessions, err := svc.ListSessions(ctx, user.ID)
	if err != nil {
		t.Fatalf("ListSessions: %v", err)
	}
	if len(sessions) != 2 {
		t.Fatalf("expected 2 active sessions, got %d", len(sessions))
	}
	ids := map[string]bool{}
	for _, s := range sessions {
		ids[s.ID] = true
	}
	if !ids[sidA] || !ids[sidB] {
		t.Errorf("expected both sessions in list, got %+v", sessions)
	}
}

// TestRevokeSession_ForeignSessionForbidden — чужая сессия не отзывается.
func TestRevokeSession_ForeignSessionForbidden(t *testing.T) {
	svc, _ := testService()
	ctx := context.Background()

	_, tokensA, err := svc.Register(ctx, "alice@example.com", "password1", "Alice")
	if err != nil {
		t.Fatalf("Register alice: %v", err)
	}
	bob, _, err := svc.Register(ctx, "bob@example.com", "password1", "Bob")
	if err != nil {
		t.Fatalf("Register bob: %v", err)
	}
	sidA := sessionIDOf(t, svc, tokensA.Refresh)

	err = svc.RevokeSession(ctx, bob.ID, sidA)
	if !errors.Is(err, domain.ErrForbidden) {
		t.Errorf("expected ErrForbidden, got %v", err)
	}

	// Сессия Alice всё ещё активна.
	if _, err := svc.Refresh(ctx, tokensA.Refresh); err != nil {
		t.Errorf("alice's session should remain active, refresh failed: %v", err)
	}
}

// TestRevokeSession_UnknownSessionNotFound — несуществующая сессия →
// ErrSessionNotFound.
func TestRevokeSession_UnknownSessionNotFound(t *testing.T) {
	svc, _ := testService()
	ctx := context.Background()

	user, _, err := svc.Register(ctx, "ivan@example.com", "password1", "Ivan")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	err = svc.RevokeSession(ctx, user.ID, "00000000-0000-0000-0000-000000000000")
	if !errors.Is(err, domain.ErrSessionNotFound) {
		t.Errorf("expected ErrSessionNotFound, got %v", err)
	}
}

// TestRevokeOtherSessions_KeepsCurrent — FR-12: «выйти со всех устройств»
// не гасит текущую сессию.
func TestRevokeOtherSessions_KeepsCurrent(t *testing.T) {
	svc, _ := testService()
	ctx := context.Background()

	user, tokensA, err := svc.Register(ctx, "ivan@example.com", "password1", "Ivan")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	_, tokensB, err := svc.Login(ctx, "ivan@example.com", "password1")
	if err != nil {
		t.Fatalf("Login: %v", err)
	}
	sidA := sessionIDOf(t, svc, tokensA.Refresh)

	n, err := svc.RevokeOtherSessions(ctx, user.ID, sidA)
	if err != nil {
		t.Fatalf("RevokeOtherSessions: %v", err)
	}
	if n != 1 {
		t.Errorf("revoked count = %d, want 1", n)
	}

	// Текущая (A) продолжает работать.
	if _, err := svc.Refresh(ctx, tokensA.Refresh); err != nil {
		t.Errorf("current session should still work, got %v", err)
	}
	// Другая (B) отозвана.
	if _, err := svc.Refresh(ctx, tokensB.Refresh); !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Errorf("other session should be revoked, got %v", err)
	}
}

// TestLogout_RevokesCurrentSession — FR-13: logout завершает сессию на
// сервере, а не только стирает cookie.
func TestLogout_RevokesCurrentSession(t *testing.T) {
	svc, _ := testService()
	ctx := context.Background()

	_, tokens, err := svc.Register(ctx, "ivan@example.com", "password1", "Ivan")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	if err := svc.Logout(ctx, tokens.Refresh); err != nil {
		t.Fatalf("Logout: %v", err)
	}

	if _, err := svc.Refresh(ctx, tokens.Refresh); !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Errorf("session should be revoked after logout, got %v", err)
	}
}

// TestLogout_IdempotentOnAlreadyRevoked — повторный Logout / logout с уже
// отозванной сессией не ошибка.
func TestLogout_IdempotentOnAlreadyRevoked(t *testing.T) {
	svc, _ := testService()
	ctx := context.Background()

	_, tokens, err := svc.Register(ctx, "ivan@example.com", "password1", "Ivan")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	if err := svc.Logout(ctx, tokens.Refresh); err != nil {
		t.Fatalf("first Logout: %v", err)
	}
	if err := svc.Logout(ctx, tokens.Refresh); err != nil {
		t.Errorf("second Logout should be idempotent, got %v", err)
	}
}

// TestLogout_UnknownOrGarbageTokenNotError — logout с мусорным токеном или
// токеном без sid не ошибка (нечего отзывать).
func TestLogout_UnknownOrGarbageTokenNotError(t *testing.T) {
	svc, _ := testService()
	ctx := context.Background()

	if err := svc.Logout(ctx, "garbage"); err != nil {
		t.Errorf("Logout with garbage token should not error, got %v", err)
	}
}

// TestChangePassword_RevokesOtherSessionsKeepsCurrent — FR-14: смена
// пароля гасит все сессии, кроме той, из которой она выполнена.
func TestChangePassword_RevokesOtherSessionsKeepsCurrent(t *testing.T) {
	svc, _ := testService()
	ctx := context.Background()

	_, tokensA, err := svc.Register(ctx, "ivan@example.com", "old-password", "Ivan")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	_, tokensB, err := svc.Login(ctx, "ivan@example.com", "old-password")
	if err != nil {
		t.Fatalf("Login: %v", err)
	}
	sidA := sessionIDOf(t, svc, tokensA.Refresh)

	newPair, err := svc.ChangePassword(ctx, tokensA.Access, "old-password", "new-password", sidA)
	if err != nil {
		t.Fatalf("ChangePassword: %v", err)
	}

	// Другая сессия (B) отозвана.
	if _, err := svc.Refresh(ctx, tokensB.Refresh); !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Errorf("other session should be revoked after password change, got %v", err)
	}
	// Свежая пара, выпущенная ChangePassword, продлевается нормально.
	if _, err := svc.Refresh(ctx, newPair.Refresh); err != nil {
		t.Errorf("fresh pair from ChangePassword should still work, got %v", err)
	}
}

// TestResetPassword_RevokesAllSessions — сброс пароля гасит все сессии
// (сброс не выдаёт сессию сам — нет «текущей», которую нужно оставить).
func TestResetPassword_RevokesAllSessions(t *testing.T) {
	c := &clock{t: time.Now()}
	svc, _, mailer := testServiceWithClock(c)
	ctx := context.Background()

	_, tokensA, err := svc.Register(ctx, "ivan@example.com", "old-password", "Ivan")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	_, tokensB, err := svc.Login(ctx, "ivan@example.com", "old-password")
	if err != nil {
		t.Fatalf("Login: %v", err)
	}

	if err := svc.RequestPasswordReset(ctx, "ivan@example.com"); err != nil {
		t.Fatalf("RequestPasswordReset: %v", err)
	}
	raw := tokenFromLink(t, mailer.Last().Link)
	if err := svc.ResetPassword(ctx, raw, "new-password"); err != nil {
		t.Fatalf("ResetPassword: %v", err)
	}

	if _, err := svc.Refresh(ctx, tokensA.Refresh); !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Errorf("session A should be revoked after password reset, got %v", err)
	}
	if _, err := svc.Refresh(ctx, tokensB.Refresh); !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Errorf("session B should be revoked after password reset, got %v", err)
	}
}
