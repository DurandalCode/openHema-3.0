// Тесты сборки пульта турнира (спека 0043, T11): все неархивные площадки в
// ответе, очередь без стоящих пулов, номинация с непоставленными пулами
// отдаёт остаток числом без времени, одно прохождение по данным (AC-8), а
// также базовая проверка того, что лента внимания реально подключена к
// собранным данным (сама логика видов — domain/alerts_test.go).
package service_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/hema/server/modules/stage/domain"
)

func TestGetTournamentConsole_EmptyTournamentIDInvalidInput(t *testing.T) {
	svc, _, _, _, _, nominations, _ := newServiceWithNominations()

	_, err := svc.GetTournamentConsole(context.Background(), "")
	if !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput, got %v", err)
	}
	if calls := nominations.NominationsByTournamentCalls(); len(calls) != 0 {
		t.Fatalf("expected no provider calls on invalid input, got %v", calls)
	}
}

// TestGetTournamentConsole_AllActiveArenasInResponse — все неархивные
// площадки турнира в ответе, в порядке ActiveArenas (admin-порядок), вне
// зависимости от того, стоит на них пул или нет.
func TestGetTournamentConsole_AllActiveArenasInResponse(t *testing.T) {
	svc, _, _, _, arenas, _, _ := newServiceWithNominations()
	arenas.SeedActiveArenas("t1",
		domain.ArenaRef{ID: "arena-2", Name: "R2", Active: true, Position: 2},
		domain.ArenaRef{ID: "arena-1", Name: "R1", Active: true, Position: 1},
	)

	snap, err := svc.GetTournamentConsole(context.Background(), "t1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(snap.Arenas) != 2 {
		t.Fatalf("expected 2 arenas, got %d: %+v", len(snap.Arenas), snap.Arenas)
	}
	if snap.Arenas[0].ArenaID != "arena-1" || snap.Arenas[1].ArenaID != "arena-2" {
		t.Fatalf("expected order arena-1, arena-2 (Position order), got %q, %q", snap.Arenas[0].ArenaID, snap.Arenas[1].ArenaID)
	}
	if snap.Arenas[0].IdleState != domain.ArenaIdleWaitingFirstPool {
		t.Errorf("IdleState = %q, want waiting_first_pool for a never-freed empty arena", snap.Arenas[0].IdleState)
	}
}

// TestGetTournamentConsole_QueueExcludesSeatedPools — очередь несёт только
// готовые пулы, НЕ стоящие ни на одной площадке (спека 0043, FR-13);
// поставленный пул в очередь не попадает.
func TestGetTournamentConsole_QueueExcludesSeatedPools(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, bouts, arenas, nominations, _ := newServiceWithNominations()

	nominations.SeedByTournament("t1",
		domain.NominationRef{ID: "n1", Title: "Длинный меч", Position: 1},
		domain.NominationRef{ID: "n2", Title: "Сабля", Position: 2},
	)
	fighters.Set("n1", domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"})
	fighters.Set("n2", domain.FighterRef{ID: "f3"}, domain.FighterRef{ID: "f4"})

	seatedPoolID := repo.SeedPool("n1", 1, "f1", "f2")
	repo.SeedStatus("n1", domain.LayoutReady)
	if err := repo.SeatPool(ctx, seatedPoolID, "arena-1"); err != nil {
		t.Fatalf("seat pool: %v", err)
	}
	bouts.SeedBout(seatedPoolID, domain.BoutRef{
		ID: "b1", SequenceNumber: 1,
		FighterA: domain.FighterRef{ID: "f1"}, FighterB: domain.FighterRef{ID: "f2"},
		State: domain.BoutStateNotStarted,
	})

	readyPoolID := repo.SeedPool("n2", 1, "f3", "f4")
	repo.SeedStatus("n2", domain.LayoutReady)
	bouts.SeedBout(readyPoolID, domain.BoutRef{
		ID: "b2", SequenceNumber: 1,
		FighterA: domain.FighterRef{ID: "f3"}, FighterB: domain.FighterRef{ID: "f4"},
		State: domain.BoutStateNotStarted,
	})

	arenas.SeedActiveArenas("t1", domain.ArenaRef{ID: "arena-1", Name: "R1", Active: true, Position: 1})

	snap, err := svc.GetTournamentConsole(ctx, "t1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(snap.Queue) != 1 || snap.Queue[0].PoolID != readyPoolID {
		t.Fatalf("expected only the unseated ready pool in queue, got %+v", snap.Queue)
	}
	if snap.Queue[0].BoutCount != 1 {
		t.Errorf("BoutCount = %d, want 1", snap.Queue[0].BoutCount)
	}
}

// TestGetTournamentConsole_NominationRemainingUnseated_NoTime — номинация
// с непоставленными пулами отдаёт остаток боёв числом (FR-12), без
// времени завершения (горизонт оценки, FR-9): ExpectedFinishAtOK=false.
func TestGetTournamentConsole_NominationRemainingUnseated_NoTime(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, bouts, _, nominations, _ := newServiceWithNominations()

	nominations.SeedByTournament("t1", domain.NominationRef{ID: "n1", Title: "Длинный меч", Position: 1})
	fighters.Set("n1", domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"})
	poolID := repo.SeedPool("n1", 1, "f1", "f2")
	repo.SeedStatus("n1", domain.LayoutReady)
	// Пул НЕ поставлен ни на одну площадку.
	bouts.SeedBout(poolID, domain.BoutRef{
		ID: "b1", SequenceNumber: 1,
		FighterA: domain.FighterRef{ID: "f1"}, FighterB: domain.FighterRef{ID: "f2"},
		State: domain.BoutStateNotStarted,
	})

	snap, err := svc.GetTournamentConsole(ctx, "t1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(snap.Nominations) != 1 {
		t.Fatalf("expected 1 nomination, got %d", len(snap.Nominations))
	}
	n := snap.Nominations[0]
	if n.BoutRemainingUnseated != 1 {
		t.Errorf("BoutRemainingUnseated = %d, want 1", n.BoutRemainingUnseated)
	}
	if n.ExpectedFinishAtOK {
		t.Errorf("ExpectedFinishAtOK = true, want false — no seated pool to forecast from")
	}
}

// TestGetTournamentConsole_OnePassOverData — AC-8: за вызов ровно одно
// обращение к NominationsByTournament/BoutTimesForPools/StartedAtByBouts —
// не по одному на площадку/номинацию.
func TestGetTournamentConsole_OnePassOverData(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, bouts, arenas, nominations, _ := newServiceWithNominations()

	nominations.SeedByTournament("t1",
		domain.NominationRef{ID: "n1", Title: "Длинный меч", Position: 1},
		domain.NominationRef{ID: "n2", Title: "Сабля", Position: 2},
	)
	fighters.Set("n1", domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"})
	fighters.Set("n2", domain.FighterRef{ID: "f3"}, domain.FighterRef{ID: "f4"})
	pool1 := repo.SeedPool("n1", 1, "f1", "f2")
	repo.SeedStatus("n1", domain.LayoutReady)
	if err := repo.SeatPool(ctx, pool1, "arena-1"); err != nil {
		t.Fatalf("seat pool1: %v", err)
	}
	bouts.SeedBout(pool1, domain.BoutRef{ID: "b1", SequenceNumber: 1, FighterA: domain.FighterRef{ID: "f1"}, FighterB: domain.FighterRef{ID: "f2"}, State: domain.BoutStateNotStarted})

	pool2 := repo.SeedPool("n2", 1, "f3", "f4")
	repo.SeedStatus("n2", domain.LayoutReady)
	if err := repo.SeatPool(ctx, pool2, "arena-2"); err != nil {
		t.Fatalf("seat pool2: %v", err)
	}
	bouts.SeedBout(pool2, domain.BoutRef{ID: "b2", SequenceNumber: 1, FighterA: domain.FighterRef{ID: "f3"}, FighterB: domain.FighterRef{ID: "f4"}, State: domain.BoutStateNotStarted})

	arenas.SeedActiveArenas("t1",
		domain.ArenaRef{ID: "arena-1", Name: "R1", Active: true, Position: 1},
		domain.ArenaRef{ID: "arena-2", Name: "R2", Active: true, Position: 2},
	)

	if _, err := svc.GetTournamentConsole(ctx, "t1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if calls := nominations.NominationsByTournamentCalls(); len(calls) != 1 {
		t.Fatalf("NominationsByTournament called %d times, want 1: %v", len(calls), calls)
	}
	if calls := bouts.BoutTimesForPoolsCalls; len(calls) != 1 {
		t.Fatalf("BoutTimesForPools called %d times, want 1: %v", len(calls), calls)
	}
	if calls := bouts.StartedAtByBoutsCalls; len(calls) != 1 {
		t.Fatalf("StartedAtByBouts called %d times, want 1: %v", len(calls), calls)
	}
}

// ---------------------------------------------------------------------
// Лента «требует внимания» реально подключена к собранным данным (сама
// логика видов/порогов — domain/alerts_test.go, здесь — только wiring).
// ---------------------------------------------------------------------

// TestGetTournamentConsole_Alert_ArenaIdleWiring — простаивающая площадка
// при наличии готового пула в очереди даёт запись ленты.
func TestGetTournamentConsole_Alert_ArenaIdleWiring(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, bouts, arenas, nominations, _ := newServiceWithNominations()

	nominations.SeedByTournament("t1", domain.NominationRef{ID: "n1", Title: "Длинный меч", Position: 1})
	fighters.Set("n1", domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"})
	poolID := repo.SeedPool("n1", 1, "f1", "f2")
	repo.SeedStatus("n1", domain.LayoutReady)
	bouts.SeedBout(poolID, domain.BoutRef{ID: "b1", SequenceNumber: 1, FighterA: domain.FighterRef{ID: "f1"}, FighterB: domain.FighterRef{ID: "f2"}, State: domain.BoutStateNotStarted})

	freedAt := time.Now().Add(-10 * time.Minute)
	arenas.SeedActiveArenas("t1", domain.ArenaRef{ID: "arena-1", Name: "R1", Active: true, Position: 1, LastFreedAt: &freedAt})

	snap, err := svc.GetTournamentConsole(ctx, "t1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	found := false
	for _, a := range snap.Alerts {
		if a.Kind == domain.ConsoleAlertArenaIdle && a.ArenaID == "arena-1" {
			found = true
		}
	}
	if !found {
		t.Errorf("expected an ARENA_IDLE alert for arena-1, got %+v", snap.Alerts)
	}
}

// TestGetTournamentConsole_Alert_NextStageNotBuilt — предыдущий этап
// доигран, следующий существует и стоит в draft — запись без порога.
func TestGetTournamentConsole_Alert_NextStageNotBuilt(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, bouts, _, nominations, _ := newServiceWithNominations()

	nominations.SeedByTournament("t1", domain.NominationRef{ID: "n1", Title: "Длинный меч", Position: 1})
	fighters.Set("n1", domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"})

	// Первый этап (группы) доигран целиком: ready + единственный пул с
	// единственным завершённым боем -> ExecutionStatus вычисляется в
	// finished (domain.ComputeStageStatus).
	firstStageID := repo.SeedStage("n1", 1, "Группы", domain.StageTypeGroups)
	repo.SeedStageStatus(firstStageID, domain.LayoutReady)
	firstPoolID := repo.SeedPoolInStage(firstStageID, 1, "f1", "f2")
	bouts.SeedBout(firstPoolID, domain.BoutRef{
		ID: "b1", SequenceNumber: 1,
		FighterA: domain.FighterRef{ID: "f1"}, FighterB: domain.FighterRef{ID: "f2"},
		State: domain.BoutStateFinished,
	})

	// Второй этап существует, но раскладка ещё в draft — не сформирован.
	repo.SeedStage("n1", 2, "Плейофф", domain.StageTypeGroups)

	snap, err := svc.GetTournamentConsole(ctx, "t1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	found := false
	for _, a := range snap.Alerts {
		if a.Kind == domain.ConsoleAlertNextStageNotBuilt && a.NominationID == "n1" {
			found = true
		}
	}
	if !found {
		t.Errorf("expected a NEXT_STAGE_NOT_BUILT alert for n1, got %+v", snap.Alerts)
	}
}
