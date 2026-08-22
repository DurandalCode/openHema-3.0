// Тесты сборки живой сводки турнира целиком (спека 0034, T9): площадки
// (идёт/готовится/свободна), лента боёв по всем номинациям (группы и
// сетка), фаза номинации, времена боёв по состоянию.
package service_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/hema/server/modules/stage/domain"
)

// TestTournamentLive_EmptyTournamentIDInvalidInput — пустой tournamentID
// отклоняется без обращения к провайдерам (спека 0034, план «service»).
func TestTournamentLive_EmptyTournamentIDInvalidInput(t *testing.T) {
	svc, _, _, _, _, nominations, _ := newServiceWithNominations()

	_, err := svc.TournamentLive(context.Background(), "")
	if !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput, got %v", err)
	}
	if calls := nominations.NominationsByTournamentCalls(); len(calls) != 0 {
		t.Fatalf("expected no provider calls on invalid input, got %v", calls)
	}
}

// TestTournamentLive_ArenaBoutInProgress — AC-7: площадка с идущим боем даёт
// BOUT_IN_PROGRESS и карточку с текущим боем.
func TestTournamentLive_ArenaBoutInProgress(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, bouts, arenas, nominations, _ := newServiceWithNominations()

	nominations.SeedByTournament("t1", domain.NominationRef{ID: "n1", Title: "Длинный меч", Position: 1})
	fighters.Set("n1", domain.FighterRef{ID: "f1", Name: "A", Club: "X"}, domain.FighterRef{ID: "f2", Name: "B", Club: "Y"})
	poolID := repo.SeedPool("n1", 1, "f1", "f2")
	repo.SeedStatus("n1", domain.LayoutReady)
	if err := repo.SeatPool(ctx, poolID, "arena-1"); err != nil {
		t.Fatalf("seat pool: %v", err)
	}
	bouts.SeedBout(poolID, domain.BoutRef{
		ID: "b1", RoundNumber: 1, SequenceNumber: 1,
		FighterA: domain.FighterRef{ID: "f1", Name: "A", Club: "X"},
		FighterB: domain.FighterRef{ID: "f2", Name: "B", Club: "Y"},
		State:    domain.BoutStateInProgress, ScoreA: 4, ScoreB: 2,
	})
	arenas.SeedActiveArenas("t1", domain.ArenaRef{ID: "arena-1", Name: "Ристалище 1", Active: true, Position: 1})

	snap, err := svc.TournamentLive(ctx, "t1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(snap.Arenas) != 1 {
		t.Fatalf("expected 1 arena, got %d: %+v", len(snap.Arenas), snap.Arenas)
	}
	arena := snap.Arenas[0]
	if arena.State != domain.LiveArenaBoutInProgress {
		t.Fatalf("State = %q, want bout_in_progress", arena.State)
	}
	if arena.CurrentBout == nil {
		t.Fatalf("expected CurrentBout to be set")
	}
	if arena.CurrentBout.BoutID != "b1" || arena.CurrentBout.ScoreA != 4 || arena.CurrentBout.ScoreB != 2 {
		t.Fatalf("unexpected CurrentBout: %+v", arena.CurrentBout)
	}
	if arena.NominationID != "n1" || arena.NominationName != "Длинный меч" {
		t.Fatalf("unexpected nomination on arena card: %+v", arena)
	}
	if len(snap.Bouts) != 1 || snap.Bouts[0].BoutID != "b1" {
		t.Fatalf("expected the bout in the feed, got %+v", snap.Bouts)
	}
}

// TestTournamentLive_ArenaPreparing — AC-8: пул поставлен, ни один бой не
// начат — PREPARING с первой парой по порядку.
func TestTournamentLive_ArenaPreparing(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, bouts, arenas, nominations, _ := newServiceWithNominations()

	nominations.SeedByTournament("t1", domain.NominationRef{ID: "n1", Title: "Длинный меч", Position: 1})
	fighters.Set("n1", domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"})
	poolID := repo.SeedPool("n1", 1, "f1", "f2")
	repo.SeedStatus("n1", domain.LayoutReady)
	if err := repo.SeatPool(ctx, poolID, "arena-1"); err != nil {
		t.Fatalf("seat pool: %v", err)
	}
	bouts.SeedBout(poolID, domain.BoutRef{
		ID: "b1", RoundNumber: 1, SequenceNumber: 1,
		FighterA: domain.FighterRef{ID: "f1"}, FighterB: domain.FighterRef{ID: "f2"},
		State: domain.BoutStateNotStarted,
	})
	arenas.SeedActiveArenas("t1", domain.ArenaRef{ID: "arena-1", Name: "Ристалище 1", Active: true, Position: 1})

	snap, err := svc.TournamentLive(ctx, "t1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(snap.Arenas) != 1 {
		t.Fatalf("expected 1 arena, got %d", len(snap.Arenas))
	}
	arena := snap.Arenas[0]
	if arena.State != domain.LiveArenaPreparing {
		t.Fatalf("State = %q, want preparing", arena.State)
	}
	if arena.CurrentBout == nil || arena.CurrentBout.BoutID != "b1" {
		t.Fatalf("expected CurrentBout b1, got %+v", arena.CurrentBout)
	}
}

// TestTournamentLive_ArenaFree — AC-9: площадка активна, пула на ней нет.
func TestTournamentLive_ArenaFree(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, arenas, nominations, _ := newServiceWithNominations()
	nominations.SeedByTournament("t1")
	arenas.SeedActiveArenas("t1", domain.ArenaRef{ID: "arena-1", Name: "Ристалище 1", Active: true, Position: 1})

	snap, err := svc.TournamentLive(ctx, "t1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(snap.Arenas) != 1 {
		t.Fatalf("expected 1 arena, got %d", len(snap.Arenas))
	}
	arena := snap.Arenas[0]
	if arena.State != domain.LiveArenaFree {
		t.Fatalf("State = %q, want free", arena.State)
	}
	if arena.CurrentBout != nil {
		t.Fatalf("expected no CurrentBout, got %+v", arena.CurrentBout)
	}
	if arena.NominationName != "" || arena.PoolName != "" {
		t.Fatalf("expected empty nomination/pool on free arena, got %+v", arena)
	}
}

// TestTournamentLive_ArenaFree_PoolFinishedButNotUnseated — сужение против
// макета (см. план T9, п.5): пул стоит на арене, все его бои завершены,
// UnseatPool не вызывался — карточка FREE, а не «завершён с итогом».
func TestTournamentLive_ArenaFree_PoolFinishedButNotUnseated(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, bouts, arenas, nominations, _ := newServiceWithNominations()

	nominations.SeedByTournament("t1", domain.NominationRef{ID: "n1", Title: "Длинный меч", Position: 1})
	fighters.Set("n1", domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"})
	poolID := repo.SeedPool("n1", 1, "f1", "f2")
	repo.SeedStatus("n1", domain.LayoutReady)
	if err := repo.SeatPool(ctx, poolID, "arena-1"); err != nil {
		t.Fatalf("seat pool: %v", err)
	}
	bouts.SeedBout(poolID, domain.BoutRef{
		ID: "b1", RoundNumber: 1, SequenceNumber: 1,
		FighterA: domain.FighterRef{ID: "f1"}, FighterB: domain.FighterRef{ID: "f2"},
		State: domain.BoutStateFinished, ScoreA: 5, ScoreB: 1,
	})
	arenas.SeedActiveArenas("t1", domain.ArenaRef{ID: "arena-1", Name: "Ристалище 1", Active: true, Position: 1})

	snap, err := svc.TournamentLive(ctx, "t1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(snap.Arenas) != 1 {
		t.Fatalf("expected 1 arena, got %d", len(snap.Arenas))
	}
	arena := snap.Arenas[0]
	if arena.State != domain.LiveArenaFree {
		t.Fatalf("State = %q, want free (finished pool not unseated)", arena.State)
	}
	if arena.CurrentBout != nil || arena.NominationName != "" || arena.PoolName != "" {
		t.Fatalf("expected empty card fields on free arena, got %+v", arena)
	}
	// Бой всё равно попадает в ленту (AC-12) — сужение касается только
	// карточки площадки, не ленты.
	if len(snap.Bouts) != 1 || snap.Bouts[0].BoutID != "b1" {
		t.Fatalf("expected finished bout still in feed, got %+v", snap.Bouts)
	}
}

// TestTournamentLive_DraftNominationExcludedFromFeed — AC-10: черновая
// раскладка не попадает в ленту (и тем самым не появляется в клиентском
// фильтре, построенном из ленты).
func TestTournamentLive_DraftNominationExcludedFromFeed(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, _, nominations, _ := newServiceWithNominations()

	nominations.SeedByTournament("t1", domain.NominationRef{ID: "n1", Title: "Черновик", Position: 1})
	fighters.Set("n1", domain.FighterRef{ID: "f1"})
	repo.SeedPool("n1", 1, "f1") // draft по умолчанию — SeedStatus не вызван

	snap, err := svc.TournamentLive(ctx, "t1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(snap.Bouts) != 0 {
		t.Fatalf("expected no bouts for a draft nomination, got %+v", snap.Bouts)
	}
	if len(snap.Arenas) != 0 {
		t.Fatalf("expected no arena cards without a seeded arena, got %+v", snap.Arenas)
	}
}

// TestTournamentLive_BracketBoutIncludedInFeedAndArenaCard — обязательный
// тест (план T9, п.7): бой готового bracket-этапа (разрешённая пара круга)
// попадает и в ленту, и в карточку своей площадки наравне с боем группового
// этапа.
func TestTournamentLive_BracketBoutIncludedInFeedAndArenaCard(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, bouts, arenas, nominations, _ := newServiceWithNominations()

	nominations.SeedByTournament("t1", domain.NominationRef{ID: "n1", Title: "Длинный меч", Position: 1})
	fighters.Set("n1",
		domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"},
		domain.FighterRef{ID: "f3"}, domain.FighterRef{ID: "f4"},
	)
	stage := createBracket(t, ctx, svc, "n1", domain.BracketConfig{Size: 4})
	if _, err := svc.SeedBracketSlot(ctx, stage.ID, 1, "f1"); err != nil {
		t.Fatalf("seed slot1: %v", err)
	}
	if _, err := svc.SeedBracketSlot(ctx, stage.ID, 2, "f2"); err != nil {
		t.Fatalf("seed slot2: %v", err)
	}
	if _, err := svc.SeedBracketSlot(ctx, stage.ID, 3, "f3"); err != nil {
		t.Fatalf("seed slot3: %v", err)
	}
	if _, err := svc.SeedBracketSlot(ctx, stage.ID, 4, "f4"); err != nil {
		t.Fatalf("seed slot4: %v", err)
	}
	if _, err := svc.SetStatus(ctx, stage.ID, domain.LayoutReady); err != nil {
		t.Fatalf("lock bracket: %v", err)
	}

	pools, err := repo.PoolsByStage(ctx, stage.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	var container1ID string
	for _, p := range pools {
		if p.Number == 1 {
			container1ID = p.ID
		}
	}
	if container1ID == "" {
		t.Fatalf("expected container 1 to exist: %+v", pools)
	}
	arenas.SeedActiveArenas("t1", domain.ArenaRef{ID: "arena-1", Name: "Ристалище 1", Active: true, Position: 1})
	if err := repo.SeatPool(ctx, container1ID, "arena-1"); err != nil {
		t.Fatalf("seat container1: %v", err)
	}

	// Найдём материализованный бой пары 1 круга 1 (f1 vs f2).
	boardBouts, err := bouts.BoutsByPool(ctx, container1ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(boardBouts) != 1 {
		t.Fatalf("expected 1 materialized bout in container1, got %d: %+v", len(boardBouts), boardBouts)
	}
	boutID := boardBouts[0].ID

	snap, err := svc.TournamentLive(ctx, "t1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	found := false
	for _, b := range snap.Bouts {
		if b.BoutID == boutID {
			found = true
			if b.StageTitle == "" {
				t.Fatalf("expected non-empty StageTitle for bracket bout, got %+v", b)
			}
		}
	}
	if !found {
		t.Fatalf("expected bracket bout %q in feed, got %+v", boutID, snap.Bouts)
	}
	if len(snap.Arenas) != 1 || snap.Arenas[0].CurrentBout == nil || snap.Arenas[0].CurrentBout.BoutID != boutID {
		t.Fatalf("expected bracket bout on arena card, got %+v", snap.Arenas)
	}
}

// TestTournamentLive_NominationPhaseFromStageExecutionStatus — п.8: фаза
// номинации выводится из execution_status её этапов: все finished ->
// FINISHED; хотя бы один active -> RUNNING; иначе -> UPCOMING.
func TestTournamentLive_NominationPhaseFromStageExecutionStatus(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, bouts, arenas, nominations, _ := newServiceWithNominations()
	arenas.SeedActiveArenas("t1") // без площадок — тест только про Nominations

	// n-finished: единственный этап, все бои завершены -> StageStatusFinished.
	nominations.SeedByTournament("t1",
		domain.NominationRef{ID: "n-finished", Title: "Завершена", Position: 1},
		domain.NominationRef{ID: "n-running", Title: "Идёт", Position: 2},
		domain.NominationRef{ID: "n-upcoming", Title: "Скоро", Position: 3},
	)

	fighters.Set("n-finished", domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"})
	poolFinished := repo.SeedPool("n-finished", 1, "f1", "f2")
	repo.SeedStatus("n-finished", domain.LayoutReady)
	bouts.SeedBout(poolFinished, domain.BoutRef{
		ID: "bf1", RoundNumber: 1, SequenceNumber: 1,
		FighterA: domain.FighterRef{ID: "f1"}, FighterB: domain.FighterRef{ID: "f2"},
		State: domain.BoutStateFinished, ScoreA: 5, ScoreB: 3,
	})

	fighters.Set("n-running", domain.FighterRef{ID: "f3"}, domain.FighterRef{ID: "f4"})
	poolRunning := repo.SeedPool("n-running", 1, "f3", "f4")
	repo.SeedStatus("n-running", domain.LayoutReady)
	bouts.SeedBout(poolRunning, domain.BoutRef{
		ID: "br1", RoundNumber: 1, SequenceNumber: 1,
		FighterA: domain.FighterRef{ID: "f3"}, FighterB: domain.FighterRef{ID: "f4"},
		State: domain.BoutStateInProgress,
	})

	fighters.Set("n-upcoming", domain.FighterRef{ID: "f5"}, domain.FighterRef{ID: "f6"})
	poolUpcoming := repo.SeedPool("n-upcoming", 1, "f5", "f6")
	repo.SeedStatus("n-upcoming", domain.LayoutReady)
	bouts.SeedBout(poolUpcoming, domain.BoutRef{
		ID: "bu1", RoundNumber: 1, SequenceNumber: 1,
		FighterA: domain.FighterRef{ID: "f5"}, FighterB: domain.FighterRef{ID: "f6"},
		State: domain.BoutStateNotStarted,
	})

	snap, err := svc.TournamentLive(ctx, "t1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	phases := make(map[string]domain.NominationPhase, len(snap.Nominations))
	for _, n := range snap.Nominations {
		phases[n.NominationID] = n.Phase
	}
	want := map[string]domain.NominationPhase{
		"n-finished": domain.NominationPhaseFinished,
		"n-running":  domain.NominationPhaseRunning,
		"n-upcoming": domain.NominationPhaseUpcoming,
	}
	for id, wantPhase := range want {
		if phases[id] != wantPhase {
			t.Fatalf("phase[%s] = %q, want %q (all phases: %+v)", id, phases[id], wantPhase, phases)
		}
	}
}

// TestTournamentLive_BoutTimesFromState — AC-11..AC-14: время в ленте
// проставляется по состоянию боя, не по сырым отметкам журнала — переоткрытый
// после завершения бой показывает время начала, а не старое время
// завершения.
func TestTournamentLive_BoutTimesFromState(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, bouts, arenas, nominations, _ := newServiceWithNominations()
	arenas.SeedActiveArenas("t1")
	nominations.SeedByTournament("t1", domain.NominationRef{ID: "n1", Title: "Длинный меч", Position: 1})
	fighters.Set("n1",
		domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"},
		domain.FighterRef{ID: "f3"}, domain.FighterRef{ID: "f4"},
		domain.FighterRef{ID: "f5"}, domain.FighterRef{ID: "f6"},
	)
	poolID := repo.SeedPool("n1", 1, "f1", "f2", "f3", "f4", "f5", "f6")
	repo.SeedStatus("n1", domain.LayoutReady)

	started := time.Date(2026, 8, 22, 11, 2, 0, 0, time.UTC)
	finished := time.Date(2026, 8, 22, 10, 44, 0, 0, time.UTC)

	// AC-11: идёт — время начала показано.
	bouts.SeedBout(poolID, domain.BoutRef{ID: "b-running", SequenceNumber: 1, State: domain.BoutStateInProgress})
	bouts.SeedBoutTimes("b-running", domain.BoutTimes{StartedAt: &started})

	// AC-12: завершён — время завершения показано.
	bouts.SeedBout(poolID, domain.BoutRef{ID: "b-finished", SequenceNumber: 2, State: domain.BoutStateFinished})
	bouts.SeedBoutTimes("b-finished", domain.BoutTimes{StartedAt: &started, FinishedAt: &finished})

	// AC-13: не начат — прочерк (оба времени пусты), даже если в конductor
	// что-то бы засеяли (тут не сеем ничего — валидный вход по умолчанию).
	bouts.SeedBout(poolID, domain.BoutRef{ID: "b-not-started", SequenceNumber: 3, State: domain.BoutStateNotStarted})

	// AC-14: завершён, затем переоткрыт (снова идёт) — журнал (сырые times)
	// всё ещё несёт старое finished_at, но текущее состояние — in_progress:
	// показываем только время начала, не старое время завершения.
	bouts.SeedBout(poolID, domain.BoutRef{ID: "b-reopened", SequenceNumber: 4, State: domain.BoutStateInProgress})
	bouts.SeedBoutTimes("b-reopened", domain.BoutTimes{StartedAt: &started, FinishedAt: &finished})

	snap, err := svc.TournamentLive(ctx, "t1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	byID := make(map[string]domain.FeedBout, len(snap.Bouts))
	for _, b := range snap.Bouts {
		byID[b.BoutID] = b
	}

	running := byID["b-running"]
	if running.StartedAt == nil || !running.StartedAt.Equal(started) {
		t.Fatalf("b-running StartedAt = %v, want %v", running.StartedAt, started)
	}
	if running.FinishedAt != nil {
		t.Fatalf("b-running FinishedAt = %v, want nil", running.FinishedAt)
	}

	fin := byID["b-finished"]
	if fin.FinishedAt == nil || !fin.FinishedAt.Equal(finished) {
		t.Fatalf("b-finished FinishedAt = %v, want %v", fin.FinishedAt, finished)
	}

	notStarted := byID["b-not-started"]
	if notStarted.StartedAt != nil || notStarted.FinishedAt != nil {
		t.Fatalf("b-not-started times = %+v, want both nil", notStarted)
	}

	reopened := byID["b-reopened"]
	if reopened.StartedAt == nil || !reopened.StartedAt.Equal(started) {
		t.Fatalf("b-reopened StartedAt = %v, want %v", reopened.StartedAt, started)
	}
	if reopened.FinishedAt != nil {
		t.Fatalf("b-reopened FinishedAt = %v, want nil (stale journal finish must not surface while in_progress)", reopened.FinishedAt)
	}
}

// TestTournamentLive_BoutTimesForPoolsCalledOnce — п.9: BoutTimesForPools
// вызывается один раз на все собранные пулы (групповые контейнеры и половины
// круга вместе), не по одному на пул и не по одному на тип этапа.
func TestTournamentLive_BoutTimesForPoolsCalledOnce(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, bouts, arenas, nominations, _ := newServiceWithNominations()
	arenas.SeedActiveArenas("t1")
	nominations.SeedByTournament("t1",
		domain.NominationRef{ID: "n-group", Title: "Группа", Position: 1},
		domain.NominationRef{ID: "n-bracket", Title: "Сетка", Position: 2},
	)

	fighters.Set("n-group", domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"})
	poolID := repo.SeedPool("n-group", 1, "f1", "f2")
	repo.SeedStatus("n-group", domain.LayoutReady)
	bouts.SeedBout(poolID, domain.BoutRef{ID: "bg1", SequenceNumber: 1, State: domain.BoutStateNotStarted})

	fighters.Set("n-bracket",
		domain.FighterRef{ID: "f3"}, domain.FighterRef{ID: "f4"},
		domain.FighterRef{ID: "f5"}, domain.FighterRef{ID: "f6"},
	)
	stage := createBracket(t, ctx, svc, "n-bracket", domain.BracketConfig{Size: 4})
	if _, err := svc.SeedBracketSlot(ctx, stage.ID, 1, "f3"); err != nil {
		t.Fatalf("seed slot1: %v", err)
	}
	if _, err := svc.SeedBracketSlot(ctx, stage.ID, 2, "f4"); err != nil {
		t.Fatalf("seed slot2: %v", err)
	}
	if _, err := svc.SeedBracketSlot(ctx, stage.ID, 3, "f5"); err != nil {
		t.Fatalf("seed slot3: %v", err)
	}
	if _, err := svc.SeedBracketSlot(ctx, stage.ID, 4, "f6"); err != nil {
		t.Fatalf("seed slot4: %v", err)
	}
	if _, err := svc.SetStatus(ctx, stage.ID, domain.LayoutReady); err != nil {
		t.Fatalf("lock bracket: %v", err)
	}

	if _, err := svc.TournamentLive(ctx, "t1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got := len(bouts.BoutTimesForPoolsCalls); got != 1 {
		t.Fatalf("BoutTimesForPools called %d times, want 1: %+v", got, bouts.BoutTimesForPoolsCalls)
	}
	// Ровно один вызов, но на все пулы разом: групповой контейнер и обе
	// половины круга первого круга сетки (2 контейнера) — минимум 3 id.
	if got := len(bouts.BoutTimesForPoolsCalls[0]); got < 3 {
		t.Fatalf("expected >= 3 pool ids in the single call, got %d: %+v", got, bouts.BoutTimesForPoolsCalls[0])
	}
}

// TestTournamentLive_ServerNowUnixMS — заполняется на каждый вызов (как
// ArenaLiveSnapshot.ServerNowUnixMS).
func TestTournamentLive_ServerNowUnixMS(t *testing.T) {
	svc, _, _, _, arenas, nominations, _ := newServiceWithNominations()
	arenas.SeedActiveArenas("t1")
	nominations.SeedByTournament("t1")
	before := time.Now().UnixMilli()
	snap, err := svc.TournamentLive(context.Background(), "t1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	after := time.Now().UnixMilli()
	if snap.ServerNowUnixMS < before || snap.ServerNowUnixMS > after {
		t.Fatalf("ServerNowUnixMS = %d, want between %d and %d", snap.ServerNowUnixMS, before, after)
	}
}

// TestSubscribeTournament_Passthrough — SubscribeTournament — тонкий
// passthrough к liveBus (по аналогии с SubscribeNomination).
func TestSubscribeTournament_Passthrough(t *testing.T) {
	svc, _, _, _, _, _, liveBus := newServiceWithNominations()
	ch, cancel := svc.SubscribeTournament()
	defer cancel()
	if liveBus.SubscriberCountTournament() != 1 {
		t.Fatalf("expected 1 subscriber on tournament topic, got %d", liveBus.SubscriberCountTournament())
	}
	liveBus.PublishTournamentChanged()
	select {
	case <-ch:
	default:
		t.Fatalf("expected a signal on the tournament channel after publish")
	}
}
