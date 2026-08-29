package api

import (
	"context"
	"testing"

	"connectrpc.com/connect"

	hemav1 "github.com/hema/server/gen/hema/v1"
)

// withRefreshHeader пробрасывает refresh-токен в заголовке
// X-Refresh-Token — тем же приёмом, каким BFF сообщает серверу "текущую"
// сессию вызывающего запроса для эндпоинтов, чьи proto-сообщения этот id
// не несут (ChangePassword/ListSessions/RevokeOtherSessions, ADR 0018 —
// access-токен клейма sid не несёт).
func withRefreshHeader[T any](req *connect.Request[T], refreshToken string) *connect.Request[T] {
	req.Header().Set("X-Refresh-Token", refreshToken)
	return req
}

// ---- VerifyEmail / ResendEmailVerification ----

func TestVerifyEmail_E2E_HappyPath(t *testing.T) {
	client, _, _, mailer := setupWithMailer(t)
	ctx := context.Background()

	reg, err := client.Register(ctx, connect.NewRequest(&hemav1.RegisterRequest{
		Email: "verify@hema.test", Password: "password1", DisplayName: "Verify Me",
	}))
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	if reg.Msg.User.EmailVerified {
		t.Fatal("newly registered user should not be verified yet")
	}
	raw := tokenFromLink(t, mailer.LastVerification().Link)

	if _, err := client.VerifyEmail(ctx, connect.NewRequest(&hemav1.VerifyEmailRequest{Token: raw})); err != nil {
		t.Fatalf("VerifyEmail: %v", err)
	}

	me := connect.NewRequest(&hemav1.MeRequest{})
	me.Header().Set("Authorization", "Bearer "+reg.Msg.Tokens.AccessToken)
	meRes, err := client.Me(ctx, me)
	if err != nil {
		t.Fatalf("Me: %v", err)
	}
	if !meRes.Msg.User.EmailVerified {
		t.Error("user should be verified after VerifyEmail")
	}
}

func TestVerifyEmail_E2E_InvalidTokenReturnsInvalidArgument(t *testing.T) {
	client, _, _, _ := setupWithMailer(t)

	_, err := client.VerifyEmail(context.Background(), connect.NewRequest(&hemav1.VerifyEmailRequest{Token: "garbage"}))
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Errorf("expected CodeInvalidArgument, got %v", connect.CodeOf(err))
	}
}

func TestVerifyEmail_E2E_NoAuthRequired(t *testing.T) {
	// VerifyEmail — публичный RPC (переход по ссылке без сессии в браузере).
	client, _, _, _ := setupWithMailer(t)

	_, err := client.VerifyEmail(context.Background(), connect.NewRequest(&hemav1.VerifyEmailRequest{Token: "garbage"}))
	if connect.CodeOf(err) == connect.CodeUnauthenticated {
		t.Error("VerifyEmail should not require authentication")
	}
}

// Примечание: полноценный happy-path ResendEmailVerification (успешная
// повторная отправка спустя минуту троттлинга) проверяется на уровне
// service (email_verification_test.go) с управляемыми часами — здесь, на
// реальных часах httptest-сервера, немедленный повтор после Register
// всегда попадает в троттлинг (см. TestResendEmailVerification_E2E_
// ThrottledReturnsResourceExhausted ниже), поэтому дублировать его без
// секундного time.Sleep в e2e-тесте нет смысла.

func TestResendEmailVerification_E2E_NoTokenUnauthenticated(t *testing.T) {
	client, _, _, _ := setupWithMailer(t)

	_, err := client.ResendEmailVerification(context.Background(), connect.NewRequest(&hemav1.ResendEmailVerificationRequest{}))
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
	}
}

func TestResendEmailVerification_E2E_ThrottledReturnsResourceExhausted(t *testing.T) {
	client, _, _, _ := setupWithMailer(t)
	ctx := context.Background()

	reg, err := client.Register(ctx, connect.NewRequest(&hemav1.RegisterRequest{
		Email: "throttle@hema.test", Password: "password1",
	}))
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	req := withAuthToken(connect.NewRequest(&hemav1.ResendEmailVerificationRequest{}), reg.Msg.Tokens.AccessToken)
	_, err = client.ResendEmailVerification(ctx, req)
	if connect.CodeOf(err) != connect.CodeResourceExhausted {
		t.Errorf("immediate resend: code = %v, want ResourceExhausted", connect.CodeOf(err))
	}
}

// ---- RequestEmailChange / ConfirmEmailChange / CancelEmailChange ----

func TestRequestEmailChange_E2E_HappyPath(t *testing.T) {
	client, _, _, mailer := setupWithMailer(t)
	ctx := context.Background()

	reg, err := client.Register(ctx, connect.NewRequest(&hemav1.RegisterRequest{
		Email: "change@hema.test", Password: "password1",
	}))
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	mailer.Reset()

	req := withAuthToken(connect.NewRequest(&hemav1.RequestEmailChangeRequest{
		NewEmail: "new@hema.test", CurrentPassword: "password1",
	}), reg.Msg.Tokens.AccessToken)
	res, err := client.RequestEmailChange(ctx, req)
	if err != nil {
		t.Fatalf("RequestEmailChange: %v", err)
	}
	if res.Msg.User.PendingEmail != "new@hema.test" {
		t.Errorf("PendingEmail = %q, want %q", res.Msg.User.PendingEmail, "new@hema.test")
	}
	if res.Msg.User.Email != "change@hema.test" {
		t.Errorf("Email should remain unchanged, got %q", res.Msg.User.Email)
	}
	if mailer.LastChangeConfirmation() == nil {
		t.Error("expected confirmation mail to new address")
	}
	if mailer.LastChangeNotice() == nil {
		t.Error("expected notice mail to old address")
	}
}

func TestRequestEmailChange_E2E_WrongPasswordUnauthenticated(t *testing.T) {
	client, _, _, _ := setupWithMailer(t)
	ctx := context.Background()

	reg, err := client.Register(ctx, connect.NewRequest(&hemav1.RegisterRequest{
		Email: "change2@hema.test", Password: "password1",
	}))
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	req := withAuthToken(connect.NewRequest(&hemav1.RequestEmailChangeRequest{
		NewEmail: "new@hema.test", CurrentPassword: "wrong",
	}), reg.Msg.Tokens.AccessToken)
	_, err = client.RequestEmailChange(ctx, req)
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
	}
}

func TestRequestEmailChange_E2E_TakenEmailAlreadyExists(t *testing.T) {
	client, _, _, _ := setupWithMailer(t)
	ctx := context.Background()

	reg, err := client.Register(ctx, connect.NewRequest(&hemav1.RegisterRequest{
		Email: "requester@hema.test", Password: "password1",
	}))
	if err != nil {
		t.Fatalf("Register requester: %v", err)
	}
	if _, err := client.Register(ctx, connect.NewRequest(&hemav1.RegisterRequest{
		Email: "taken@hema.test", Password: "password1",
	})); err != nil {
		t.Fatalf("Register taken: %v", err)
	}

	req := withAuthToken(connect.NewRequest(&hemav1.RequestEmailChangeRequest{
		NewEmail: "taken@hema.test", CurrentPassword: "password1",
	}), reg.Msg.Tokens.AccessToken)
	_, err = client.RequestEmailChange(ctx, req)
	if connect.CodeOf(err) != connect.CodeAlreadyExists {
		t.Errorf("expected CodeAlreadyExists, got %v", connect.CodeOf(err))
	}
}

func TestConfirmEmailChange_E2E_HappyPath(t *testing.T) {
	client, _, _, mailer := setupWithMailer(t)
	ctx := context.Background()

	reg, err := client.Register(ctx, connect.NewRequest(&hemav1.RegisterRequest{
		Email: "confirm@hema.test", Password: "password1",
	}))
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	req := withAuthToken(connect.NewRequest(&hemav1.RequestEmailChangeRequest{
		NewEmail: "confirmed-new@hema.test", CurrentPassword: "password1",
	}), reg.Msg.Tokens.AccessToken)
	if _, err := client.RequestEmailChange(ctx, req); err != nil {
		t.Fatalf("RequestEmailChange: %v", err)
	}
	raw := tokenFromLink(t, mailer.LastChangeConfirmation().Link)

	res, err := client.ConfirmEmailChange(ctx, connect.NewRequest(&hemav1.ConfirmEmailChangeRequest{Token: raw}))
	if err != nil {
		t.Fatalf("ConfirmEmailChange: %v", err)
	}
	if res.Msg.User.Email != "confirmed-new@hema.test" {
		t.Errorf("Email = %q, want %q", res.Msg.User.Email, "confirmed-new@hema.test")
	}
	if res.Msg.User.PendingEmail != "" {
		t.Errorf("PendingEmail should be cleared, got %q", res.Msg.User.PendingEmail)
	}
}

func TestConfirmEmailChange_E2E_InvalidTokenReturnsInvalidArgument(t *testing.T) {
	client, _, _, _ := setupWithMailer(t)

	_, err := client.ConfirmEmailChange(context.Background(), connect.NewRequest(&hemav1.ConfirmEmailChangeRequest{Token: "garbage"}))
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Errorf("expected CodeInvalidArgument, got %v", connect.CodeOf(err))
	}
}

func TestCancelEmailChange_E2E_HappyPath(t *testing.T) {
	client, _, _, _ := setupWithMailer(t)
	ctx := context.Background()

	reg, err := client.Register(ctx, connect.NewRequest(&hemav1.RegisterRequest{
		Email: "cancel@hema.test", Password: "password1",
	}))
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	changeReq := withAuthToken(connect.NewRequest(&hemav1.RequestEmailChangeRequest{
		NewEmail: "cancelled@hema.test", CurrentPassword: "password1",
	}), reg.Msg.Tokens.AccessToken)
	if _, err := client.RequestEmailChange(ctx, changeReq); err != nil {
		t.Fatalf("RequestEmailChange: %v", err)
	}

	cancelReq := withAuthToken(connect.NewRequest(&hemav1.CancelEmailChangeRequest{}), reg.Msg.Tokens.AccessToken)
	res, err := client.CancelEmailChange(ctx, cancelReq)
	if err != nil {
		t.Fatalf("CancelEmailChange: %v", err)
	}
	if res.Msg.User.PendingEmail != "" {
		t.Errorf("PendingEmail should be cleared after cancel, got %q", res.Msg.User.PendingEmail)
	}
}

// ---- UpdateNotificationSettings ----

func TestUpdateNotificationSettings_E2E_UnverifiedRejected(t *testing.T) {
	client, _, _, _ := setupWithMailer(t)
	ctx := context.Background()

	reg, err := client.Register(ctx, connect.NewRequest(&hemav1.RegisterRequest{
		Email: "notify@hema.test", Password: "password1",
	}))
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	req := withAuthToken(connect.NewRequest(&hemav1.UpdateNotificationSettingsRequest{
		Settings: &hemav1.NotificationSettings{ApplicationState: true},
	}), reg.Msg.Tokens.AccessToken)
	_, err = client.UpdateNotificationSettings(ctx, req)
	if connect.CodeOf(err) != connect.CodeFailedPrecondition {
		t.Errorf("expected CodeFailedPrecondition, got %v", connect.CodeOf(err))
	}
}

func TestUpdateNotificationSettings_E2E_HappyPathAfterVerification(t *testing.T) {
	client, _, _, mailer := setupWithMailer(t)
	ctx := context.Background()

	reg, err := client.Register(ctx, connect.NewRequest(&hemav1.RegisterRequest{
		Email: "notify2@hema.test", Password: "password1",
	}))
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	raw := tokenFromLink(t, mailer.LastVerification().Link)
	if _, err := client.VerifyEmail(ctx, connect.NewRequest(&hemav1.VerifyEmailRequest{Token: raw})); err != nil {
		t.Fatalf("VerifyEmail: %v", err)
	}

	req := withAuthToken(connect.NewRequest(&hemav1.UpdateNotificationSettingsRequest{
		Settings: &hemav1.NotificationSettings{ApplicationState: true, PoolSeated: true},
	}), reg.Msg.Tokens.AccessToken)
	res, err := client.UpdateNotificationSettings(ctx, req)
	if err != nil {
		t.Fatalf("UpdateNotificationSettings: %v", err)
	}
	if !res.Msg.User.Notifications.ApplicationState || !res.Msg.User.Notifications.PoolSeated {
		t.Errorf("Notifications = %+v, want both true", res.Msg.User.Notifications)
	}
}

// ---- Sessions ----

func TestListSessions_E2E_MarksCurrent(t *testing.T) {
	client, _, _, _ := setupWithMailer(t)
	ctx := context.Background()

	if _, err := client.Register(ctx, connect.NewRequest(&hemav1.RegisterRequest{
		Email: "sessions@hema.test", Password: "password1",
	})); err != nil {
		t.Fatalf("Register: %v", err)
	}
	login, err := client.Login(ctx, connect.NewRequest(&hemav1.LoginRequest{
		Email: "sessions@hema.test", Password: "password1",
	}))
	if err != nil {
		t.Fatalf("Login: %v", err)
	}

	req := withRefreshHeader(withAuthToken(connect.NewRequest(&hemav1.ListSessionsRequest{}), login.Msg.Tokens.AccessToken), login.Msg.Tokens.RefreshToken)
	res, err := client.ListSessions(ctx, req)
	if err != nil {
		t.Fatalf("ListSessions: %v", err)
	}
	if len(res.Msg.Sessions) != 2 {
		t.Fatalf("expected 2 sessions, got %d", len(res.Msg.Sessions))
	}
	currentCount := 0
	for _, s := range res.Msg.Sessions {
		if s.Current {
			currentCount++
		}
	}
	if currentCount != 1 {
		t.Errorf("expected exactly 1 session marked current, got %d", currentCount)
	}
}

func TestListSessions_E2E_NoTokenUnauthenticated(t *testing.T) {
	client, _, _, _ := setupWithMailer(t)

	_, err := client.ListSessions(context.Background(), connect.NewRequest(&hemav1.ListSessionsRequest{}))
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
	}
}

func TestRevokeSession_E2E_ForeignSessionPermissionDenied(t *testing.T) {
	client, _, _, _ := setupWithMailer(t)
	ctx := context.Background()

	alice, err := client.Register(ctx, connect.NewRequest(&hemav1.RegisterRequest{
		Email: "alice@hema.test", Password: "password1",
	}))
	if err != nil {
		t.Fatalf("Register alice: %v", err)
	}
	bob, err := client.Register(ctx, connect.NewRequest(&hemav1.RegisterRequest{
		Email: "bob@hema.test", Password: "password1",
	}))
	if err != nil {
		t.Fatalf("Register bob: %v", err)
	}

	// Достаём id сессии Alice через её собственный ListSessions.
	aliceList := withAuthToken(connect.NewRequest(&hemav1.ListSessionsRequest{}), alice.Msg.Tokens.AccessToken)
	aliceSessions, err := client.ListSessions(ctx, aliceList)
	if err != nil {
		t.Fatalf("ListSessions(alice): %v", err)
	}
	if len(aliceSessions.Msg.Sessions) != 1 {
		t.Fatalf("expected alice to have 1 session, got %d", len(aliceSessions.Msg.Sessions))
	}
	aliceSessionID := aliceSessions.Msg.Sessions[0].Id

	bobReq := withAuthToken(connect.NewRequest(&hemav1.RevokeSessionRequest{SessionId: aliceSessionID}), bob.Msg.Tokens.AccessToken)
	_, err = client.RevokeSession(ctx, bobReq)
	if connect.CodeOf(err) != connect.CodePermissionDenied {
		t.Errorf("expected CodePermissionDenied, got %v", connect.CodeOf(err))
	}
}

func TestRevokeSession_E2E_UnknownSessionNotFound(t *testing.T) {
	client, _, _, _ := setupWithMailer(t)
	ctx := context.Background()

	reg, err := client.Register(ctx, connect.NewRequest(&hemav1.RegisterRequest{
		Email: "revoke-unknown@hema.test", Password: "password1",
	}))
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	req := withAuthToken(connect.NewRequest(&hemav1.RevokeSessionRequest{SessionId: "00000000-0000-0000-0000-000000000000"}), reg.Msg.Tokens.AccessToken)
	_, err = client.RevokeSession(ctx, req)
	if connect.CodeOf(err) != connect.CodeNotFound {
		t.Errorf("expected CodeNotFound, got %v", connect.CodeOf(err))
	}
}

func TestRevokeOtherSessions_E2E_KeepsCurrent(t *testing.T) {
	client, _, _, _ := setupWithMailer(t)
	ctx := context.Background()

	reg, err := client.Register(ctx, connect.NewRequest(&hemav1.RegisterRequest{
		Email: "revoke-others@hema.test", Password: "password1",
	}))
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	if _, err := client.Login(ctx, connect.NewRequest(&hemav1.LoginRequest{
		Email: "revoke-others@hema.test", Password: "password1",
	})); err != nil {
		t.Fatalf("Login: %v", err)
	}

	req := withRefreshHeader(withAuthToken(connect.NewRequest(&hemav1.RevokeOtherSessionsRequest{}), reg.Msg.Tokens.AccessToken), reg.Msg.Tokens.RefreshToken)
	res, err := client.RevokeOtherSessions(ctx, req)
	if err != nil {
		t.Fatalf("RevokeOtherSessions: %v", err)
	}
	if res.Msg.RevokedCount != 1 {
		t.Errorf("RevokedCount = %d, want 1", res.Msg.RevokedCount)
	}

	// Текущая сессия (та, чей refresh-токен указан в заголовке) продолжает работать.
	if _, err := client.Refresh(ctx, connect.NewRequest(&hemav1.RefreshRequest{RefreshToken: reg.Msg.Tokens.RefreshToken})); err != nil {
		t.Errorf("current session should still work: %v", err)
	}
}

func TestLogout_E2E_RevokesSessionOnServer(t *testing.T) {
	client, _, _, _ := setupWithMailer(t)
	ctx := context.Background()

	reg, err := client.Register(ctx, connect.NewRequest(&hemav1.RegisterRequest{
		Email: "logout@hema.test", Password: "password1",
	}))
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	req := withAuthToken(connect.NewRequest(&hemav1.LogoutRequest{RefreshToken: reg.Msg.Tokens.RefreshToken}), reg.Msg.Tokens.AccessToken)
	if _, err := client.Logout(ctx, req); err != nil {
		t.Fatalf("Logout: %v", err)
	}

	if _, err := client.Refresh(ctx, connect.NewRequest(&hemav1.RefreshRequest{RefreshToken: reg.Msg.Tokens.RefreshToken})); connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("refresh after logout: code = %v, want Unauthenticated", connect.CodeOf(err))
	}
}

func TestLogout_E2E_NoTokenUnauthenticated(t *testing.T) {
	// Logout требует access-токен (защищённый RPC), хотя сама сессия
	// узнаётся по refresh_token в теле — двойная проверка (кто спрашивает +
	// какую сессию гасить).
	client, _, _, _ := setupWithMailer(t)

	_, err := client.Logout(context.Background(), connect.NewRequest(&hemav1.LogoutRequest{RefreshToken: "whatever"}))
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
	}
}
