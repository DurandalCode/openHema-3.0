// E2E-тесты пульта турнира (спека 0043, T12): httptest + реальный
// Connect-путь с реальными интерсепторами (Auth/RequireAdmin), fake-
// провайдеры — по образцу stage_aggregates_test.go (0041).
package api

import (
	"context"
	"testing"

	"connectrpc.com/connect"

	hemav1 "github.com/hema/server/gen/hema/v1"
	"github.com/hema/server/modules/stage/domain"
)

func TestGetTournamentConsole_E2E_HappyPath(t *testing.T) {
	admin, _, repo, fighters, arenas, nominations, bouts, _ := setupFull(t)

	nominations.SeedByTournament("t1", domain.NominationRef{ID: n1, Title: "Длинный меч", Position: 1})
	fighters.Set(n1, domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"})
	poolID := repo.SeedPool(n1, 1, "f1", "f2")
	repo.SeedStatus(n1, domain.LayoutReady)
	if err := repo.SeatPool(context.Background(), poolID, "arena-1"); err != nil {
		t.Fatalf("seat pool: %v", err)
	}
	bouts.SeedBout(poolID, domain.BoutRef{
		ID: "b1", SequenceNumber: 1,
		FighterA: domain.FighterRef{ID: "f1"}, FighterB: domain.FighterRef{ID: "f2"},
		State: domain.BoutStateNotStarted,
	})
	arenas.SeedActiveArenas("t1", domain.ArenaRef{ID: "arena-1", Name: "Ристалище 1", Active: true, Position: 1})

	req := connect.NewRequest(&hemav1.GetTournamentConsoleRequest{TournamentId: "t1"})
	req.Header().Set("Authorization", adminBearer(t))
	res, err := admin.GetTournamentConsole(context.Background(), req)
	if err != nil {
		t.Fatalf("GetTournamentConsole: %v", err)
	}
	snap := res.Msg.Snapshot
	if len(snap.Arenas) != 1 || snap.Arenas[0].ArenaId != "arena-1" {
		t.Fatalf("expected 1 arena entry, got %+v", snap.Arenas)
	}
	if snap.Arenas[0].IdleState != hemav1.ArenaIdleState_ARENA_IDLE_STATE_OCCUPIED {
		t.Errorf("IdleState = %v, want OCCUPIED", snap.Arenas[0].IdleState)
	}
	if snap.Arenas[0].CurrentBout == nil || snap.Arenas[0].CurrentBout.Id != "b1" {
		t.Fatalf("expected current bout b1, got %+v", snap.Arenas[0].CurrentBout)
	}
	if snap.Arenas[0].CurrentBout.Forecast == nil {
		t.Error("expected a forecast on the current (not-started) bout")
	}
	if len(snap.Nominations) != 1 || snap.Nominations[0].NominationId != n1 {
		t.Fatalf("expected 1 nomination entry, got %+v", snap.Nominations)
	}
}

func TestGetTournamentConsole_E2E_EmptyTournamentIDReturnsInvalidArgument(t *testing.T) {
	admin, _, _, _, _, _, _, _ := setupFull(t)

	req := connect.NewRequest(&hemav1.GetTournamentConsoleRequest{TournamentId: ""})
	req.Header().Set("Authorization", adminBearer(t))
	_, err := admin.GetTournamentConsole(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Errorf("expected CodeInvalidArgument, got %v", connect.CodeOf(err))
	}
}

func TestGetTournamentConsole_E2E_NoTokenReturnsUnauthenticated(t *testing.T) {
	admin, _, _, _, _, _, _, _ := setupFull(t)
	_, err := admin.GetTournamentConsole(context.Background(), connect.NewRequest(&hemav1.GetTournamentConsoleRequest{TournamentId: "t1"}))
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
	}
}

func TestGetTournamentConsole_E2E_NonAdminReturnsPermissionDenied(t *testing.T) {
	admin, _, _, _, _, _, _, _ := setupFull(t)
	req := connect.NewRequest(&hemav1.GetTournamentConsoleRequest{TournamentId: "t1"})
	req.Header().Set("Authorization", userBearer(t))
	_, err := admin.GetTournamentConsole(context.Background(), req)
	if connect.CodeOf(err) != connect.CodePermissionDenied {
		t.Errorf("expected CodePermissionDenied, got %v", connect.CodeOf(err))
	}
}

func TestWatchTournamentConsole_E2E_FirstFrameIsSnapshot(t *testing.T) {
	admin, _, repo, fighters, arenas, nominations, bouts, _ := setupFull(t)

	nominations.SeedByTournament("t1", domain.NominationRef{ID: n1, Title: "Длинный меч", Position: 1})
	fighters.Set(n1, domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"})
	poolID := repo.SeedPool(n1, 1, "f1", "f2")
	repo.SeedStatus(n1, domain.LayoutReady)
	if err := repo.SeatPool(context.Background(), poolID, "arena-1"); err != nil {
		t.Fatalf("seat pool: %v", err)
	}
	bouts.SeedBout(poolID, domain.BoutRef{
		ID: "b1", SequenceNumber: 1,
		FighterA: domain.FighterRef{ID: "f1"}, FighterB: domain.FighterRef{ID: "f2"},
		State: domain.BoutStateNotStarted,
	})
	arenas.SeedActiveArenas("t1", domain.ArenaRef{ID: "arena-1", Name: "Ристалище 1", Active: true, Position: 1})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	req := connect.NewRequest(&hemav1.WatchTournamentConsoleRequest{TournamentId: "t1"})
	req.Header().Set("Authorization", adminBearer(t))
	stream, err := admin.WatchTournamentConsole(ctx, req)
	if err != nil {
		t.Fatalf("WatchTournamentConsole: %v", err)
	}
	if !stream.Receive() {
		t.Fatalf("expected first frame, got err: %v", stream.Err())
	}
	first := stream.Msg().Snapshot
	if len(first.Arenas) != 1 || first.Arenas[0].ArenaId != "arena-1" {
		t.Fatalf("unexpected first frame: %+v", first.Arenas)
	}
}

func TestWatchTournamentConsole_E2E_EmptyTournamentIDReturnsInvalidArgument(t *testing.T) {
	admin, _, _, _, _, _, _, _ := setupFull(t)

	req := connect.NewRequest(&hemav1.WatchTournamentConsoleRequest{TournamentId: ""})
	req.Header().Set("Authorization", adminBearer(t))
	stream, err := admin.WatchTournamentConsole(context.Background(), req)
	if err != nil {
		t.Fatalf("WatchTournamentConsole: %v", err)
	}
	if stream.Receive() {
		t.Fatalf("expected no frames, got: %+v", stream.Msg())
	}
	if connect.CodeOf(stream.Err()) != connect.CodeInvalidArgument {
		t.Errorf("expected CodeInvalidArgument, got %v", connect.CodeOf(stream.Err()))
	}
}

func TestWatchTournamentConsole_E2E_NoTokenReturnsUnauthenticated(t *testing.T) {
	admin, _, _, _, _, _, _, _ := setupFull(t)
	req := connect.NewRequest(&hemav1.WatchTournamentConsoleRequest{TournamentId: "t1"})
	stream, err := admin.WatchTournamentConsole(context.Background(), req)
	if err != nil {
		t.Fatalf("WatchTournamentConsole: %v", err)
	}
	if stream.Receive() {
		t.Fatalf("expected no frames, got: %+v", stream.Msg())
	}
	if connect.CodeOf(stream.Err()) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated, got %v", connect.CodeOf(stream.Err()))
	}
}

func TestWatchTournamentConsole_E2E_NonAdminReturnsPermissionDenied(t *testing.T) {
	admin, _, _, _, _, _, _, _ := setupFull(t)
	req := connect.NewRequest(&hemav1.WatchTournamentConsoleRequest{TournamentId: "t1"})
	req.Header().Set("Authorization", userBearer(t))
	stream, err := admin.WatchTournamentConsole(context.Background(), req)
	if err != nil {
		t.Fatalf("WatchTournamentConsole: %v", err)
	}
	if stream.Receive() {
		t.Fatalf("expected no frames, got: %+v", stream.Msg())
	}
	if connect.CodeOf(stream.Err()) != connect.CodePermissionDenied {
		t.Errorf("expected CodePermissionDenied, got %v", connect.CodeOf(stream.Err()))
	}
}
