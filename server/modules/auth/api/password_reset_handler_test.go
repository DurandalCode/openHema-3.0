package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"connectrpc.com/connect"

	hemav1 "github.com/hema/server/gen/hema/v1"
	"github.com/hema/server/gen/hema/v1/hemav1connect"
	"github.com/hema/server/modules/auth/service"
	"github.com/hema/server/modules/auth/testutil"
	"github.com/hema/server/pkg/jwt"
)

// setupNoInterceptor поднимает AuthService БЕЗ глобального Auth-интерсептора
// (connectutil.Auth). Пометка RequestPasswordReset/ResetPassword как
// публичных RPC в pkg/connectutil.publicProcedures — задача T18 (отдельная
// join-волна после мержа треков A/B/C, файл вне зоны ответственности этого
// трека). Здесь тестируется поведение самого хендлера: RequestPasswordReset
// и ResetPassword не требуют токена по построению (не читают Authorization),
// а ChangePassword/UpdateProfile проверяют его сами — тем же приёмом, что и
// Me (connectutil.BearerToken) — поэтому приватность тестируема и без
// интерсептора.
func setupNoInterceptor(t *testing.T) (hemav1connect.AuthServiceClient, *testutil.FakeRepo, *testutil.FakeMailer) {
	t.Helper()

	repo := testutil.NewFakeRepo()
	mailer := testutil.NewFakeMailer()
	tokens := jwt.NewManager("access-secret", "refresh-secret", 15*time.Minute, 720*time.Hour)
	svc := service.New(repo, tokens, mailer, "https://app.hema.test", 30*time.Minute, 30*time.Minute, 720*time.Hour, time.Now)
	handler := NewHandler(svc)

	authPath, authH := hemav1connect.NewAuthServiceHandler(handler)
	mux := http.NewServeMux()
	mux.Handle(authPath, authH)

	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	client := hemav1connect.NewAuthServiceClient(server.Client(), server.URL)
	return client, repo, mailer
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

func TestRequestPasswordReset_E2E_ExistingEmail(t *testing.T) {
	client, _, mailer := setupNoInterceptor(t)

	_, err := client.Register(context.Background(), connect.NewRequest(&hemav1.RegisterRequest{
		Email:    "ivan@hema.test",
		Password: "password1",
	}))
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	_, err = client.RequestPasswordReset(context.Background(), connect.NewRequest(&hemav1.RequestPasswordResetRequest{
		Email: "ivan@hema.test",
	}))
	if err != nil {
		t.Fatalf("RequestPasswordReset: %v", err)
	}
	if mailer.Last() == nil {
		t.Error("expected a mail to be sent for an existing account")
	}
}

// TestRequestPasswordReset_E2E_NonexistentEmail_SameResponse — AC-2: ответ
// не отличим от AC-1, письмо не отправляется, RPC не возвращает ошибку.
func TestRequestPasswordReset_E2E_NonexistentEmail_SameResponse(t *testing.T) {
	client, _, mailer := setupNoInterceptor(t)

	_, err := client.RequestPasswordReset(context.Background(), connect.NewRequest(&hemav1.RequestPasswordResetRequest{
		Email: "nobody@hema.test",
	}))
	if err != nil {
		t.Fatalf("RequestPasswordReset: %v", err)
	}
	if mailer.Last() != nil {
		t.Error("expected no mail sent for a nonexistent account")
	}
}

func TestResetPassword_E2E_HappyPath(t *testing.T) {
	client, _, mailer := setupNoInterceptor(t)
	ctx := context.Background()

	_, err := client.Register(ctx, connect.NewRequest(&hemav1.RegisterRequest{
		Email:    "ivan@hema.test",
		Password: "old-password",
	}))
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	if _, err := client.RequestPasswordReset(ctx, connect.NewRequest(&hemav1.RequestPasswordResetRequest{
		Email: "ivan@hema.test",
	})); err != nil {
		t.Fatalf("RequestPasswordReset: %v", err)
	}
	raw := tokenFromLink(t, mailer.Last().Link)

	_, err = client.ResetPassword(ctx, connect.NewRequest(&hemav1.ResetPasswordRequest{
		Token:       raw,
		NewPassword: "new-password",
	}))
	if err != nil {
		t.Fatalf("ResetPassword: %v", err)
	}

	res, err := client.Login(ctx, connect.NewRequest(&hemav1.LoginRequest{
		Email:    "ivan@hema.test",
		Password: "new-password",
	}))
	if err != nil {
		t.Fatalf("Login with new password: %v", err)
	}
	if res.Msg.Tokens.AccessToken == "" {
		t.Error("access token should not be empty")
	}
}

// TestResetPassword_E2E_InvalidTokenReturnsInvalidArgument — FR-8: код
// InvalidArgument (не NotFound) — не различает «нет токена» и «просрочен».
func TestResetPassword_E2E_InvalidTokenReturnsInvalidArgument(t *testing.T) {
	client, _, _ := setupNoInterceptor(t)

	_, err := client.ResetPassword(context.Background(), connect.NewRequest(&hemav1.ResetPasswordRequest{
		Token:       "garbage-token",
		NewPassword: "new-password",
	}))
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Errorf("expected CodeInvalidArgument, got %v", connect.CodeOf(err))
	}
}

func TestResetPassword_E2E_WeakPasswordReturnsInvalidArgument(t *testing.T) {
	client, _, mailer := setupNoInterceptor(t)
	ctx := context.Background()

	_, _ = client.Register(ctx, connect.NewRequest(&hemav1.RegisterRequest{
		Email:    "ivan@hema.test",
		Password: "old-password",
	}))
	_, _ = client.RequestPasswordReset(ctx, connect.NewRequest(&hemav1.RequestPasswordResetRequest{
		Email: "ivan@hema.test",
	}))
	raw := tokenFromLink(t, mailer.Last().Link)

	_, err := client.ResetPassword(ctx, connect.NewRequest(&hemav1.ResetPasswordRequest{
		Token:       raw,
		NewPassword: "short",
	}))
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Errorf("expected CodeInvalidArgument, got %v", connect.CodeOf(err))
	}
}

func withAuthToken[T any](req *connect.Request[T], token string) *connect.Request[T] {
	req.Header().Set("Authorization", "Bearer "+token)
	return req
}

func TestChangePassword_E2E_HappyPath(t *testing.T) {
	client, _, _ := setupNoInterceptor(t)
	ctx := context.Background()

	regRes, err := client.Register(ctx, connect.NewRequest(&hemav1.RegisterRequest{
		Email:    "ivan@hema.test",
		Password: "old-password",
	}))
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	res, err := client.ChangePassword(ctx, withAuthToken(connect.NewRequest(&hemav1.ChangePasswordRequest{
		CurrentPassword: "old-password",
		NewPassword:     "new-password",
	}), regRes.Msg.Tokens.AccessToken))
	if err != nil {
		t.Fatalf("ChangePassword: %v", err)
	}
	if res.Msg.Tokens == nil || res.Msg.Tokens.AccessToken == "" {
		t.Error("expected a new token pair")
	}

	if _, err := client.Login(ctx, connect.NewRequest(&hemav1.LoginRequest{
		Email:    "ivan@hema.test",
		Password: "new-password",
	})); err != nil {
		t.Errorf("login with new password should work, got %v", err)
	}
}

func TestChangePassword_E2E_NoTokenReturnsUnauthenticated(t *testing.T) {
	client, _, _ := setupNoInterceptor(t)

	_, err := client.ChangePassword(context.Background(), connect.NewRequest(&hemav1.ChangePasswordRequest{
		CurrentPassword: "old-password",
		NewPassword:     "new-password",
	}))
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
	}
}

func TestChangePassword_E2E_WrongCurrentPasswordReturnsUnauthenticated(t *testing.T) {
	client, _, _ := setupNoInterceptor(t)
	ctx := context.Background()

	regRes, err := client.Register(ctx, connect.NewRequest(&hemav1.RegisterRequest{
		Email:    "ivan@hema.test",
		Password: "old-password",
	}))
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	_, err = client.ChangePassword(ctx, withAuthToken(connect.NewRequest(&hemav1.ChangePasswordRequest{
		CurrentPassword: "wrong-password",
		NewPassword:     "new-password",
	}), regRes.Msg.Tokens.AccessToken))
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
	}
}

func TestUpdateProfile_E2E_HappyPath(t *testing.T) {
	client, _, _ := setupNoInterceptor(t)
	ctx := context.Background()

	regRes, err := client.Register(ctx, connect.NewRequest(&hemav1.RegisterRequest{
		Email:       "ivan@hema.test",
		Password:    "password1",
		DisplayName: "Иван",
	}))
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	res, err := client.UpdateProfile(ctx, withAuthToken(connect.NewRequest(&hemav1.UpdateProfileRequest{
		DisplayName: "Иван Кравцов",
		Club:        "Северный клинок",
	}), regRes.Msg.Tokens.AccessToken))
	if err != nil {
		t.Fatalf("UpdateProfile: %v", err)
	}
	if res.Msg.User.DisplayName != "Иван Кравцов" {
		t.Errorf("DisplayName = %q", res.Msg.User.DisplayName)
	}
	if res.Msg.User.Club != "Северный клинок" {
		t.Errorf("Club = %q", res.Msg.User.Club)
	}
}

func TestUpdateProfile_E2E_NoTokenReturnsUnauthenticated(t *testing.T) {
	client, _, _ := setupNoInterceptor(t)

	_, err := client.UpdateProfile(context.Background(), connect.NewRequest(&hemav1.UpdateProfileRequest{
		DisplayName: "Name",
	}))
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
	}
}

func TestUpdateProfile_E2E_EmptyNameReturnsInvalidArgument(t *testing.T) {
	client, _, _ := setupNoInterceptor(t)
	ctx := context.Background()

	regRes, err := client.Register(ctx, connect.NewRequest(&hemav1.RegisterRequest{
		Email:       "ivan@hema.test",
		Password:    "password1",
		DisplayName: "Иван",
	}))
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	_, err = client.UpdateProfile(ctx, withAuthToken(connect.NewRequest(&hemav1.UpdateProfileRequest{
		DisplayName: "   ",
	}), regRes.Msg.Tokens.AccessToken))
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Errorf("expected CodeInvalidArgument, got %v", connect.CodeOf(err))
	}
}
