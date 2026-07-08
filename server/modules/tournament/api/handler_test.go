package api

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
	"github.com/hema/server/modules/tournament/domain"
	"github.com/hema/server/modules/tournament/service"
	"github.com/hema/server/modules/tournament/testutil"
	"github.com/hema/server/pkg/connectutil"
	"github.com/hema/server/pkg/jwt"
)

const adminUserID = "00000000-0000-0000-0000-000000000aaa"

// setup поднимает реальные Connect-хендлеры с fake-репозиторием и возвращает
// клиентов для публичного и admin-сервисов турнира. Конфигурация повторяет
// прод-сетап: глобально Auth (валидация Bearer), на admin-сервис — RequireAdmin.
func setup(t *testing.T) (hemav1connect.TournamentServiceClient, hemav1connect.TournamentAdminServiceClient, *testutil.FakeRepo) {
	t.Helper()

	repo := testutil.NewFakeRepoWithActive(domain.Tournament{
		ID:          "00000000-0000-0000-0000-000000000001",
		Title:       "Seeded Cup",
		Description: "Initial",
		Contacts: []domain.Contact{
			{ID: "c1", Type: domain.ContactTypeTelegram, Value: "@seed", Position: 0},
		},
	})
	tokens := jwt.NewManager("access-secret", "refresh-secret", 15*time.Minute, 720*time.Hour)
	svc := service.New(repo)
	pubHandler := NewHandler(svc)
	adminHandler := NewAdminHandler(svc)

	baseOpts := []connect.HandlerOption{
		connect.WithInterceptors(connectutil.Auth(tokens)),
	}
	adminOpts := []connect.HandlerOption{
		connect.WithInterceptors(connectutil.RequireAdmin()),
	}

	pubPath, pubH := hemav1connect.NewTournamentServiceHandler(pubHandler, baseOpts...)
	adminPath, adminH := hemav1connect.NewTournamentAdminServiceHandler(adminHandler, append(baseOpts, adminOpts...)...)

	mux := http.NewServeMux()
	mux.Handle(pubPath, pubH)
	mux.Handle(adminPath, adminH)

	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	client := server.Client()
	pubClient := hemav1connect.NewTournamentServiceClient(client, server.URL)
	adminClient := hemav1connect.NewTournamentAdminServiceClient(client, server.URL)
	return pubClient, adminClient, repo
}

// setupEmptyRepo — как setup, но без активного турнира (для проверок ErrNotFound).
func setupEmptyRepo(t *testing.T) (hemav1connect.TournamentServiceClient, hemav1connect.TournamentAdminServiceClient) {
	t.Helper()

	repo := testutil.NewFakeRepo()
	tokens := jwt.NewManager("access-secret", "refresh-secret", 15*time.Minute, 720*time.Hour)
	svc := service.New(repo)
	pubHandler := NewHandler(svc)
	adminHandler := NewAdminHandler(svc)

	baseOpts := []connect.HandlerOption{connect.WithInterceptors(connectutil.Auth(tokens))}
	adminOpts := []connect.HandlerOption{connect.WithInterceptors(connectutil.RequireAdmin())}

	pubPath, pubH := hemav1connect.NewTournamentServiceHandler(pubHandler, baseOpts...)
	adminPath, adminH := hemav1connect.NewTournamentAdminServiceHandler(adminHandler, append(baseOpts, adminOpts...)...)

	mux := http.NewServeMux()
	mux.Handle(pubPath, pubH)
	mux.Handle(adminPath, adminH)

	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	client := server.Client()
	return hemav1connect.NewTournamentServiceClient(client, server.URL),
		hemav1connect.NewTournamentAdminServiceClient(client, server.URL)
}

func adminBearer(t *testing.T) string {
	t.Helper()
	tokens := jwt.NewManager("access-secret", "refresh-secret", 15*time.Minute, 720*time.Hour)
	pair, err := tokens.Issue(adminUserID, "admin")
	if err != nil {
		t.Fatalf("issue admin token: %v", err)
	}
	return "Bearer " + pair.Access
}

func userBearer(t *testing.T) string {
	t.Helper()
	tokens := jwt.NewManager("access-secret", "refresh-secret", 15*time.Minute, 720*time.Hour)
	pair, err := tokens.Issue("user-id", "user")
	if err != nil {
		t.Fatalf("issue user token: %v", err)
	}
	return "Bearer " + pair.Access
}

func TestGetActiveTournament_E2E(t *testing.T) {
	client, _, _ := setup(t)

	res, err := client.GetActiveTournament(context.Background(), connect.NewRequest(&hemav1.GetActiveTournamentRequest{}))
	if err != nil {
		t.Fatalf("GetActiveTournament: %v", err)
	}
	if res.Msg.Tournament == nil {
		t.Fatal("tournament should not be nil")
	}
	if res.Msg.Tournament.Title != "Seeded Cup" {
		t.Errorf("Title = %q", res.Msg.Tournament.Title)
	}
	if len(res.Msg.Tournament.Contacts) != 1 {
		t.Fatalf("Contacts len = %d, want 1", len(res.Msg.Tournament.Contacts))
	}
	if res.Msg.Tournament.Contacts[0].Value != "@seed" {
		t.Errorf("Contact value = %q", res.Msg.Tournament.Contacts[0].Value)
	}
	if res.Msg.Tournament.Contacts[0].Type != hemav1.ContactType_CONTACT_TYPE_TELEGRAM {
		t.Errorf("Contact type = %v", res.Msg.Tournament.Contacts[0].Type)
	}
}

func TestGetActiveTournament_E2E_NoTokenAllowed(t *testing.T) {
	client, _, _ := setup(t)

	// Никакого Authorization не ставим — публичный RPC (в publicProcedures).
	_, err := client.GetActiveTournament(context.Background(), connect.NewRequest(&hemav1.GetActiveTournamentRequest{}))
	if err != nil {
		t.Errorf("public RPC should not require token, got %v", err)
	}
}

func TestGetActiveTournament_E2E_NotFound(t *testing.T) {
	client, _ := setupEmptyRepo(t)

	_, err := client.GetActiveTournament(context.Background(), connect.NewRequest(&hemav1.GetActiveTournamentRequest{}))
	if connect.CodeOf(err) != connect.CodeNotFound {
		t.Errorf("expected CodeNotFound, got %v", connect.CodeOf(err))
	}
}

func TestUpdateActiveTournament_E2E(t *testing.T) {
	_, client, _ := setup(t)

	start := timestamppb.Now()
	req := connect.NewRequest(&hemav1.UpdateActiveTournamentRequest{
		Title:         "Updated Title",
		EmblemUrl:     "https://cdn.example.com/logo.png",
		EventStartAt: start,
		Contacts: []*hemav1.ContactInput{
			{Type: hemav1.ContactType_CONTACT_TYPE_TELEGRAM, Value: "@org"},
			{Type: hemav1.ContactType_CONTACT_TYPE_WEBSITE, Value: "https://example.com"},
		},
	})
	req.Header().Set("Authorization", adminBearer(t))

	res, err := client.UpdateActiveTournament(context.Background(), req)
	if err != nil {
		t.Fatalf("UpdateActiveTournament: %v", err)
	}
	if res.Msg.Tournament.Title != "Updated Title" {
		t.Errorf("Title = %q", res.Msg.Tournament.Title)
	}
	if len(res.Msg.Tournament.Contacts) != 2 {
		t.Fatalf("Contacts len = %d, want 2", len(res.Msg.Tournament.Contacts))
	}
	if res.Msg.Tournament.Contacts[0].Position != 0 || res.Msg.Tournament.Contacts[1].Position != 1 {
		t.Errorf("positions = %d, %d", res.Msg.Tournament.Contacts[0].Position, res.Msg.Tournament.Contacts[1].Position)
	}
}

func TestUpdateActiveTournament_E2E_MultiDay(t *testing.T) {
	_, client, _ := setup(t)

	start := timestamppb.New(time.Date(2026, 12, 1, 10, 0, 0, 0, time.UTC))
	end := timestamppb.New(time.Date(2026, 12, 3, 18, 0, 0, 0, time.UTC))
	req := connect.NewRequest(&hemav1.UpdateActiveTournamentRequest{
		Title:         "Multi-day Cup",
		EventStartAt: start,
		EventEndAt:   end,
	})
	req.Header().Set("Authorization", adminBearer(t))

	res, err := client.UpdateActiveTournament(context.Background(), req)
	if err != nil {
		t.Fatalf("UpdateActiveTournament (multi-day): %v", err)
	}
	if res.Msg.Tournament.EventStartAt == nil || res.Msg.Tournament.EventEndAt == nil {
		t.Fatalf("expected both start and end set, got start=%v end=%v",
			res.Msg.Tournament.EventStartAt, res.Msg.Tournament.EventEndAt)
	}
	if !res.Msg.Tournament.EventStartAt.AsTime().Equal(start.AsTime()) {
		t.Errorf("EventStartAt = %v, want %v", res.Msg.Tournament.EventStartAt.AsTime(), start.AsTime())
	}
	if !res.Msg.Tournament.EventEndAt.AsTime().Equal(end.AsTime()) {
		t.Errorf("EventEndAt = %v, want %v", res.Msg.Tournament.EventEndAt.AsTime(), end.AsTime())
	}
}

func TestUpdateActiveTournament_E2E_EventEndWithoutStart_InvalidArgument(t *testing.T) {
	_, client, _ := setup(t)

	end := timestamppb.Now()
	req := connect.NewRequest(&hemav1.UpdateActiveTournamentRequest{
		Title:       "T",
		EventEndAt: end,
	})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := client.UpdateActiveTournament(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Errorf("expected CodeInvalidArgument for end without start, got %v", connect.CodeOf(err))
	}
}

func TestUpdateActiveTournament_E2E_EmptyTitleReturnsInvalidArgument(t *testing.T) {
	_, client, _ := setup(t)

	req := connect.NewRequest(&hemav1.UpdateActiveTournamentRequest{Title: "   "})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := client.UpdateActiveTournament(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Errorf("expected CodeInvalidArgument, got %v", connect.CodeOf(err))
	}
}

func TestUpdateActiveTournament_E2E_NoTokenReturnsUnauthenticated(t *testing.T) {
	_, client, _ := setup(t)

	_, err := client.UpdateActiveTournament(context.Background(),
		connect.NewRequest(&hemav1.UpdateActiveTournamentRequest{Title: "T"}))
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
	}
}

func TestUpdateActiveTournament_E2E_NonAdminUserReturnsPermissionDenied(t *testing.T) {
	_, client, _ := setup(t)

	req := connect.NewRequest(&hemav1.UpdateActiveTournamentRequest{Title: "T"})
	req.Header().Set("Authorization", userBearer(t))

	_, err := client.UpdateActiveTournament(context.Background(), req)
	if connect.CodeOf(err) != connect.CodePermissionDenied {
		t.Errorf("expected CodePermissionDenied, got %v", connect.CodeOf(err))
	}
}

func TestUpdateActiveTournament_E2E_NoActiveReturnsNotFound(t *testing.T) {
	_, client := setupEmptyRepo(t)

	req := connect.NewRequest(&hemav1.UpdateActiveTournamentRequest{Title: "T"})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := client.UpdateActiveTournament(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeNotFound {
		t.Errorf("expected CodeNotFound, got %v", connect.CodeOf(err))
	}
}