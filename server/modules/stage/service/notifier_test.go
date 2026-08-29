package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/hema/server/modules/stage/domain"
	"github.com/hema/server/modules/stage/service"
	"github.com/hema/server/modules/stage/testutil"
)

// fakePoolSeatedNotifier — фейковый Notifier модуля stage (спека 0042,
// T25): считает вызовы PoolSeated и запоминает последнее уведомление.
type fakePoolSeatedNotifier struct {
	calls  int
	last   domain.PoolSeatedNotice
	panics bool
}

func (f *fakePoolSeatedNotifier) PoolSeated(_ context.Context, n domain.PoolSeatedNotice) {
	f.calls++
	f.last = n
	if f.panics {
		panic("boom: notifier adapter failure")
	}
}

// newServiceWithNotifier — как newServiceWithArenas, но также подключает
// notifier домена (спека 0042).
func newServiceWithNotifier(notifier domain.Notifier) (*service.Service, *testutil.FakeRepo, *testutil.FakeActiveFightersProvider, *testutil.FakeArenaProvider) {
	repo := testutil.NewFakeRepo()
	fighters := testutil.NewFakeActiveFightersProvider()
	bouts := testutil.NewFakeBoutConductor()
	arenas := testutil.NewFakeArenaProvider()
	nominations := testutil.NewFakeNominationProvider()
	liveBus := testutil.NewFakeLiveBus()
	users := testutil.NewFakeUserProvider()
	return service.New(repo, fighters, bouts, arenas, nominations, liveBus, users, notifier), repo, fighters, arenas
}

// SeatPoolOnArena зовёт Notifier.PoolSeated ровно один раз при успешной
// постановке (спека 0042, FR-24).
func TestSeatPoolOnArena_NotifiesPoolSeatedOnSuccess(t *testing.T) {
	ctx := context.Background()
	notifier := &fakePoolSeatedNotifier{}
	svc, repo, fighters, arenas := newServiceWithNotifier(notifier)
	fighters.Set("n1", domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"})
	poolID := repo.SeedPool("n1", 1, "f1", "f2")
	repo.SeedStatus("n1", domain.LayoutReady)
	arenas.Set(domain.ArenaRef{ID: "a1", Name: "Ристалище 1", Active: true})

	if _, err := svc.SeatPoolOnArena(ctx, poolID, "a1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if notifier.calls != 1 {
		t.Fatalf("PoolSeated calls = %d, want 1", notifier.calls)
	}
	if notifier.last.ArenaName != "Ристалище 1" {
		t.Errorf("ArenaName = %q, want Ристалище 1", notifier.last.ArenaName)
	}
	if notifier.last.NominationID != "n1" {
		t.Errorf("NominationID = %q, want n1", notifier.last.NominationID)
	}
	if notifier.last.PoolName == "" {
		t.Errorf("PoolName is empty, want non-empty")
	}
	if len(notifier.last.FighterIDs) != 2 {
		t.Fatalf("FighterIDs = %v, want 2 entries", notifier.last.FighterIDs)
	}
	got := map[string]bool{}
	for _, id := range notifier.last.FighterIDs {
		got[id] = true
	}
	if !got["f1"] || !got["f2"] {
		t.Errorf("FighterIDs = %v, want to contain f1 and f2", notifier.last.FighterIDs)
	}
}

// SeatPoolOnArena не зовёт Notifier при отказе ErrNotReady (раскладка не
// ready).
func TestSeatPoolOnArena_DoesNotNotifyOnNotReady(t *testing.T) {
	ctx := context.Background()
	notifier := &fakePoolSeatedNotifier{}
	svc, repo, fighters, arenas := newServiceWithNotifier(notifier)
	fighters.Set("n1", domain.FighterRef{ID: "f1"})
	poolID := repo.SeedPool("n1", 1, "f1")
	arenas.Set(domain.ArenaRef{ID: "a1", Name: "R1", Active: true})

	_, err := svc.SeatPoolOnArena(ctx, poolID, "a1")
	if !errors.Is(err, domain.ErrNotReady) {
		t.Fatalf("expected ErrNotReady, got %v", err)
	}
	if notifier.calls != 0 {
		t.Fatalf("PoolSeated calls = %d, want 0", notifier.calls)
	}
}

// SeatPoolOnArena не зовёт Notifier при отказе ErrAlreadySeated (пул уже на
// площадке).
func TestSeatPoolOnArena_DoesNotNotifyOnAlreadySeated(t *testing.T) {
	ctx := context.Background()
	notifier := &fakePoolSeatedNotifier{}
	svc, repo, fighters, arenas := newServiceWithNotifier(notifier)
	fighters.Set("n1", domain.FighterRef{ID: "f1"})
	poolID := repo.SeedPool("n1", 1, "f1")
	repo.SeedStatus("n1", domain.LayoutReady)
	arenas.Set(domain.ArenaRef{ID: "a1", Name: "R1", Active: true})
	arenas.Set(domain.ArenaRef{ID: "a2", Name: "R2", Active: true})

	if _, err := svc.SeatPoolOnArena(ctx, poolID, "a1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	notifier.calls = 0 // сбрасываем счётчик первой (успешной) постановки

	_, err := svc.SeatPoolOnArena(ctx, poolID, "a2")
	if !errors.Is(err, domain.ErrAlreadySeated) {
		t.Fatalf("expected ErrAlreadySeated, got %v", err)
	}
	if notifier.calls != 0 {
		t.Fatalf("PoolSeated calls = %d, want 0", notifier.calls)
	}
}

// После UnseatPool и повторной SeatPoolOnArena того же пула Notifier зовётся
// снова — второй независимый вызов, без дедупликации (FR-29).
func TestSeatPoolOnArena_NotifiesAgainAfterReseat(t *testing.T) {
	ctx := context.Background()
	notifier := &fakePoolSeatedNotifier{}
	svc, repo, fighters, arenas := newServiceWithNotifier(notifier)
	fighters.Set("n1", domain.FighterRef{ID: "f1"})
	poolID := repo.SeedPool("n1", 1, "f1")
	repo.SeedStatus("n1", domain.LayoutReady)
	arenas.Set(domain.ArenaRef{ID: "a1", Name: "R1", Active: true})

	if _, err := svc.SeatPoolOnArena(ctx, poolID, "a1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, err := svc.UnseatPool(ctx, poolID); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, err := svc.SeatPoolOnArena(ctx, poolID, "a1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if notifier.calls != 2 {
		t.Fatalf("PoolSeated calls = %d, want 2", notifier.calls)
	}
}

// nil-Notifier — SeatPoolOnArena работает как раньше, без паники.
func TestSeatPoolOnArena_NilNotifierIsNoop(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, arenas := newServiceWithNotifier(nil)
	fighters.Set("n1", domain.FighterRef{ID: "f1"})
	poolID := repo.SeedPool("n1", 1, "f1")
	repo.SeedStatus("n1", domain.LayoutReady)
	arenas.Set(domain.ArenaRef{ID: "a1", Name: "R1", Active: true})

	if _, err := svc.SeatPoolOnArena(ctx, poolID, "a1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

// Паника внутри реализации Notifier не мешает SeatPoolOnArena вернуть
// успешный результат (FR-27/FR-28: почта — побочный эффект, не источник
// истины).
func TestSeatPoolOnArena_NotifierPanicDoesNotFailOperation(t *testing.T) {
	ctx := context.Background()
	notifier := &fakePoolSeatedNotifier{panics: true}
	svc, repo, fighters, arenas := newServiceWithNotifier(notifier)
	fighters.Set("n1", domain.FighterRef{ID: "f1"})
	poolID := repo.SeedPool("n1", 1, "f1")
	repo.SeedStatus("n1", domain.LayoutReady)
	arenas.Set(domain.ArenaRef{ID: "a1", Name: "R1", Active: true})

	layout, err := svc.SeatPoolOnArena(ctx, poolID, "a1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	pool := poolByID(layout.Pools, poolID)
	if pool.Status != domain.PoolStatusPreparing {
		t.Errorf("Status = %q, want preparing", pool.Status)
	}
	if notifier.calls != 1 {
		t.Fatalf("PoolSeated calls = %d, want 1 (panic happens after increment)", notifier.calls)
	}
}
