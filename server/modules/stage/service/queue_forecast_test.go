// Тесты прогноза очереди пулов арены и её отражения на пульте и публичной
// сводке (спека 0063, FR-17..FR-25, AC-10..AC-14).
package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/hema/server/modules/stage/domain"
	"github.com/hema/server/modules/stage/testutil"
)

// queueTournament — турнир t1, номинация n1 (ready): пул P1 стоит на arena-1
// (1 не начатый бой), пул P2 в очереди arena-1 (2 боя), пул P3 нигде (1 бой).
// Дефолт арены 90 с + пауза боя 60 с → темп 150 с (резерв каскада).
type queueTournament struct {
	svcConsole func() (domain.ConsoleSnapshot, error)
	svcLive    func() (domain.TournamentSnapshot, error)
	repo       *testutil.FakeRepo
	arenas     *testutil.FakeArenaProvider
	p1, p2, p3 string
}

func newQueueTournament(t *testing.T) *queueTournament {
	t.Helper()
	ctx := context.Background()
	svc, repo, fighters, bouts, arenas, nominations, _ := newServiceWithNominations()

	nominations.SeedByTournament("t1", domain.NominationRef{ID: "n1", Title: "Длинный меч", Position: 1})
	fighters.Set("n1", domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"}, domain.FighterRef{ID: "f3"})
	p1 := repo.SeedPool("n1", 1, "f1", "f2")
	p2 := repo.SeedPool("n1", 2, "f2", "f3")
	p3 := repo.SeedPool("n1", 3, "f1", "f3")
	repo.SeedStatus("n1", domain.LayoutReady)

	seed := func(pool, id string, seq int) {
		bouts.SeedBout(pool, domain.BoutRef{
			ID: id, SequenceNumber: seq,
			FighterA: domain.FighterRef{ID: "f1"}, FighterB: domain.FighterRef{ID: "f2"},
			State: domain.BoutStateNotStarted,
		})
	}
	seed(p1, "b1", 1)
	seed(p2, "b2a", 1)
	seed(p2, "b2b", 2)
	seed(p3, "b3", 1)

	arenas.Set(domain.ArenaRef{ID: "arena-1", Name: "R1", Active: true, Position: 1})
	arenas.SeedActiveArenas("t1", domain.ArenaRef{ID: "arena-1", Name: "R1", Active: true, Position: 1})

	if err := repo.SeatPool(ctx, p1, "arena-1"); err != nil {
		t.Fatalf("seat: %v", err)
	}
	if err := repo.EnqueuePool(ctx, p2, "arena-1"); err != nil {
		t.Fatalf("enqueue: %v", err)
	}
	return &queueTournament{
		svcConsole: func() (domain.ConsoleSnapshot, error) { return svc.GetTournamentConsole(ctx, "t1") },
		svcLive:    func() (domain.TournamentSnapshot, error) { return svc.TournamentLive(ctx, "t1") },
		repo:       repo, arenas: arenas, p1: p1, p2: p2, p3: p3,
	}
}

func near(t *testing.T, label string, got *time.Time, nowMS int64, wantOffset time.Duration) {
	t.Helper()
	if got == nil {
		t.Fatalf("%s: nil time", label)
	}
	want := time.UnixMilli(nowMS).Add(wantOffset)
	if d := got.Sub(want); d < -2*time.Second || d > 2*time.Second {
		t.Fatalf("%s = %v, want ≈ %v (±2s)", label, got, want)
	}
}

// FR-16/FR-21: очередь арены на пульте — позиции, число боёв, ориентировочный
// старт = конец стоящего пула + пауза смены 5 мин; пул не в «Не распределены».
func TestConsole_ArenaQueueForecast(t *testing.T) {
	f := newQueueTournament(t)
	snap, err := f.svcConsole()
	if err != nil {
		t.Fatal(err)
	}
	arena := snap.Arenas[0]
	if arena.QueueLength != 1 || len(arena.Queue) != 1 {
		t.Fatalf("QueueLength = %d, Queue = %+v, want 1", arena.QueueLength, arena.Queue)
	}
	item := arena.Queue[0]
	if item.PoolID != f.p2 || item.QueuePosition != 1 || item.BoutCount != 2 {
		t.Fatalf("queue item = %+v", item)
	}
	// P1: единственный бой стартует «сейчас», доигрывает через такт (150 с);
	// P2 стартует ещё через паузу смены 300 с.
	near(t, "ExpectedStartAt", item.ExpectedStartAt, snap.ServerNowUnixMS, 150*time.Second+domain.QueueChangeoverPause)

	// FR-24: «Не распределены» — только P3.
	if len(snap.Queue) != 1 || snap.Queue[0].PoolID != f.p3 {
		t.Fatalf("unassigned = %+v, want only P3", snap.Queue)
	}
}

// FR-23 / AC-12: оценка номинации учитывает очередь; остаток без оценки — только P3.
func TestConsole_NominationCountsQueue(t *testing.T) {
	f := newQueueTournament(t)
	snap, err := f.svcConsole()
	if err != nil {
		t.Fatal(err)
	}
	n := snap.Nominations[0]
	if n.BoutRemainingUnseated != 1 {
		t.Errorf("BoutRemainingUnseated = %d, want 1 (only P3)", n.BoutRemainingUnseated)
	}
	if !n.ExpectedFinishAtOK {
		t.Fatal("ExpectedFinishAtOK = false, want true")
	}
	// P2: старт +450 с, второй бой +600 с, конец +750 с.
	near(t, "ExpectedFinishAt", &n.ExpectedFinishAt, snap.ServerNowUnixMS, 750*time.Second)
	if !n.Provisional {
		t.Error("queue-based finish must be provisional (FR-22)")
	}
}

// AC-11: свободная арена — отсчёт от «сейчас» + пауза смены.
func TestConsole_FreeArenaQueueStartsAfterChangeover(t *testing.T) {
	f := newQueueTournament(t)
	ctx := context.Background()
	if err := f.repo.UnseatPool(ctx, f.p1); err != nil {
		t.Fatal(err)
	}
	snap, err := f.svcConsole()
	if err != nil {
		t.Fatal(err)
	}
	item := snap.Arenas[0].Queue[0]
	near(t, "ExpectedStartAt", item.ExpectedStartAt, snap.ServerNowUnixMS, domain.QueueChangeoverPause)
}

// AC-14: очередь архивной (не активной) арены без прогноза; её пулы
// считаются нераспределёнными.
func TestConsole_ArchivedArenaQueueNotForecast(t *testing.T) {
	f := newQueueTournament(t)
	f.arenas.SeedActiveArenas("t1") // arena-1 больше не активна
	snap, err := f.svcConsole()
	if err != nil {
		t.Fatal(err)
	}
	if len(snap.Arenas) != 0 {
		t.Fatalf("no active arenas expected, got %+v", snap.Arenas)
	}
	got := map[string]bool{}
	for _, q := range snap.Queue {
		got[q.PoolID] = true
	}
	if !got[f.p2] || !got[f.p3] {
		t.Fatalf("unassigned = %+v, want P2 and P3", snap.Queue)
	}
	if snap.Nominations[0].BoutRemainingUnseated != 3 {
		t.Errorf("BoutRemainingUnseated = %d, want 3", snap.Nominations[0].BoutRemainingUnseated)
	}
}

// FR-25: простаивающая арена с непустой очередью — запись называет голову очереди.
func TestConsole_IdleAlertNamesQueueHead(t *testing.T) {
	f := newQueueTournament(t)
	ctx := context.Background()
	if err := f.repo.UnseatPool(ctx, f.p1); err != nil {
		t.Fatal(err)
	}
	freed := time.Now().Add(-10 * time.Minute)
	f.arenas.SeedActiveArenas("t1", domain.ArenaRef{ID: "arena-1", Name: "R1", Active: true, Position: 1, LastFreedAt: &freed})
	snap, err := f.svcConsole()
	if err != nil {
		t.Fatal(err)
	}
	var found bool
	for _, a := range snap.Alerts {
		if a.Kind == domain.ConsoleAlertArenaIdle {
			found = true
			if a.PoolID != f.p2 || a.PoolName != "Пул 2" {
				t.Fatalf("idle alert must name queue head, got %+v", a)
			}
		}
	}
	if !found {
		t.Fatalf("expected ARENA_IDLE alert, got %+v", snap.Alerts)
	}
}

// FR-18..FR-20, FR-21: публичная сводка — бои пула очереди получают
// предварительное время и номер в очереди; карточка арены называет
// следующий пул.
func TestTournamentLive_QueueProjection(t *testing.T) {
	f := newQueueTournament(t)
	snap, err := f.svcLive()
	if err != nil {
		t.Fatal(err)
	}
	var first *domain.FeedBout
	for i := range snap.Bouts {
		if snap.Bouts[i].BoutID == "b2a" {
			first = &snap.Bouts[i]
		}
		if snap.Bouts[i].BoutID == "b3" && snap.Bouts[i].Forecast != nil {
			t.Fatal("unassigned pool must have no forecast")
		}
	}
	if first == nil || first.Forecast == nil {
		t.Fatalf("queued bout must carry forecast, got %+v", first)
	}
	if !first.Forecast.Provisional {
		t.Error("queued forecast must be provisional")
	}
	near(t, "b2a forecast", &first.Forecast.ExpectedStartAt, snap.ServerNowUnixMS, 150*time.Second+domain.QueueChangeoverPause)
	if first.QueueArenaName != "R1" || first.QueuePosition != 1 {
		t.Errorf("queue mark = %q #%d, want R1 #1", first.QueueArenaName, first.QueuePosition)
	}

	arena := snap.Arenas[0]
	if arena.NextPoolName != "Пул 2" || arena.NextPoolNominationName != "Длинный меч" {
		t.Errorf("next pool = %q / %q", arena.NextPoolName, arena.NextPoolNominationName)
	}
}

// FR-13: публично очередь архивной арены не видна.
func TestTournamentLive_ArchivedQueueHidden(t *testing.T) {
	f := newQueueTournament(t)
	f.arenas.Set(domain.ArenaRef{ID: "arena-1", Name: "R1", Active: false})
	f.arenas.SeedActiveArenas("t1")
	snap, err := f.svcLive()
	if err != nil {
		t.Fatal(err)
	}
	for _, b := range snap.Bouts {
		if b.QueueArenaName != "" || b.QueuePosition != 0 || (b.BoutID == "b2a" && b.Forecast != nil) {
			t.Fatalf("archived queue must be hidden publicly, got %+v", b)
		}
	}
}
