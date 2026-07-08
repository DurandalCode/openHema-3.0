//go:build integration

// Package integration — сквозные e2e-тесты модуля tournament на реальной
// PostgreSQL (testcontainers) через полный Connect-путь: proto-binary →
// интерсепторы → handler → service → repo → SQL → back. См. ADR 0010.
package integration

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	hemav1 "github.com/hema/server/gen/hema/v1"
	"github.com/hema/server/gen/hema/v1/hemav1connect"
	"github.com/hema/server/internal/testdb"
	"github.com/hema/server/modules/auth"
	"github.com/hema/server/modules/tournament"
	"github.com/hema/server/pkg/connectutil"
	"github.com/hema/server/pkg/jwt"
)

const (
	adminUserID = "00000000-0000-0000-0000-000000000aaa"
	accessKey   = "integration-access-secret"
	refreshKey  = "integration-refresh-secret"
)

// setup поднимает PG (testdb.Postgres), применяет миграции auth+tournament,
// собирает composition root (auth + tournament модули с реальным пулом БД),
// оборачивает в httptest.Server и возвращает Connect-клиенты. t.Cleanup
// освобождает ресурсы (контейнер + пул + сервер).
func setup(t *testing.T) (hemav1connect.TournamentServiceClient, hemav1connect.TournamentAdminServiceClient) {
	t.Helper()
	pool := testdb.Postgres(t)

	tokens := jwt.NewManager(accessKey, refreshKey, 15*time.Minute, 720*time.Hour)
	baseOpts := []connect.HandlerOption{
		connect.WithInterceptors(connectutil.Auth(tokens)),
	}
	adminOpts := []connect.HandlerOption{
		connect.WithInterceptors(connectutil.RequireAdmin()),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	auth.Register(mux, auth.Deps{Pool: pool, Tokens: tokens}, baseOpts, adminOpts)
	tournament.Register(mux, tournament.Deps{Pool: pool}, baseOpts, adminOpts)

	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	client := server.Client()
	pub := hemav1connect.NewTournamentServiceClient(client, server.URL)
	admin := hemav1connect.NewTournamentAdminServiceClient(client, server.URL)
	return pub, admin
}

func adminBearer(t *testing.T) string {
	t.Helper()
	tokens := jwt.NewManager(accessKey, refreshKey, 15*time.Minute, 720*time.Hour)
	pair, err := tokens.Issue(adminUserID, "admin")
	if err != nil {
		t.Fatalf("issue admin token: %v", err)
	}
	return "Bearer " + pair.Access
}

// TestIntegration_MigrationsApplied — косвенно: setup гоняет goose Up для
// auth и tournament. Если миграции падают (например, одинаково названные
// 00001_init.sql silent-skip'нули друг друга при общей goose_db_version),
// setup валится здесь — схему tournament не создать.
func TestIntegration_MigrationsApplied(t *testing.T) {
	setup(t)
}

func TestIntegration_GetActiveTournament_SeedEmpty(t *testing.T) {
	pub, _ := setup(t)

	res, err := pub.GetActiveTournament(context.Background(),
		connect.NewRequest(&hemav1.GetActiveTournamentRequest{}))
	if err != nil {
		t.Fatalf("GetActiveTournament: %v", err)
	}
	tr := res.Msg.Tournament
	if tr == nil {
		t.Fatal("seed tournament should exist")
	}
	if tr.Title != "" {
		t.Errorf("seed title = %q, want empty", tr.Title)
	}
	if len(tr.Contacts) != 0 {
		t.Errorf("seed contacts len = %d, want 0", len(tr.Contacts))
	}
	if !tr.IsActive {
		t.Error("seed tournament should be active")
	}
	// proto3-omitted на транспортной границе: пустой сид без дат.
	if tr.EventStartAt != nil {
		t.Errorf("seed event_start_at should be nil, got %v", tr.EventStartAt)
	}
	if tr.EventEndAt != nil {
		t.Errorf("seed event_end_at should be nil, got %v", tr.EventEndAt)
	}
}

func TestIntegration_GetActiveTournament_NoTokenAllowed(t *testing.T) {
	pub, _ := setup(t)

	_, err := pub.GetActiveTournament(context.Background(),
		connect.NewRequest(&hemav1.GetActiveTournamentRequest{}))
	if err != nil {
		t.Errorf("public RPC without token should not fail, got %v", err)
	}
}

func TestIntegration_UpdateActiveTournament_HappyPathAndPersisted(t *testing.T) {
	pub, admin := setup(t)

	start := timestamppb.New(time.Date(2026, 12, 1, 10, 0, 0, 0, time.UTC))
	req := connect.NewRequest(&hemav1.UpdateActiveTournamentRequest{
		Title:        "Integration Cup",
		Description:  "e2e with real PG",
		EventStartAt: start,
		EmblemUrl:    "https://cdn.example.com/logo.png",
		Contacts: []*hemav1.ContactInput{
			{Type: hemav1.ContactType_CONTACT_TYPE_TELEGRAM, Value: "@org"},
			{Type: hemav1.ContactType_CONTACT_TYPE_WEBSITE, Value: "https://example.com"},
		},
	})
	req.Header().Set("Authorization", adminBearer(t))

	res, err := admin.UpdateActiveTournament(context.Background(), req)
	if err != nil {
		t.Fatalf("UpdateActiveTournament: %v", err)
	}
	got := res.Msg.Tournament
	if got.Title != "Integration Cup" {
		t.Errorf("title = %q", got.Title)
	}
	if len(got.Contacts) != 2 {
		t.Fatalf("contacts len = %d, want 2", len(got.Contacts))
	}
	if got.Contacts[0].Position != 0 || got.Contacts[1].Position != 1 {
		t.Errorf("positions = %d, %d", got.Contacts[0].Position, got.Contacts[1].Position)
	}
	if got.EventStartAt == nil || !got.EventStartAt.AsTime().Equal(start.AsTime()) {
		t.Errorf("event_start_at round-trip = %v, want %v", got.EventStartAt, start)
	}
	if got.EventEndAt != nil {
		t.Errorf("event_end_at should be nil for single-day, got %v", got.EventEndAt)
	}

	// Повторный Get подтверждает, что изменения сохранены в БД, а не только в ответе.
	got2, err := pub.GetActiveTournament(context.Background(),
		connect.NewRequest(&hemav1.GetActiveTournamentRequest{}))
	if err != nil {
		t.Fatalf("GetActiveTournament after update: %v", err)
	}
	if got2.Msg.Tournament.Title != "Integration Cup" {
		t.Errorf("persisted title = %q", got2.Msg.Tournament.Title)
	}
	if len(got2.Msg.Tournament.Contacts) != 2 {
		t.Errorf("persisted contacts len = %d, want 2", len(got2.Msg.Tournament.Contacts))
	}
}

func TestIntegration_UpdateActiveTournament_MultiDay(t *testing.T) {
	pub, admin := setup(t)
	_ = pub

	start := timestamppb.New(time.Date(2026, 12, 1, 10, 0, 0, 0, time.UTC))
	end := timestamppb.New(time.Date(2026, 12, 3, 18, 0, 0, 0, time.UTC))
	req := connect.NewRequest(&hemav1.UpdateActiveTournamentRequest{
		Title:        "Multi-day festival",
		EventStartAt: start,
		EventEndAt:   end,
	})
	req.Header().Set("Authorization", adminBearer(t))

	res, err := admin.UpdateActiveTournament(context.Background(), req)
	if err != nil {
		t.Fatalf("UpdateActiveTournament (multi-day): %v", err)
	}
	got := res.Msg.Tournament
	if got.EventStartAt == nil || !got.EventStartAt.AsTime().Equal(start.AsTime()) {
		t.Errorf("event_start_at = %v, want %v", got.EventStartAt, start)
	}
	if got.EventEndAt == nil || !got.EventEndAt.AsTime().Equal(end.AsTime()) {
		t.Errorf("event_end_at = %v, want %v", got.EventEndAt, end)
	}
}

func TestIntegration_UpdateActiveTournament_EventEndBeforeStart(t *testing.T) {
	_, admin := setup(t)

	start := timestamppb.New(time.Date(2026, 12, 3, 18, 0, 0, 0, time.UTC))
	end := timestamppb.New(time.Date(2026, 12, 1, 10, 0, 0, 0, time.UTC))
	req := connect.NewRequest(&hemav1.UpdateActiveTournamentRequest{
		Title:        "Bad range",
		EventStartAt: start,
		EventEndAt:   end,
	})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.UpdateActiveTournament(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Errorf("expected CodeInvalidArgument for end before start, got %v", connect.CodeOf(err))
	}
}

func TestIntegration_UpdateActiveTournament_EventEndWithoutStart(t *testing.T) {
	_, admin := setup(t)

	end := timestamppb.Now()
	req := connect.NewRequest(&hemav1.UpdateActiveTournamentRequest{
		Title:      "No start",
		EventEndAt: end,
	})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.UpdateActiveTournament(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Errorf("expected CodeInvalidArgument for end without start, got %v", connect.CodeOf(err))
	}
}

// TestIntegration_UpdateActiveTournament_NoToken — ловит регрессию
// authentication: admin-RPC без токена должен отказать, а не падать в
// незащищённый path или segfault.
func TestIntegration_UpdateActiveTournament_NoToken(t *testing.T) {
	_, admin := setup(t)

	_, err := admin.UpdateActiveTournament(context.Background(),
		connect.NewRequest(&hemav1.UpdateActiveTournamentRequest{Title: "T"}))
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated without token, got %v", connect.CodeOf(err))
	}
}