// E2E-тесты агрегирующих RPC живого статуса турнира (спека 0041, T14):
// GetArenaBoards/ListStagesForTournament — httptest + реальный Connect-путь,
// fake-провайдеры (по образцу TestGetBoutBoard_E2E/TestListStages_E2E_*).
package api

import (
	"context"
	"testing"

	"connectrpc.com/connect"

	hemav1 "github.com/hema/server/gen/hema/v1"
	"github.com/hema/server/modules/stage/domain"
)

func TestGetArenaBoards_E2E_EmptyTournamentNoEntries(t *testing.T) {
	admin, _, _, _, _, _, _, _ := setupFull(t)

	req := connect.NewRequest(&hemav1.GetArenaBoardsRequest{TournamentId: "t1"})
	req.Header().Set("Authorization", adminBearer(t))
	res, err := admin.GetArenaBoards(context.Background(), req)
	if err != nil {
		t.Fatalf("GetArenaBoards: %v", err)
	}
	if len(res.Msg.Entries) != 0 {
		t.Fatalf("expected 0 entries for a tournament with no arenas, got %+v", res.Msg.Entries)
	}
}

// TestGetArenaBoards_E2E_OneEntryPerActiveArena — AC-6: доска каждой
// активной площадки турнира одним обращением; площадка без пула — запись с
// пустым board (не ошибка, как у одиночного GetBoutBoard).
func TestGetArenaBoards_E2E_OneEntryPerActiveArena(t *testing.T) {
	admin, _, repo, fighters, arenas, _, bouts, _ := setupFull(t)
	fighters.Set(n1, domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"})
	poolID := seedBoardPool(t, repo, bouts, "arena-1")
	arenas.SeedActiveArenas("t1",
		domain.ArenaRef{ID: "arena-1", Name: "Ристалище 1", Active: true, Position: 1},
		domain.ArenaRef{ID: "arena-2", Name: "Ристалище 2", Active: true, Position: 2},
	)

	req := connect.NewRequest(&hemav1.GetArenaBoardsRequest{TournamentId: "t1"})
	req.Header().Set("Authorization", adminBearer(t))
	res, err := admin.GetArenaBoards(context.Background(), req)
	if err != nil {
		t.Fatalf("GetArenaBoards: %v", err)
	}
	if len(res.Msg.Entries) != 2 {
		t.Fatalf("expected 2 entries, got %+v", res.Msg.Entries)
	}
	e1, e2 := res.Msg.Entries[0], res.Msg.Entries[1]
	if e1.ArenaId != "arena-1" || e2.ArenaId != "arena-2" {
		t.Fatalf("expected order arena-1, arena-2, got %q, %q", e1.ArenaId, e2.ArenaId)
	}
	if e1.Board == nil || e1.Board.Pool == nil || e1.Board.Pool.Id != poolID {
		t.Fatalf("expected board.pool = %s on arena-1, got %v", poolID, e1.Board)
	}
	if e2.Board == nil || e2.Board.Pool != nil {
		t.Fatalf("expected empty board on free arena-2, got %v", e2.Board)
	}
}

func TestGetArenaBoards_E2E_NoTokenReturnsUnauthenticated(t *testing.T) {
	admin, _, _, _, _, _, _, _ := setupFull(t)
	_, err := admin.GetArenaBoards(context.Background(), connect.NewRequest(&hemav1.GetArenaBoardsRequest{TournamentId: "t1"}))
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
	}
}

func TestGetArenaBoards_E2E_NonAdminReturnsPermissionDenied(t *testing.T) {
	admin, _, _, _, _, _, _, _ := setupFull(t)
	req := connect.NewRequest(&hemav1.GetArenaBoardsRequest{TournamentId: "t1"})
	req.Header().Set("Authorization", userBearer(t))
	_, err := admin.GetArenaBoards(context.Background(), req)
	if connect.CodeOf(err) != connect.CodePermissionDenied {
		t.Errorf("expected CodePermissionDenied, got %v", connect.CodeOf(err))
	}
}

func TestListStagesForTournament_E2E_EmptyTournamentNoEntries(t *testing.T) {
	admin, _, _, _, _, _, _, _ := setupFull(t)

	req := connect.NewRequest(&hemav1.ListStagesForTournamentRequest{TournamentId: "t1"})
	req.Header().Set("Authorization", adminBearer(t))
	res, err := admin.ListStagesForTournament(context.Background(), req)
	if err != nil {
		t.Fatalf("ListStagesForTournament: %v", err)
	}
	if len(res.Msg.Entries) != 0 {
		t.Fatalf("expected 0 entries for a tournament with no nominations, got %+v", res.Msg.Entries)
	}
}

// TestListStagesForTournament_E2E_MaterializesPerNomination — AC-7: схема +
// диагностика каждой номинации турнира одним обращением, включая
// материализацию авто-этапа (спека 0017, FR-4), как у одиночного ListStages.
func TestListStagesForTournament_E2E_MaterializesPerNomination(t *testing.T) {
	admin, _, repo, fighters, _, nominations, _, _ := setupFull(t)
	fighters.Set(n1)
	nominations.SeedByTournament("t1", domain.NominationRef{ID: n1, Title: "Длинный меч", Position: 1})

	req := connect.NewRequest(&hemav1.ListStagesForTournamentRequest{TournamentId: "t1"})
	req.Header().Set("Authorization", adminBearer(t))
	res, err := admin.ListStagesForTournament(context.Background(), req)
	if err != nil {
		t.Fatalf("ListStagesForTournament: %v", err)
	}
	if len(res.Msg.Entries) != 1 {
		t.Fatalf("expected 1 entry, got %+v", res.Msg.Entries)
	}
	entry := res.Msg.Entries[0]
	if entry.NominationId != n1 {
		t.Fatalf("expected nomination_id = %s, got %q", n1, entry.NominationId)
	}
	if len(entry.Stages) != 1 || entry.Stages[0].Type != hemav1.StageType_STAGE_TYPE_GROUPS {
		t.Fatalf("expected 1 materialized groups stage, got %+v", entry.Stages)
	}
	if got := repo.StageCount(); got != 1 {
		t.Fatalf("expected ListStagesForTournament to materialize the stage row, got %d", got)
	}
}

func TestListStagesForTournament_E2E_NoTokenReturnsUnauthenticated(t *testing.T) {
	admin, _, _, _, _, _, _, _ := setupFull(t)
	_, err := admin.ListStagesForTournament(context.Background(), connect.NewRequest(&hemav1.ListStagesForTournamentRequest{TournamentId: "t1"}))
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
	}
}

func TestListStagesForTournament_E2E_NonAdminReturnsPermissionDenied(t *testing.T) {
	admin, _, _, _, _, _, _, _ := setupFull(t)
	req := connect.NewRequest(&hemav1.ListStagesForTournamentRequest{TournamentId: "t1"})
	req.Header().Set("Authorization", userBearer(t))
	_, err := admin.ListStagesForTournament(context.Background(), req)
	if connect.CodeOf(err) != connect.CodePermissionDenied {
		t.Errorf("expected CodePermissionDenied, got %v", connect.CodeOf(err))
	}
}
