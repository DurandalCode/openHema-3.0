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
	"github.com/hema/server/modules/arena/domain"
	"github.com/hema/server/modules/arena/service"
	"github.com/hema/server/modules/arena/testutil"
	"github.com/hema/server/pkg/connectutil"
	"github.com/hema/server/pkg/jwt"
)

const (
	adminUserID           = "00000000-0000-0000-0000-000000000aaa"
	activeTournamentID    = "11111111-1111-1111-1111-111111111111"
	nonActiveTournamentID = "22222222-2222-2222-2222-222222222222"
)

// setup поднимает реальные Connect-хендлеры с fake-репозиторием и
// fake-провайдером активного турнира. Конфигурация повторяет прод-сетап:
// глобально Auth (валидация Bearer), на admin-сервис — RequireAdmin.
func setup(t *testing.T, arenas ...domain.Arena) (hemav1connect.ArenaAdminServiceClient, *testutil.FakeRepo) {
	t.Helper()

	repo := testutil.NewFakeRepoWithArenas(arenas...)
	provider := testutil.NewFakeActiveTournamentProvider(activeTournamentID)
	tokens := jwt.NewManager("access-secret", "refresh-secret", 15*time.Minute, 720*time.Hour)
	svc := service.New(repo, provider)
	handler := NewAdminHandler(svc)

	baseOpts := []connect.HandlerOption{
		connect.WithInterceptors(connectutil.Auth(tokens)),
	}
	adminOpts := []connect.HandlerOption{
		connect.WithInterceptors(connectutil.RequireAdmin()),
	}

	adminPath, adminH := hemav1connect.NewArenaAdminServiceHandler(handler, append(baseOpts, adminOpts...)...)

	mux := http.NewServeMux()
	mux.Handle(adminPath, adminH)

	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	client := server.Client()
	adminClient := hemav1connect.NewArenaAdminServiceClient(client, server.URL)
	return adminClient, repo
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

func seedArena(id, name string, position int32) domain.Arena {
	return domain.Arena{
		ID:           id,
		TournamentID: activeTournamentID,
		Name:         name,
		Description:  "desc",
		Position:     position,
		Status:       domain.StatusActive,
	}
}

func seedArenaStatus(id, name string, position int32, status domain.Status) domain.Arena {
	a := seedArena(id, name, position)
	a.Status = status
	return a
}

func TestListArenas_E2E(t *testing.T) {
	admin, _ := setup(t,
		seedArena("a1", "Ристалище 1", 0),
		seedArena("a2", "Ристалище 2", 1),
	)

	req := connect.NewRequest(&hemav1.ListArenasRequest{TournamentId: activeTournamentID})
	req.Header().Set("Authorization", adminBearer(t))

	res, err := admin.ListArenas(context.Background(), req)
	if err != nil {
		t.Fatalf("ListArenas: %v", err)
	}
	if len(res.Msg.Arenas) != 2 {
		t.Fatalf("len = %d, want 2", len(res.Msg.Arenas))
	}
	if res.Msg.Arenas[0].Name != "Ристалище 1" || res.Msg.Arenas[1].Name != "Ристалище 2" {
		t.Errorf("order mismatch: %+v", res.Msg.Arenas)
	}
}

func TestListArenas_E2E_NonActiveTournamentReturnsNotFound(t *testing.T) {
	admin, _ := setup(t)

	req := connect.NewRequest(&hemav1.ListArenasRequest{TournamentId: nonActiveTournamentID})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.ListArenas(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeNotFound {
		t.Errorf("expected CodeNotFound, got %v", connect.CodeOf(err))
	}
}

func TestGetArena_E2E(t *testing.T) {
	admin, _ := setup(t, seedArena("a1", "Ристалище 1", 0))

	req := connect.NewRequest(&hemav1.GetArenaRequest{Id: "a1"})
	req.Header().Set("Authorization", adminBearer(t))

	res, err := admin.GetArena(context.Background(), req)
	if err != nil {
		t.Fatalf("GetArena: %v", err)
	}
	if res.Msg.Arena.Name != "Ристалище 1" {
		t.Errorf("Name = %q", res.Msg.Arena.Name)
	}
	if res.Msg.Arena.Status != hemav1.ArenaStatus_ARENA_STATUS_ACTIVE {
		t.Errorf("Status = %v", res.Msg.Arena.Status)
	}
}

func TestGetArena_E2E_NotFound(t *testing.T) {
	admin, _ := setup(t)

	req := connect.NewRequest(&hemav1.GetArenaRequest{Id: "does-not-exist"})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.GetArena(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeNotFound {
		t.Errorf("expected CodeNotFound, got %v", connect.CodeOf(err))
	}
}

func TestCreateArena_E2E(t *testing.T) {
	admin, _ := setup(t)

	req := connect.NewRequest(&hemav1.CreateArenaRequest{
		TournamentId: activeTournamentID,
		Name:         "Главная арена",
		Description:  "У входа",
	})
	req.Header().Set("Authorization", adminBearer(t))

	res, err := admin.CreateArena(context.Background(), req)
	if err != nil {
		t.Fatalf("CreateArena: %v", err)
	}
	got := res.Msg.Arena
	if got.Name != "Главная арена" {
		t.Errorf("Name = %q", got.Name)
	}
	if got.TournamentId != activeTournamentID {
		t.Errorf("TournamentId = %q", got.TournamentId)
	}
	if got.Position != 0 {
		t.Errorf("Position = %d, want 0", got.Position)
	}
	if got.Status != hemav1.ArenaStatus_ARENA_STATUS_ACTIVE {
		t.Errorf("Status = %v", got.Status)
	}
	if got.CreatedAt == nil || got.UpdatedAt == nil {
		t.Errorf("timestamps not set: %+v", got)
	}
}

func TestCreateArena_E2E_EmptyNameReturnsInvalidArgument(t *testing.T) {
	admin, _ := setup(t)

	req := connect.NewRequest(&hemav1.CreateArenaRequest{
		TournamentId: activeTournamentID,
		Name:         "   ",
	})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.CreateArena(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Errorf("expected CodeInvalidArgument, got %v", connect.CodeOf(err))
	}
}

func TestCreateArena_E2E_MissingTournamentIDReturnsInvalidArgument(t *testing.T) {
	admin, _ := setup(t)

	req := connect.NewRequest(&hemav1.CreateArenaRequest{Name: "T"})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.CreateArena(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Errorf("expected CodeInvalidArgument, got %v", connect.CodeOf(err))
	}
}

func TestCreateArena_E2E_NonActiveTournamentReturnsNotFound(t *testing.T) {
	admin, _ := setup(t)

	req := connect.NewRequest(&hemav1.CreateArenaRequest{
		TournamentId: nonActiveTournamentID,
		Name:         "T",
	})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.CreateArena(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeNotFound {
		t.Errorf("expected CodeNotFound, got %v", connect.CodeOf(err))
	}
}

func TestCreateArena_E2E_NoTokenReturnsUnauthenticated(t *testing.T) {
	admin, _ := setup(t)

	_, err := admin.CreateArena(context.Background(),
		connect.NewRequest(&hemav1.CreateArenaRequest{TournamentId: activeTournamentID, Name: "T"}))
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
	}
}

func TestCreateArena_E2E_NonAdminReturnsPermissionDenied(t *testing.T) {
	admin, _ := setup(t)

	req := connect.NewRequest(&hemav1.CreateArenaRequest{TournamentId: activeTournamentID, Name: "T"})
	req.Header().Set("Authorization", userBearer(t))

	_, err := admin.CreateArena(context.Background(), req)
	if connect.CodeOf(err) != connect.CodePermissionDenied {
		t.Errorf("expected CodePermissionDenied, got %v", connect.CodeOf(err))
	}
}

func TestUpdateArena_E2E(t *testing.T) {
	admin, _ := setup(t, seedArena("a1", "Old", 0))

	req := connect.NewRequest(&hemav1.UpdateArenaRequest{
		Id:          "a1",
		Name:         "New",
		Description:  "Updated",
	})
	req.Header().Set("Authorization", adminBearer(t))

	res, err := admin.UpdateArena(context.Background(), req)
	if err != nil {
		t.Fatalf("UpdateArena: %v", err)
	}
	if res.Msg.Arena.Name != "New" || res.Msg.Arena.Description != "Updated" {
		t.Errorf("got = %+v", res.Msg.Arena)
	}
}

func TestUpdateArena_E2E_EmptyNameReturnsInvalidArgument(t *testing.T) {
	admin, _ := setup(t, seedArena("a1", "Old", 0))

	req := connect.NewRequest(&hemav1.UpdateArenaRequest{Id: "a1", Name: "  "})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.UpdateArena(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Errorf("expected CodeInvalidArgument, got %v", connect.CodeOf(err))
	}
}

func TestUpdateArena_E2E_NotFound(t *testing.T) {
	admin, _ := setup(t)

	req := connect.NewRequest(&hemav1.UpdateArenaRequest{Id: "does-not-exist", Name: "T"})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.UpdateArena(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeNotFound {
		t.Errorf("expected CodeNotFound, got %v", connect.CodeOf(err))
	}
}

func TestArchiveArena_E2E(t *testing.T) {
	admin, _ := setup(t, seedArena("a1", "T", 0))

	req := connect.NewRequest(&hemav1.ArchiveArenaRequest{Id: "a1"})
	req.Header().Set("Authorization", adminBearer(t))

	res, err := admin.ArchiveArena(context.Background(), req)
	if err != nil {
		t.Fatalf("ArchiveArena: %v", err)
	}
	if res.Msg.Arena.Status != hemav1.ArenaStatus_ARENA_STATUS_ARCHIVED {
		t.Errorf("Status = %v", res.Msg.Arena.Status)
	}
}

func TestArchiveArena_E2E_NotFound(t *testing.T) {
	admin, _ := setup(t)

	req := connect.NewRequest(&hemav1.ArchiveArenaRequest{Id: "does-not-exist"})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.ArchiveArena(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeNotFound {
		t.Errorf("expected CodeNotFound, got %v", connect.CodeOf(err))
	}
}

func TestArchiveArena_E2E_NoTokenReturnsUnauthenticated(t *testing.T) {
	admin, _ := setup(t, seedArena("a1", "T", 0))

	_, err := admin.ArchiveArena(context.Background(),
		connect.NewRequest(&hemav1.ArchiveArenaRequest{Id: "a1"}))
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
	}
}

func TestRestoreArena_E2E(t *testing.T) {
	admin, _ := setup(t, seedArenaStatus("a1", "T", 0, domain.StatusArchived))

	req := connect.NewRequest(&hemav1.RestoreArenaRequest{Id: "a1"})
	req.Header().Set("Authorization", adminBearer(t))

	res, err := admin.RestoreArena(context.Background(), req)
	if err != nil {
		t.Fatalf("RestoreArena: %v", err)
	}
	if res.Msg.Arena.Status != hemav1.ArenaStatus_ARENA_STATUS_ACTIVE {
		t.Errorf("Status = %v", res.Msg.Arena.Status)
	}
}

func TestRestoreArena_E2E_NotFound(t *testing.T) {
	admin, _ := setup(t)

	req := connect.NewRequest(&hemav1.RestoreArenaRequest{Id: "does-not-exist"})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.RestoreArena(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeNotFound {
		t.Errorf("expected CodeNotFound, got %v", connect.CodeOf(err))
	}
}

func TestReorderArenas_E2E(t *testing.T) {
	admin, _ := setup(t,
		seedArena("a1", "A", 0),
		seedArena("a2", "B", 1),
		seedArena("a3", "C", 2),
	)

	req := connect.NewRequest(&hemav1.ReorderArenasRequest{
		TournamentId: activeTournamentID,
		OrderedIds:   []string{"a3", "a1", "a2"},
	})
	req.Header().Set("Authorization", adminBearer(t))

	res, err := admin.ReorderArenas(context.Background(), req)
	if err != nil {
		t.Fatalf("ReorderArenas: %v", err)
	}
	if len(res.Msg.Arenas) != 3 {
		t.Fatalf("len = %d, want 3", len(res.Msg.Arenas))
	}
	if res.Msg.Arenas[0].Id != "a3" || res.Msg.Arenas[1].Id != "a1" || res.Msg.Arenas[2].Id != "a2" {
		t.Errorf("order mismatch: %+v", res.Msg.Arenas)
	}

	listReq := connect.NewRequest(&hemav1.ListArenasRequest{TournamentId: activeTournamentID})
	listReq.Header().Set("Authorization", adminBearer(t))
	listRes, err := admin.ListArenas(context.Background(), listReq)
	if err != nil {
		t.Fatalf("ListArenas after reorder: %v", err)
	}
	if listRes.Msg.Arenas[0].Id != "a3" {
		t.Errorf("persisted order mismatch: %+v", listRes.Msg.Arenas)
	}
}

func TestReorderArenas_E2E_WrongLengthReturnsInvalidArgument(t *testing.T) {
	admin, _ := setup(t,
		seedArena("a1", "A", 0),
		seedArena("a2", "B", 1),
	)

	req := connect.NewRequest(&hemav1.ReorderArenasRequest{
		TournamentId: activeTournamentID,
		OrderedIds:   []string{"a1"},
	})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.ReorderArenas(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Errorf("expected CodeInvalidArgument, got %v", connect.CodeOf(err))
	}
}

func TestReorderArenas_E2E_NoTokenReturnsUnauthenticated(t *testing.T) {
	admin, _ := setup(t, seedArena("a1", "A", 0))

	_, err := admin.ReorderArenas(context.Background(),
		connect.NewRequest(&hemav1.ReorderArenasRequest{TournamentId: activeTournamentID, OrderedIds: []string{"a1"}}))
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
	}
}