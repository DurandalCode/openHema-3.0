//go:build integration

// Package integration — сквозные e2e-тесты модуля arena на реальной
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

	hemav1 "github.com/hema/server/gen/hema/v1"
	"github.com/hema/server/gen/hema/v1/hemav1connect"
	"github.com/hema/server/internal/testdb"
	"github.com/hema/server/modules/arena"
	"github.com/hema/server/modules/auth"
	"github.com/hema/server/modules/tournament"
	"github.com/hema/server/pkg/connectutil"
	"github.com/hema/server/pkg/jwt"
)

const (
	adminUserID  = "00000000-0000-0000-0000-000000000aaa"
	accessKey    = "integration-access-secret"
	refreshKey   = "integration-refresh-secret"
	seedTournamentID = "00000000-0000-0000-0000-000000000001"
)

// setup поднимает PG (testdb.Postgres), применяет миграции auth+tournament+
// arena, собирает composition root (реальный пул БД) и возвращает
// Connect-клиента admin-сервиса площадок.
func setup(t *testing.T) hemav1connect.ArenaAdminServiceClient {
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
	arena.Register(mux, arena.Deps{
		Pool:        pool,
		Tournaments: tournament.NewActiveTournamentIDProvider(pool),
	}, baseOpts, adminOpts)

	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	client := server.Client()
	return hemav1connect.NewArenaAdminServiceClient(client, server.URL)
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
// auth, tournament и arena. Если миграции падают, setup валится здесь.
func TestIntegration_MigrationsApplied(t *testing.T) {
	setup(t)
}

func TestIntegration_CreateAndListArenas(t *testing.T) {
	admin := setup(t)

	req := connect.NewRequest(&hemav1.CreateArenaRequest{
		TournamentId: seedTournamentID,
		Name:         "Ристалище 1",
		Description:  "У входа, ковёр 5×5",
	})
	req.Header().Set("Authorization", adminBearer(t))

	res, err := admin.CreateArena(context.Background(), req)
	if err != nil {
		t.Fatalf("CreateArena: %v", err)
	}
	got := res.Msg.Arena
	if got.Name != "Ристалище 1" {
		t.Errorf("name = %q", got.Name)
	}
	if got.Description != "У входа, ковёр 5×5" {
		t.Errorf("description = %q", got.Description)
	}
	if got.Position != 0 {
		t.Errorf("position = %d, want 0", got.Position)
	}
	if got.Status != hemav1.ArenaStatus_ARENA_STATUS_ACTIVE {
		t.Errorf("status = %v", got.Status)
	}

	listReq := connect.NewRequest(&hemav1.ListArenasRequest{TournamentId: seedTournamentID})
	listReq.Header().Set("Authorization", adminBearer(t))
	listRes, err := admin.ListArenas(context.Background(), listReq)
	if err != nil {
		t.Fatalf("ListArenas: %v", err)
	}
	if len(listRes.Msg.Arenas) != 1 {
		t.Fatalf("arenas len = %d, want 1", len(listRes.Msg.Arenas))
	}
	if listRes.Msg.Arenas[0].Id != got.Id {
		t.Errorf("persisted id mismatch: %q vs %q", listRes.Msg.Arenas[0].Id, got.Id)
	}
}

func TestIntegration_PositionIncrementsPerTournament(t *testing.T) {
	admin := setup(t)

	create := func(name string) *hemav1.Arena {
		req := connect.NewRequest(&hemav1.CreateArenaRequest{
			TournamentId: seedTournamentID,
			Name:          name,
		})
		req.Header().Set("Authorization", adminBearer(t))
		res, err := admin.CreateArena(context.Background(), req)
		if err != nil {
			t.Fatalf("create %q: %v", name, err)
		}
		return res.Msg.Arena
	}

	a := create("A")
	b := create("B")
	c := create("C")
	if a.Position != 0 || b.Position != 1 || c.Position != 2 {
		t.Errorf("positions = %d, %d, %d, want 0, 1, 2", a.Position, b.Position, c.Position)
	}
}

func TestIntegration_CreateArena_NonActiveTournamentReturnsNotFound(t *testing.T) {
	admin := setup(t)

	req := connect.NewRequest(&hemav1.CreateArenaRequest{
		TournamentId: "99999999-9999-9999-9999-999999999999",
		Name:         "T",
	})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.CreateArena(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeNotFound {
		t.Errorf("expected CodeNotFound, got %v", connect.CodeOf(err))
	}
}

func TestIntegration_UpdateArena_HappyPathAndPersisted(t *testing.T) {
	admin := setup(t)

	createReq := connect.NewRequest(&hemav1.CreateArenaRequest{
		TournamentId: seedTournamentID,
		Name:         "Old",
	})
	createReq.Header().Set("Authorization", adminBearer(t))
	created, err := admin.CreateArena(context.Background(), createReq)
	if err != nil {
		t.Fatalf("CreateArena: %v", err)
	}

	updateReq := connect.NewRequest(&hemav1.UpdateArenaRequest{
		Id:          created.Msg.Arena.Id,
		Name:        "New Name",
		Description: "New description",
	})
	updateReq.Header().Set("Authorization", adminBearer(t))
	if _, err := admin.UpdateArena(context.Background(), updateReq); err != nil {
		t.Fatalf("UpdateArena: %v", err)
	}

	getReq := connect.NewRequest(&hemav1.GetArenaRequest{Id: created.Msg.Arena.Id})
	getReq.Header().Set("Authorization", adminBearer(t))
	got, err := admin.GetArena(context.Background(), getReq)
	if err != nil {
		t.Fatalf("GetArena: %v", err)
	}
	if got.Msg.Arena.Name != "New Name" {
		t.Errorf("persisted name = %q", got.Msg.Arena.Name)
	}
	if got.Msg.Arena.Description != "New description" {
		t.Errorf("persisted description = %q", got.Msg.Arena.Description)
	}
	if got.Msg.Arena.Id != created.Msg.Arena.Id {
		t.Errorf("id changed: %q vs %q (URL stability)", got.Msg.Arena.Id, created.Msg.Arena.Id)
	}
}

func TestIntegration_ArchiveAndRestoreArena(t *testing.T) {
	admin := setup(t)

	createReq := connect.NewRequest(&hemav1.CreateArenaRequest{
		TournamentId: seedTournamentID,
		Name:         "T",
	})
	createReq.Header().Set("Authorization", adminBearer(t))
	created, err := admin.CreateArena(context.Background(), createReq)
	if err != nil {
		t.Fatalf("CreateArena: %v", err)
	}
	id := created.Msg.Arena.Id

	archiveReq := connect.NewRequest(&hemav1.ArchiveArenaRequest{Id: id})
	archiveReq.Header().Set("Authorization", adminBearer(t))
	if _, err := admin.ArchiveArena(context.Background(), archiveReq); err != nil {
		t.Fatalf("ArchiveArena: %v", err)
	}

	getReq := connect.NewRequest(&hemav1.GetArenaRequest{Id: id})
	getReq.Header().Set("Authorization", adminBearer(t))
	got, err := admin.GetArena(context.Background(), getReq)
	if err != nil {
		t.Fatalf("GetArena after archive: %v", err)
	}
	if got.Msg.Arena.Status != hemav1.ArenaStatus_ARENA_STATUS_ARCHIVED {
		t.Errorf("status after archive = %v", got.Msg.Arena.Status)
	}
	if got.Msg.Arena.Id != id {
		t.Errorf("id changed after archive (URL stability): %q vs %q", got.Msg.Arena.Id, id)
	}

	restoreReq := connect.NewRequest(&hemav1.RestoreArenaRequest{Id: id})
	restoreReq.Header().Set("Authorization", adminBearer(t))
	if _, err := admin.RestoreArena(context.Background(), restoreReq); err != nil {
		t.Fatalf("RestoreArena: %v", err)
	}

	getReq2 := connect.NewRequest(&hemav1.GetArenaRequest{Id: id})
	getReq2.Header().Set("Authorization", adminBearer(t))
	got2, err := admin.GetArena(context.Background(), getReq2)
	if err != nil {
		t.Fatalf("GetArena after restore: %v", err)
	}
	if got2.Msg.Arena.Status != hemav1.ArenaStatus_ARENA_STATUS_ACTIVE {
		t.Errorf("status after restore = %v", got2.Msg.Arena.Status)
	}
}

func TestIntegration_ReorderArenas_TransactionalAndPersisted(t *testing.T) {
	admin := setup(t)

	createArena := func(name string) *hemav1.Arena {
		req := connect.NewRequest(&hemav1.CreateArenaRequest{
			TournamentId: seedTournamentID,
			Name:         name,
		})
		req.Header().Set("Authorization", adminBearer(t))
		res, err := admin.CreateArena(context.Background(), req)
		if err != nil {
			t.Fatalf("create %q: %v", name, err)
		}
		return res.Msg.Arena
	}

	a := createArena("A")
	b := createArena("B")
	c := createArena("C")

	req := connect.NewRequest(&hemav1.ReorderArenasRequest{
		TournamentId: seedTournamentID,
		OrderedIds:   []string{c.Id, a.Id, b.Id},
	})
	req.Header().Set("Authorization", adminBearer(t))

	res, err := admin.ReorderArenas(context.Background(), req)
	if err != nil {
		t.Fatalf("ReorderArenas: %v", err)
	}
	if len(res.Msg.Arenas) != 3 {
		t.Fatalf("len = %d, want 3", len(res.Msg.Arenas))
	}
	if res.Msg.Arenas[0].Id != c.Id || res.Msg.Arenas[1].Id != a.Id || res.Msg.Arenas[2].Id != b.Id {
		t.Errorf("order mismatch: %+v", res.Msg.Arenas)
	}

	listReq := connect.NewRequest(&hemav1.ListArenasRequest{TournamentId: seedTournamentID})
	listReq.Header().Set("Authorization", adminBearer(t))
	listRes, err := admin.ListArenas(context.Background(), listReq)
	if err != nil {
		t.Fatalf("ListArenas after reorder: %v", err)
	}
	if listRes.Msg.Arenas[0].Id != c.Id || listRes.Msg.Arenas[1].Id != a.Id || listRes.Msg.Arenas[2].Id != b.Id {
		t.Errorf("persisted order mismatch: %+v", listRes.Msg.Arenas)
	}
}

func TestIntegration_CreateArena_NoToken(t *testing.T) {
	admin := setup(t)

	_, err := admin.CreateArena(context.Background(),
		connect.NewRequest(&hemav1.CreateArenaRequest{TournamentId: seedTournamentID, Name: "T"}))
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated without token, got %v", connect.CodeOf(err))
	}
}