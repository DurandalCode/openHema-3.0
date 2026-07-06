package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"connectrpc.com/connect"

	hemav1 "github.com/hema/server/gen/hema/v1"
	"github.com/hema/server/gen/hema/v1/hemav1connect"
	"github.com/hema/server/modules/auth/service"
	"github.com/hema/server/modules/auth/testutil"
	"github.com/hema/server/pkg/jwt"
)

// setup поднимает реальный Connect-хендлер с fake-репозиторием и возвращает
// типобезопасный клиент, ходящий через HTTP на тестовый сервер.
func setup(t *testing.T) (hemav1connect.AuthServiceClient, *testutil.FakeRepo) {
	t.Helper()

	repo := testutil.NewFakeRepo()
	tokens := jwt.NewManager("access-secret", "refresh-secret", 15*time.Minute, 720*time.Hour)
	svc := service.New(repo, tokens)
	handler := NewHandler(svc)

	path, h := hemav1connect.NewAuthServiceHandler(handler)
	mux := http.NewServeMux()
	mux.Handle(path, h)

	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	client := hemav1connect.NewAuthServiceClient(server.Client(), server.URL)
	return client, repo
}

func TestRegister_E2E(t *testing.T) {
	client, _ := setup(t)

	res, err := client.Register(context.Background(), connect.NewRequest(&hemav1.RegisterRequest{
		Email:       "e2e@hema.test",
		Password:    "longsword123",
		DisplayName: "E2E Knight",
	}))
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	if res.Msg.User == nil {
		t.Fatal("user should not be nil")
	}
	if res.Msg.User.Email != "e2e@hema.test" {
		t.Errorf("Email = %q", res.Msg.User.Email)
	}
	if res.Msg.User.Id == "" {
		t.Error("user ID should not be empty")
	}
	if res.Msg.Tokens == nil {
		t.Fatal("tokens should not be nil")
	}
	if res.Msg.Tokens.AccessToken == "" || res.Msg.Tokens.RefreshToken == "" {
		t.Error("tokens should not be empty")
	}
}

func TestRegister_E2E_DuplicateReturnsAlreadyExists(t *testing.T) {
	client, _ := setup(t)

	_, err := client.Register(context.Background(), connect.NewRequest(&hemav1.RegisterRequest{
		Email:    "dup@hema.test",
		Password: "pass",
	}))
	if err != nil {
		t.Fatalf("first Register: %v", err)
	}

	_, err = client.Register(context.Background(), connect.NewRequest(&hemav1.RegisterRequest{
		Email:    "dup@hema.test",
		Password: "pass",
	}))
	if connect.CodeOf(err) != connect.CodeAlreadyExists {
		t.Errorf("expected CodeAlreadyExists, got %v", connect.CodeOf(err))
	}
}

func TestLogin_E2E(t *testing.T) {
	client, _ := setup(t)

	_, err := client.Register(context.Background(), connect.NewRequest(&hemav1.RegisterRequest{
		Email:    "login@hema.test",
		Password: "mypass",
	}))
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	res, err := client.Login(context.Background(), connect.NewRequest(&hemav1.LoginRequest{
		Email:    "login@hema.test",
		Password: "mypass",
	}))
	if err != nil {
		t.Fatalf("Login: %v", err)
	}
	if res.Msg.User.Email != "login@hema.test" {
		t.Errorf("Email = %q", res.Msg.User.Email)
	}
	if res.Msg.Tokens.AccessToken == "" {
		t.Error("access token should not be empty")
	}
}

func TestLogin_E2E_WrongPasswordReturnsUnauthenticated(t *testing.T) {
	client, _ := setup(t)

	_, _ = client.Register(context.Background(), connect.NewRequest(&hemav1.RegisterRequest{
		Email:    "login@hema.test",
		Password: "correct",
	}))

	_, err := client.Login(context.Background(), connect.NewRequest(&hemav1.LoginRequest{
		Email:    "login@hema.test",
		Password: "wrong",
	}))
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
	}
}

func TestLogin_E2E_NonexistentUserReturnsUnauthenticated(t *testing.T) {
	client, _ := setup(t)

	_, err := client.Login(context.Background(), connect.NewRequest(&hemav1.LoginRequest{
		Email:    "ghost@hema.test",
		Password: "pass",
	}))
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
	}
}

func TestMe_E2E(t *testing.T) {
	client, _ := setup(t)

	regRes, err := client.Register(context.Background(), connect.NewRequest(&hemav1.RegisterRequest{
		Email:       "me@hema.test",
		Password:    "pass",
		DisplayName: "Me User",
	}))
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	accessToken := regRes.Msg.Tokens.AccessToken

	req := connect.NewRequest(&hemav1.MeRequest{})
	req.Header().Set("Authorization", "Bearer "+accessToken)
	res, err := client.Me(context.Background(), req)
	if err != nil {
		t.Fatalf("Me: %v", err)
	}
	if res.Msg.User.Email != "me@hema.test" {
		t.Errorf("Email = %q", res.Msg.User.Email)
	}
}

func TestMe_E2E_NoTokenReturnsUnauthenticated(t *testing.T) {
	client, _ := setup(t)

	_, err := client.Me(context.Background(), connect.NewRequest(&hemav1.MeRequest{}))
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
	}
}

func TestMe_E2E_GarbageTokenReturnsUnauthenticated(t *testing.T) {
	client, _ := setup(t)

	req := connect.NewRequest(&hemav1.MeRequest{})
	req.Header().Set("Authorization", "Bearer garbage")
	_, err := client.Me(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
	}
}

func TestRefresh_E2E(t *testing.T) {
	client, _ := setup(t)

	regRes, err := client.Register(context.Background(), connect.NewRequest(&hemav1.RegisterRequest{
		Email:    "refresh@hema.test",
		Password: "pass",
	}))
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	res, err := client.Refresh(context.Background(), connect.NewRequest(&hemav1.RefreshRequest{
		RefreshToken: regRes.Msg.Tokens.RefreshToken,
	}))
	if err != nil {
		t.Fatalf("Refresh: %v", err)
	}
	if res.Msg.Tokens.AccessToken == "" {
		t.Error("new access token should not be empty")
	}
}

func TestRefresh_E2E_InvalidTokenReturnsUnauthenticated(t *testing.T) {
	client, _ := setup(t)

	_, err := client.Refresh(context.Background(), connect.NewRequest(&hemav1.RefreshRequest{
		RefreshToken: "garbage",
	}))
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
	}
}

func TestRefresh_E2E_AccessTokenRejected(t *testing.T) {
	client, _ := setup(t)

	regRes, err := client.Register(context.Background(), connect.NewRequest(&hemav1.RegisterRequest{
		Email:    "rt@hema.test",
		Password: "pass",
	}))
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	_, err = client.Refresh(context.Background(), connect.NewRequest(&hemav1.RefreshRequest{
		RefreshToken: regRes.Msg.Tokens.AccessToken,
	}))
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("access token should not work as refresh, got %v", connect.CodeOf(err))
	}
}
