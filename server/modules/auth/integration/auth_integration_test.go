//go:build integration

// Package integration — сквозные e2e-тесты модуля auth на реальной
// PostgreSQL (testcontainers) через полный Connect-путь: proto-binary →
// интерсепторы → handler → service → repo → SQL → back. См. ADR 0010.
//
// Спека 0037 (T22/T23): восстановление пароля целиком поверх лог-адаптера
// почты (NFR-3) — без внешнего SMTP-сервера, как в dev/CI.
package integration

import (
	"context"
	"net/http"
	"net/http/httptest"
	"regexp"
	"sync"
	"testing"
	"time"

	"connectrpc.com/connect"

	hemav1 "github.com/hema/server/gen/hema/v1"
	"github.com/hema/server/gen/hema/v1/hemav1connect"
	"github.com/hema/server/internal/testdb"
	"github.com/hema/server/modules/auth"
	authmailer "github.com/hema/server/modules/auth/mailer"
	"github.com/hema/server/pkg/connectutil"
	"github.com/hema/server/pkg/jwt"
	"github.com/hema/server/pkg/mail"

	"log/slog"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	accessKey  = "auth-integration-access-secret"
	refreshKey = "auth-integration-refresh-secret"
)

// capturingHandler — slog.Handler, запоминающий текст последнего письма
// (атрибут "text" записи, см. mail.loggerSender.Send). Так тест проходит
// через настоящий лог-адаптер (NFR-3), а не через тестовый domain.Mailer,
// подставленный напрямую в обход pkg/mail.
type capturingHandler struct {
	mu   sync.Mutex
	text string
}

func (h *capturingHandler) Enabled(context.Context, slog.Level) bool { return true }

func (h *capturingHandler) Handle(_ context.Context, r slog.Record) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	r.Attrs(func(a slog.Attr) bool {
		if a.Key == "text" {
			h.text = a.Value.String()
		}
		return true
	})
	return nil
}

func (h *capturingHandler) WithAttrs([]slog.Attr) slog.Handler { return h }
func (h *capturingHandler) WithGroup(string) slog.Handler      { return h }

func (h *capturingHandler) lastResetToken(t *testing.T) string {
	t.Helper()
	h.mu.Lock()
	text := h.text
	h.mu.Unlock()

	re := regexp.MustCompile(`token=([^\s&]+)`)
	m := re.FindStringSubmatch(text)
	if m == nil {
		t.Fatalf("no reset link with token found in captured mail text: %q", text)
	}
	return m[1]
}

// setup поднимает PG (testdb.Postgres), применяет миграции auth, собирает
// composition root с реальным лог-адаптером почты (mail.NewLogger, NFR-3) и
// возвращает Connect-клиент, пул и хендлер, из которого можно вытащить
// ссылку последнего отправленного письма.
func setup(t *testing.T) (hemav1connect.AuthServiceClient, *pgxpool.Pool, *capturingHandler) {
	t.Helper()
	pool := testdb.Postgres(t)

	tokens := jwt.NewManager(accessKey, refreshKey, 15*time.Minute, 720*time.Hour)
	baseOpts := []connect.HandlerOption{
		connect.WithInterceptors(connectutil.Auth(tokens)),
	}
	adminOpts := []connect.HandlerOption{
		connect.WithInterceptors(connectutil.RequireAdmin()),
	}

	handler := &capturingHandler{}
	sender := mail.NewLogger(slog.New(handler))
	resetTTL := 30 * time.Minute
	mailerAdapter := authmailer.New(sender, resetTTL)

	mux := http.NewServeMux()
	auth.Register(mux, auth.Deps{
		Pool:             pool,
		Tokens:           tokens,
		Mailer:           mailerAdapter,
		PublicAppURL:     "http://localhost:3000",
		PasswordResetTTL: resetTTL,
	}, baseOpts, adminOpts)

	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	client := hemav1connect.NewAuthServiceClient(server.Client(), server.URL)
	return client, pool, handler
}

func TestIntegration_MigrationsApplied(t *testing.T) {
	setup(t)
}

// TestIntegration_PasswordResetTokenHash_UniqueConstraint — колонка
// token_hash объявлена UNIQUE (миграция 00002): констрейнт должен реально
// блокировать коллизию на уровне PG, не только полагаться на низкую
// вероятность (32 случайных байта, спека 0037, plan.md T9).
func TestIntegration_PasswordResetTokenHash_UniqueConstraint(t *testing.T) {
	client, pool, _ := setup(t)
	ctx := context.Background()

	reg, err := client.Register(ctx, connect.NewRequest(&hemav1.RegisterRequest{
		Email:       "unique-token@example.com",
		Password:    "password123",
		DisplayName: "Unique Token",
	}))
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	userID := reg.Msg.User.Id

	_, err = pool.Exec(ctx,
		`INSERT INTO auth.password_reset_tokens (user_id, token_hash, expires_at)
		 VALUES ($1, 'same-hash', now() + interval '30 minutes')`,
		userID)
	if err != nil {
		t.Fatalf("first insert should succeed: %v", err)
	}

	_, err = pool.Exec(ctx,
		`INSERT INTO auth.password_reset_tokens (user_id, token_hash, expires_at)
		 VALUES ($1, 'same-hash', now() + interval '30 minutes')`,
		userID)
	if err == nil {
		t.Error("expected unique constraint violation on duplicate token_hash")
	}
}

// TestIntegration_PasswordResetTokens_ExpiresAfterCreatedConstraint —
// chk_prt_expires_after_created (миграция 00002) должен реально блокировать
// expires_at <= created_at на уровне PG.
func TestIntegration_PasswordResetTokens_ExpiresAfterCreatedConstraint(t *testing.T) {
	client, pool, _ := setup(t)
	ctx := context.Background()

	reg, err := client.Register(ctx, connect.NewRequest(&hemav1.RegisterRequest{
		Email:       "expiry-check@example.com",
		Password:    "password123",
		DisplayName: "Expiry Check",
	}))
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	_, err = pool.Exec(ctx,
		`INSERT INTO auth.password_reset_tokens (user_id, token_hash, created_at, expires_at)
		 VALUES ($1, 'expired-before-created', now(), now() - interval '1 minute')`,
		reg.Msg.User.Id)
	if err == nil {
		t.Error("expected constraint violation: expires_at before created_at")
	}
}

// TestIntegration_PasswordReset_EndToEnd_LogAdapter — спека 0037, T23:
// полный сценарий сброса пароля через лог-адаптер почты (NFR-3, AC-17):
// запрос → токен из письма → установка пароля → вход новым паролем →
// старый refresh отклонён (AC-3, AC-11).
func TestIntegration_PasswordReset_EndToEnd_LogAdapter(t *testing.T) {
	client, _, mailHandler := setup(t)
	ctx := context.Background()

	const email = "reset-flow@example.com"
	const oldPassword = "old-password-1"
	const newPassword = "new-password-2"

	reg, err := client.Register(ctx, connect.NewRequest(&hemav1.RegisterRequest{
		Email:       email,
		Password:    oldPassword,
		DisplayName: "Reset Flow",
	}))
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	oldRefresh := reg.Msg.Tokens.RefreshToken

	// iat хранится в JWT с точностью до секунды, и plan.md намеренно
	// считает равенство валидным (иначе токен, выданный в ту же секунду,
	// что и сброс, отклонял бы сам себя) — без паузы Register и сброс в
	// быстром тесте почти всегда попадают в одну и ту же секунду, и
	// AC-11 не проверяется по-настоящему.
	time.Sleep(1100 * time.Millisecond)

	// FR-1/FR-7: гость не аутентифицирован — запрос идёт без Authorization,
	// проходит только если RequestPasswordReset публичен (T18).
	if _, err := client.RequestPasswordReset(ctx, connect.NewRequest(&hemav1.RequestPasswordResetRequest{
		Email: email,
	})); err != nil {
		t.Fatalf("RequestPasswordReset: %v", err)
	}

	token := mailHandler.lastResetToken(t)

	// FR-7: сброс не выдаёт сессию.
	resetResp, err := client.ResetPassword(ctx, connect.NewRequest(&hemav1.ResetPasswordRequest{
		Token:       token,
		NewPassword: newPassword,
	}))
	if err != nil {
		t.Fatalf("ResetPassword: %v", err)
	}
	if resetResp.Msg == nil {
		t.Fatal("ResetPassword response should not be nil")
	}

	// AC-3: старый пароль больше не работает.
	if _, err := client.Login(ctx, connect.NewRequest(&hemav1.LoginRequest{
		Email: email, Password: oldPassword,
	})); connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("login with old password: code = %v, want Unauthenticated", connect.CodeOf(err))
	}

	// AC-3: новый пароль работает.
	newLogin, err := client.Login(ctx, connect.NewRequest(&hemav1.LoginRequest{
		Email: email, Password: newPassword,
	}))
	if err != nil {
		t.Fatalf("login with new password: %v", err)
	}

	// AC-4: повторное использование той же ссылки отклоняется.
	if _, err := client.ResetPassword(ctx, connect.NewRequest(&hemav1.ResetPasswordRequest{
		Token:       token,
		NewPassword: "another-password-3",
	})); connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Errorf("reuse reset token: code = %v, want InvalidArgument", connect.CodeOf(err))
	}

	// AC-11: refresh, выданный ДО сброса, отклоняется — password_changed_at
	// продвинулся дальше iat старого токена.
	if _, err := client.Refresh(ctx, connect.NewRequest(&hemav1.RefreshRequest{
		RefreshToken: oldRefresh,
	})); connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("refresh with pre-reset token: code = %v, want Unauthenticated", connect.CodeOf(err))
	}

	// AC-11 (симметрично): refresh, выданный ПОСЛЕ сброса (новым логином),
	// работает как обычно.
	if _, err := client.Refresh(ctx, connect.NewRequest(&hemav1.RefreshRequest{
		RefreshToken: newLogin.Msg.Tokens.RefreshToken,
	})); err != nil {
		t.Errorf("refresh with post-reset token should succeed: %v", err)
	}
}

// TestIntegration_PasswordReset_NonexistentEmail_SilentSuccess — спека 0037,
// AC-2/FR-2: ответ не зависит от существования аккаунта, письмо не уходит.
func TestIntegration_PasswordReset_NonexistentEmail_SilentSuccess(t *testing.T) {
	client, _, mailHandler := setup(t)
	ctx := context.Background()

	if _, err := client.RequestPasswordReset(ctx, connect.NewRequest(&hemav1.RequestPasswordResetRequest{
		Email: "nobody@example.com",
	})); err != nil {
		t.Fatalf("RequestPasswordReset for nonexistent email should still succeed: %v", err)
	}

	mailHandler.mu.Lock()
	text := mailHandler.text
	mailHandler.mu.Unlock()
	if text != "" {
		t.Errorf("no mail should have been sent for a nonexistent account, got: %q", text)
	}
}

// TestIntegration_ChangePassword_ObeysPolicyAndBreaksOldSessions — спека
// 0037: смена пароля залогиненным (FR-9..FR-12).
func TestIntegration_ChangePassword_ObeysPolicyAndBreaksOldSessions(t *testing.T) {
	client, _, _ := setup(t)
	ctx := context.Background()

	reg, err := client.Register(ctx, connect.NewRequest(&hemav1.RegisterRequest{
		Email:       "change-pw@example.com",
		Password:    "first-password-1",
		DisplayName: "Change Password",
	}))
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	oldRefresh := reg.Msg.Tokens.RefreshToken
	bearer := "Bearer " + reg.Msg.Tokens.AccessToken

	// см. комментарий в TestIntegration_PasswordReset_EndToEnd_LogAdapter —
	// iat/password_changed_at сравниваются с точностью до секунды.
	time.Sleep(1100 * time.Millisecond)

	// AC-9: неверный текущий пароль.
	wrongReq := connect.NewRequest(&hemav1.ChangePasswordRequest{
		CurrentPassword: "not-the-password",
		NewPassword:     "second-password-2",
	})
	wrongReq.Header().Set("Authorization", bearer)
	if _, err := client.ChangePassword(ctx, wrongReq); connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("wrong current password: code = %v, want Unauthenticated", connect.CodeOf(err))
	}

	// AC-8: успешная смена возвращает новую пару токенов.
	okReq := connect.NewRequest(&hemav1.ChangePasswordRequest{
		CurrentPassword: "first-password-1",
		NewPassword:     "second-password-2",
	})
	okReq.Header().Set("Authorization", bearer)
	changed, err := client.ChangePassword(ctx, okReq)
	if err != nil {
		t.Fatalf("ChangePassword: %v", err)
	}
	if changed.Msg.Tokens == nil || changed.Msg.Tokens.AccessToken == "" {
		t.Fatal("ChangePassword should return a fresh token pair")
	}

	// AC-11: старый refresh (выданный до смены) больше не работает.
	if _, err := client.Refresh(ctx, connect.NewRequest(&hemav1.RefreshRequest{
		RefreshToken: oldRefresh,
	})); connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("refresh with pre-change token: code = %v, want Unauthenticated", connect.CodeOf(err))
	}

	// Новый пароль действительно работает при входе.
	if _, err := client.Login(ctx, connect.NewRequest(&hemav1.LoginRequest{
		Email: "change-pw@example.com", Password: "second-password-2",
	})); err != nil {
		t.Errorf("login with new password should succeed: %v", err)
	}
}

// TestIntegration_UpdateProfile_ClubAndDisplayName — спека 0037, FR-13..FR-17.
func TestIntegration_UpdateProfile_ClubAndDisplayName(t *testing.T) {
	client, _, _ := setup(t)
	ctx := context.Background()

	reg, err := client.Register(ctx, connect.NewRequest(&hemav1.RegisterRequest{
		Email:       "profile@example.com",
		Password:    "password123",
		DisplayName: "Old Name",
	}))
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	bearer := "Bearer " + reg.Msg.Tokens.AccessToken

	req := connect.NewRequest(&hemav1.UpdateProfileRequest{
		DisplayName: "New Name",
		Club:        "Северный клинок",
	})
	req.Header().Set("Authorization", bearer)
	res, err := client.UpdateProfile(ctx, req)
	if err != nil {
		t.Fatalf("UpdateProfile: %v", err)
	}
	if res.Msg.User.DisplayName != "New Name" || res.Msg.User.Club != "Северный клинок" {
		t.Errorf("profile = %q / %q", res.Msg.User.DisplayName, res.Msg.User.Club)
	}

	// AC-13: пустое имя отклоняется, прежнее значение сохранено.
	emptyReq := connect.NewRequest(&hemav1.UpdateProfileRequest{DisplayName: "  ", Club: "x"})
	emptyReq.Header().Set("Authorization", bearer)
	if _, err := client.UpdateProfile(ctx, emptyReq); connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Errorf("empty display name: code = %v, want InvalidArgument", connect.CodeOf(err))
	}

	me := connect.NewRequest(&hemav1.MeRequest{})
	me.Header().Set("Authorization", bearer)
	meRes, err := client.Me(ctx, me)
	if err != nil {
		t.Fatalf("Me: %v", err)
	}
	if meRes.Msg.User.DisplayName != "New Name" {
		t.Errorf("persisted display name = %q, want unchanged after rejected update", meRes.Msg.User.DisplayName)
	}
}

// TestIntegration_ChangePassword_NoToken — приватность RPC под реальным
// интерсептором (не только через изолированный bypass-тест api-слоя).
func TestIntegration_ChangePassword_NoToken(t *testing.T) {
	client, _, _ := setup(t)

	_, err := client.ChangePassword(context.Background(), connect.NewRequest(&hemav1.ChangePasswordRequest{
		CurrentPassword: "a", NewPassword: "bbbbbbbb",
	}))
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("ChangePassword without token: code = %v, want Unauthenticated", connect.CodeOf(err))
	}
}
