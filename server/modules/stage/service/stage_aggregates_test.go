// Тесты агрегирующих RPC живого статуса турнира (спека 0041, T13):
// GetArenaBoards — доска ведения каждой неархивной площадки турнира одним
// обращением (FR-7), ListStagesForTournament — схема+диагностика каждой
// номинации турнира одним обращением (FR-8). Обе — тонкая обёртка вокруг уже
// существующих одиночных GetBoutBoard/ListStages, вызванных в цикле по уже
// резолвленному списку площадок/номинаций (план, «Server», modules/stage/).
package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/hema/server/modules/stage/domain"
)

// TestGetArenaBoards_EmptyTournamentIDInvalidInput — пустой tournamentID
// отклоняется без обращения к провайдеру (тот же паттерн, что TournamentLive).
func TestGetArenaBoards_EmptyTournamentIDInvalidInput(t *testing.T) {
	svc, _, _, _, _, _, _ := newServiceWithNominations()

	_, err := svc.GetArenaBoards(context.Background(), "")
	if !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput, got %v", err)
	}
}

// TestGetArenaBoards_EmptyTournamentNoEntries — AC-6 (пустой турнир): нет
// площадок — пустой entries, не ошибка.
func TestGetArenaBoards_EmptyTournamentNoEntries(t *testing.T) {
	svc, _, _, _, _, _, _ := newServiceWithNominations()

	entries, err := svc.GetArenaBoards(context.Background(), "t1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(entries) != 0 {
		t.Fatalf("expected 0 entries for a tournament with no arenas, got %d", len(entries))
	}
}

// TestGetArenaBoards_OneEntryPerActiveArenaInOrder — AC-6: запись на каждую
// активную площадку турнира, в порядке ActiveArenas (admin-порядок, Position).
// Площадка без пула на ней — запись есть, board пуст (как у одиночного
// GetBoutBoard, не ошибка).
func TestGetArenaBoards_OneEntryPerActiveArenaInOrder(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, bouts, arenas, _, _ := newServiceWithNominations()

	fighters.Set("n1", domain.FighterRef{ID: "f1", Name: "A"}, domain.FighterRef{ID: "f2", Name: "B"})
	poolID := repo.SeedPool("n1", 1, "f1", "f2")
	repo.SeedStatus("n1", domain.LayoutReady)
	if err := repo.SeatPool(ctx, poolID, "arena-2"); err != nil {
		t.Fatalf("seat pool: %v", err)
	}
	bouts.SeedBout(poolID, domain.BoutRef{
		ID: "b1", RoundNumber: 1, SequenceNumber: 1,
		FighterA: domain.FighterRef{ID: "f1", Name: "A"}, FighterB: domain.FighterRef{ID: "f2", Name: "B"},
		State: domain.BoutStateNotStarted,
	})
	// Порядок посева намеренно перепутан — ActiveArenas должен вернуть по
	// Position (1 затем 2), GetArenaBoards не должен пересортировывать сам.
	arenas.SeedActiveArenas("t1",
		domain.ArenaRef{ID: "arena-2", Name: "Ристалище 2", Active: true, Position: 2},
		domain.ArenaRef{ID: "arena-1", Name: "Ристалище 1", Active: true, Position: 1},
	)

	entries, err := svc.GetArenaBoards(ctx, "t1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("expected 2 entries, got %d: %+v", len(entries), entries)
	}
	if entries[0].ArenaID != "arena-1" || entries[1].ArenaID != "arena-2" {
		t.Fatalf("expected order arena-1, arena-2 (Position order), got %q, %q", entries[0].ArenaID, entries[1].ArenaID)
	}
	// arena-1 свободна — board пуст, не ошибка.
	if entries[0].Board.Pool.ID != "" {
		t.Fatalf("expected empty board for a free arena, got %+v", entries[0].Board)
	}
	// arena-2 несёт пул с боями — board заполнен, как у одиночного GetBoutBoard.
	if entries[1].Board.Pool.ID != poolID {
		t.Fatalf("expected board.Pool.ID = %q, got %+v", poolID, entries[1].Board)
	}
	if len(entries[1].Board.Bouts) != 1 || entries[1].Board.Bouts[0].ID != "b1" {
		t.Fatalf("unexpected bouts on seated arena board: %+v", entries[1].Board.Bouts)
	}

	// Сверяем с одиночным GetBoutBoard — агрегирующая ручка не должна
	// расходиться с уже существующей логикой сборки доски.
	single, err := svc.GetBoutBoard(ctx, "arena-2")
	if err != nil {
		t.Fatalf("GetBoutBoard: %v", err)
	}
	if single.Pool.ID != entries[1].Board.Pool.ID || single.CurrentBoutID != entries[1].Board.CurrentBoutID {
		t.Fatalf("GetArenaBoards entry diverges from single GetBoutBoard: %+v vs %+v", entries[1].Board, single)
	}
}

// TestListStagesForTournament_EmptyTournamentIDInvalidInput — пустой
// tournamentID отклоняется без обращения к провайдеру.
func TestListStagesForTournament_EmptyTournamentIDInvalidInput(t *testing.T) {
	svc, _, _, _, _, _, _ := newServiceWithNominations()

	_, err := svc.ListStagesForTournament(context.Background(), "")
	if !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput, got %v", err)
	}
}

// TestListStagesForTournament_EmptyTournamentNoEntries — AC-7 (пустой
// турнир): нет номинаций — пустой entries, не ошибка.
func TestListStagesForTournament_EmptyTournamentNoEntries(t *testing.T) {
	svc, _, _, _, _, _, _ := newServiceWithNominations()

	entries, err := svc.ListStagesForTournament(context.Background(), "t1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(entries) != 0 {
		t.Fatalf("expected 0 entries for a tournament with no nominations, got %d", len(entries))
	}
}

// TestListStagesForTournament_MaterializesAutoStagePerNomination — AC-7: одна
// запись на каждую номинацию турнира, в порядке NominationsByTournament
// (admin-порядок, Position); номинация без строки этапа в БД получает
// материализованный (с постоянным id) авто-этап — та же семантика, что у
// одиночного ListStages (спека 0017, FR-4: единственное место, где
// виртуальный этап получает постоянный id, эта ручка тоже проходит через
// него).
func TestListStagesForTournament_MaterializesAutoStagePerNomination(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, _, nominations, _ := newServiceWithNominations()

	nominations.SeedByTournament("t1",
		domain.NominationRef{ID: "n2", Title: "Сабля", Position: 2},
		domain.NominationRef{ID: "n1", Title: "Длинный меч", Position: 1},
	)

	entries, err := svc.ListStagesForTournament(ctx, "t1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("expected 2 entries, got %d: %+v", len(entries), entries)
	}
	if entries[0].NominationID != "n1" || entries[1].NominationID != "n2" {
		t.Fatalf("expected order n1, n2 (Position order), got %q, %q", entries[0].NominationID, entries[1].NominationID)
	}
	for _, e := range entries {
		if len(e.Stages) != 1 || e.Stages[0].ID == "" {
			t.Fatalf("expected a materialized auto-stage with a permanent id for nomination %q, got %+v", e.NominationID, e.Stages)
		}
		if e.Stages[0].Title != domain.DefaultStageTitle {
			t.Fatalf("expected default stage title, got %q", e.Stages[0].Title)
		}
	}

	// Сверяем с одиночным ListStages — тот же materialized stage id.
	single, _, err := svc.ListStages(ctx, "n1")
	if err != nil {
		t.Fatalf("ListStages: %v", err)
	}
	if len(single) != 1 || single[0].ID != entries[0].Stages[0].ID {
		t.Fatalf("GetListStagesForTournament entry diverges from single ListStages: %+v vs %+v", entries[0].Stages, single)
	}
}
