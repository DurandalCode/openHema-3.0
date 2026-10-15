package service_test

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"github.com/hema/server/modules/stage/domain"
	"github.com/hema/server/modules/stage/testutil"
)

// queueFixture — три готовых пула номинации n1 (А, Б, В) и две активные арены.
type queueFixture struct {
	repo           *testutil.FakeRepo
	arenas         *testutil.FakeArenaProvider
	bus            *testutil.FakeLiveBus
	stageID        string
	a, b, v        string
	enqueue        func(poolID, arenaID string) (domain.ArenaPools, error)
	dequeue        func(poolID string) (domain.ArenaPools, error)
	reorder        func(arenaID string, ids []string) (domain.ArenaPools, error)
	seatNext       func(arenaID string) (domain.ArenaPools, error)
	seat           func(poolID, arenaID string) (domain.Layout, error)
	unseat         func(poolID string) (domain.Layout, error)
	poolsForArena  func(arenaID string) (domain.ArenaPools, error)
	setStatusDraft func() (domain.Layout, error)
}

func newQueueFixture(t *testing.T) *queueFixture {
	t.Helper()
	ctx := context.Background()
	svc, repo, fighters, _, arenas, bus := newServiceWithArenas()
	fighters.Set("n1", domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"}, domain.FighterRef{ID: "f3"})
	a := repo.SeedPool("n1", 1, "f1")
	b := repo.SeedPool("n1", 2, "f2")
	v := repo.SeedPool("n1", 3, "f3")
	repo.SeedStatus("n1", domain.LayoutReady)
	arenas.Set(domain.ArenaRef{ID: "a1", Name: "Арена 1", Active: true})
	arenas.Set(domain.ArenaRef{ID: "a2", Name: "Арена 2", Active: true})
	arenas.Set(domain.ArenaRef{ID: "arch", Name: "Архивная", Active: false})

	f := &queueFixture{repo: repo, arenas: arenas, bus: bus, a: a, b: b, v: v, stageID: stageIDFor(t, repo, "n1")}
	f.enqueue = func(p, ar string) (domain.ArenaPools, error) { return svc.EnqueuePool(ctx, p, ar) }
	f.dequeue = func(p string) (domain.ArenaPools, error) { return svc.DequeuePool(ctx, p) }
	f.reorder = func(ar string, ids []string) (domain.ArenaPools, error) {
		return svc.ReorderArenaQueue(ctx, ar, ids)
	}
	f.seatNext = func(ar string) (domain.ArenaPools, error) { return svc.SeatNextPool(ctx, ar) }
	f.seat = func(p, ar string) (domain.Layout, error) { return svc.SeatPoolOnArena(ctx, p, ar) }
	f.unseat = func(p string) (domain.Layout, error) { return svc.UnseatPool(ctx, p) }
	f.poolsForArena = func(ar string) (domain.ArenaPools, error) { return svc.GetPoolsForArena(ctx, ar) }
	f.setStatusDraft = func() (domain.Layout, error) { return svc.SetStatus(ctx, f.stageID, domain.LayoutDraft) }
	return f
}

func ids(pools []domain.Pool) []string {
	out := make([]string, len(pools))
	for i, p := range pools {
		out[i] = p.ID
	}
	return out
}

// AC-1: добавление в очередь по порядку; А остаётся на арене; Б и В не
// предлагаются в available этой арены.
func TestEnqueuePool_AC1_AppendsInOrder(t *testing.T) {
	f := newQueueFixture(t)
	if _, err := f.seat(f.a, "a1"); err != nil {
		t.Fatal(err)
	}
	if _, err := f.enqueue(f.b, "a1"); err != nil {
		t.Fatal(err)
	}
	res, err := f.enqueue(f.v, "a1")
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{f.b, f.v}; !reflect.DeepEqual(ids(res.Queued), want) {
		t.Fatalf("Queued = %v, want %v", ids(res.Queued), want)
	}
	if res.Seated == nil || res.Seated.ID != f.a {
		t.Fatalf("Seated = %+v, want pool A", res.Seated)
	}
	for _, p := range res.Available {
		if p.ID == f.b || p.ID == f.v {
			t.Fatalf("queued pool %s must not be in Available of its own arena", p.ID)
		}
	}
	if res.Queued[1].QueuePosition != 2 || res.Queued[1].QueueArenaID != "a1" || res.Queued[1].QueueArenaName != "Арена 1" {
		t.Fatalf("queue info not filled: %+v", res.Queued[1])
	}
}

// AC-2: стоящий на арене пул в очередь не идёт.
func TestEnqueuePool_AC2_SeatedRejected(t *testing.T) {
	f := newQueueFixture(t)
	if _, err := f.seat(f.a, "a1"); err != nil {
		t.Fatal(err)
	}
	_, err := f.enqueue(f.a, "a2")
	if !errors.Is(err, domain.ErrAlreadySeated) {
		t.Fatalf("err = %v, want ErrAlreadySeated", err)
	}
	q, _ := f.poolsForArena("a2")
	if len(q.Queued) != 0 {
		t.Fatalf("queue must stay empty, got %v", ids(q.Queued))
	}
}

func TestEnqueuePool_Rejections(t *testing.T) {
	f := newQueueFixture(t)
	if _, err := f.enqueue("", "a1"); !errors.Is(err, domain.ErrInvalidInput) {
		t.Errorf("empty pool id: %v", err)
	}
	if _, err := f.enqueue(f.b, ""); !errors.Is(err, domain.ErrInvalidInput) {
		t.Errorf("empty arena id: %v", err)
	}
	if _, err := f.enqueue("nope", "a1"); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("unknown pool: %v", err)
	}
	if _, err := f.enqueue(f.b, "arch"); !errors.Is(err, domain.ErrArenaNotAvailable) {
		t.Errorf("archived arena: %v", err)
	}
	if _, err := f.enqueue(f.b, "missing"); !errors.Is(err, domain.ErrArenaNotAvailable) {
		t.Errorf("unknown arena: %v", err)
	}
}

func TestEnqueuePool_NotReadyRejected(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, arenas, _ := newServiceWithArenas()
	fighters.Set("n1", domain.FighterRef{ID: "f1"})
	p := repo.SeedPool("n1", 1, "f1") // раскладка draft
	arenas.Set(domain.ArenaRef{ID: "a1", Name: "R1", Active: true})
	if _, err := svc.EnqueuePool(ctx, p, "a1"); !errors.Is(err, domain.ErrNotReady) {
		t.Fatalf("err = %v, want ErrNotReady", err)
	}
}

// AC-3: добавление пула из очереди одной арены в очередь другой — перенос.
func TestEnqueuePool_AC3_TransferBetweenQueues(t *testing.T) {
	f := newQueueFixture(t)
	for _, p := range []string{f.a, f.b, f.v} {
		if _, err := f.enqueue(p, "a1"); err != nil {
			t.Fatal(err)
		}
	}
	res, err := f.enqueue(f.b, "a2")
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{f.b}; !reflect.DeepEqual(ids(res.Queued), want) {
		t.Fatalf("a2 queue = %v, want %v", ids(res.Queued), want)
	}
	a1, _ := f.poolsForArena("a1")
	if want := []string{f.a, f.v}; !reflect.DeepEqual(ids(a1.Queued), want) {
		t.Fatalf("a1 queue = %v, want %v", ids(a1.Queued), want)
	}
	if a1.Queued[1].QueuePosition != 2 {
		t.Fatalf("positions must be compacted, got %d", a1.Queued[1].QueuePosition)
	}
	// Б теперь предлагается в available арены a1 с пометкой чужой очереди.
	var found bool
	for _, p := range a1.Available {
		if p.ID == f.b {
			found = true
			if p.QueueArenaID != "a2" || p.QueuePosition != 1 {
				t.Fatalf("foreign queue mark = %+v", p)
			}
		}
	}
	if !found {
		t.Fatal("pool from another arena's queue must stay in Available")
	}
}

// AC-4: порядок и удаление.
func TestReorderAndDequeue_AC4(t *testing.T) {
	f := newQueueFixture(t)
	for _, p := range []string{f.a, f.b, f.v} {
		if _, err := f.enqueue(p, "a1"); err != nil {
			t.Fatal(err)
		}
	}
	res, err := f.reorder("a1", []string{f.v, f.a, f.b})
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{f.v, f.a, f.b}; !reflect.DeepEqual(ids(res.Queued), want) {
		t.Fatalf("after reorder = %v, want %v", ids(res.Queued), want)
	}
	res, err = f.dequeue(f.a)
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{f.v, f.b}; !reflect.DeepEqual(ids(res.Queued), want) {
		t.Fatalf("after dequeue = %v, want %v", ids(res.Queued), want)
	}
	var back bool
	for _, p := range res.Available {
		if p.ID == f.a {
			back = true
		}
	}
	if !back {
		t.Fatal("dequeued pool must return to Available")
	}
}

func TestReorderArenaQueue_StaleSetRejected(t *testing.T) {
	f := newQueueFixture(t)
	for _, p := range []string{f.a, f.b} {
		if _, err := f.enqueue(p, "a1"); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := f.reorder("a1", []string{f.a}); !errors.Is(err, domain.ErrQueueMismatch) {
		t.Fatalf("err = %v, want ErrQueueMismatch", err)
	}
	if _, err := f.reorder("a1", []string{f.a, f.a}); !errors.Is(err, domain.ErrQueueMismatch) {
		t.Fatalf("duplicate: err = %v, want ErrQueueMismatch", err)
	}
	if _, err := f.reorder("", nil); !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("empty arena: err = %v, want ErrInvalidInput", err)
	}
}

func TestDequeuePool_NotQueued(t *testing.T) {
	f := newQueueFixture(t)
	if _, err := f.dequeue(f.a); !errors.Is(err, domain.ErrNotQueued) {
		t.Fatalf("err = %v, want ErrNotQueued", err)
	}
	if _, err := f.dequeue(""); !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("empty id: err = %v, want ErrInvalidInput", err)
	}
}

// AC-5: снятие пула не ставит следующий автоматически.
func TestUnseat_AC5_NoAutoSeat(t *testing.T) {
	f := newQueueFixture(t)
	if _, err := f.seat(f.a, "a1"); err != nil {
		t.Fatal(err)
	}
	if _, err := f.enqueue(f.b, "a1"); err != nil {
		t.Fatal(err)
	}
	if _, err := f.unseat(f.a); err != nil {
		t.Fatal(err)
	}
	res, err := f.poolsForArena("a1")
	if err != nil {
		t.Fatal(err)
	}
	if res.Seated != nil {
		t.Fatalf("arena must stay free, seated = %+v", res.Seated)
	}
	if want := []string{f.b}; !reflect.DeepEqual(ids(res.Queued), want) {
		t.Fatalf("queue = %v, want %v", ids(res.Queued), want)
	}
}

// AC-6: «Поставить следующий».
func TestSeatNextPool_AC6(t *testing.T) {
	f := newQueueFixture(t)
	for _, p := range []string{f.b, f.v} {
		if _, err := f.enqueue(p, "a1"); err != nil {
			t.Fatal(err)
		}
	}
	res, err := f.seatNext("a1")
	if err != nil {
		t.Fatal(err)
	}
	if res.Seated == nil || res.Seated.ID != f.b || res.Seated.Status != domain.PoolStatusPreparing {
		t.Fatalf("Seated = %+v, want pool B preparing", res.Seated)
	}
	if want := []string{f.v}; !reflect.DeepEqual(ids(res.Queued), want) {
		t.Fatalf("queue = %v, want %v", ids(res.Queued), want)
	}
	if res.Queued[0].QueuePosition != 1 {
		t.Fatalf("remaining position = %d, want 1", res.Queued[0].QueuePosition)
	}
}

func TestSeatNextPool_EmptyQueueAndBusyArena(t *testing.T) {
	f := newQueueFixture(t)
	if _, err := f.seatNext("a1"); !errors.Is(err, domain.ErrQueueEmpty) {
		t.Fatalf("empty queue: err = %v, want ErrQueueEmpty", err)
	}
	if _, err := f.seatNext(""); !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("empty arena: err = %v, want ErrInvalidInput", err)
	}
	if _, err := f.seat(f.a, "a1"); err != nil {
		t.Fatal(err)
	}
	if _, err := f.enqueue(f.b, "a1"); err != nil {
		t.Fatal(err)
	}
	// FR-11: арена занята — отказ, очередь цела.
	if _, err := f.seatNext("a1"); !errors.Is(err, domain.ErrArenaBusy) {
		t.Fatalf("busy arena: err = %v, want ErrArenaBusy", err)
	}
	res, _ := f.poolsForArena("a1")
	if want := []string{f.b}; !reflect.DeepEqual(ids(res.Queued), want) {
		t.Fatalf("queue must be intact, got %v", ids(res.Queued))
	}
}

// AC-7: обычная постановка убирает пул из очереди.
func TestSeatPool_AC7_RemovesFromQueue(t *testing.T) {
	f := newQueueFixture(t)
	for _, p := range []string{f.b, f.v} {
		if _, err := f.enqueue(p, "a1"); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := f.seat(f.v, "a2"); err != nil {
		t.Fatal(err)
	}
	res, _ := f.poolsForArena("a1")
	if want := []string{f.b}; !reflect.DeepEqual(ids(res.Queued), want) {
		t.Fatalf("a1 queue = %v, want %v", ids(res.Queued), want)
	}
	if res.Queued[0].QueuePosition != 1 {
		t.Fatalf("position = %d, want 1", res.Queued[0].QueuePosition)
	}
}

// AC-8: откат раскладки при пуле в очереди отклоняется, арена названа.
func TestSetStatusDraft_AC8_RejectedWhenQueued(t *testing.T) {
	f := newQueueFixture(t)
	if _, err := f.enqueue(f.b, "a1"); err != nil {
		t.Fatal(err)
	}
	_, err := f.setStatusDraft()
	if !errors.Is(err, domain.ErrPoolQueued) {
		t.Fatalf("err = %v, want ErrPoolQueued", err)
	}
	var qe *domain.PoolQueuedError
	if !errors.As(err, &qe) || qe.ArenaID != "a1" || qe.ArenaName != "Арена 1" {
		t.Fatalf("error must name arena a1, got %#v", err)
	}
	// После снятия из очереди откат проходит.
	if _, err := f.dequeue(f.b); err != nil {
		t.Fatal(err)
	}
	if _, err := f.setStatusDraft(); err != nil {
		t.Fatalf("after dequeue: %v", err)
	}
}

// AC-9: StageTitle в списках и у пулов очереди.
func TestGetPoolsForArena_AC9_StageTitle(t *testing.T) {
	f := newQueueFixture(t)
	if _, err := f.enqueue(f.b, "a1"); err != nil {
		t.Fatal(err)
	}
	if _, err := f.seat(f.a, "a1"); err != nil {
		t.Fatal(err)
	}
	res, err := f.poolsForArena("a1")
	if err != nil {
		t.Fatal(err)
	}
	want := domain.DefaultStageTitle
	if res.Seated.StageTitle != want {
		t.Errorf("Seated.StageTitle = %q, want %q", res.Seated.StageTitle, want)
	}
	if res.Queued[0].StageTitle != want {
		t.Errorf("Queued.StageTitle = %q, want %q", res.Queued[0].StageTitle, want)
	}
	for _, p := range res.Available {
		if p.StageTitle != want {
			t.Errorf("Available %s StageTitle = %q, want %q", p.ID, p.StageTitle, want)
		}
	}
}

// AC-14: очередь архивной арены сохраняется; её пулы предлагаются другой
// арене с пометкой, а добавление переносит.
func TestArchivedArenaQueue_AC14(t *testing.T) {
	f := newQueueFixture(t)
	if _, err := f.enqueue(f.b, "a1"); err != nil {
		t.Fatal(err)
	}
	f.arenas.Set(domain.ArenaRef{ID: "a1", Name: "Арена 1", Active: false})

	res, err := f.poolsForArena("a2")
	if err != nil {
		t.Fatal(err)
	}
	var mark domain.Pool
	for _, p := range res.Available {
		if p.ID == f.b {
			mark = p
		}
	}
	if mark.QueueArenaID != "a1" || mark.QueueArenaName != "Арена 1" {
		t.Fatalf("pool B must carry its archived queue mark, got %+v", mark)
	}
	res, err = f.enqueue(f.b, "a2")
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{f.b}; !reflect.DeepEqual(ids(res.Queued), want) {
		t.Fatalf("a2 queue = %v, want %v", ids(res.Queued), want)
	}
}

// NFR-1: каждое изменение очереди публикуется в живой канал номинации.
func TestQueueMutations_PublishLive(t *testing.T) {
	f := newQueueFixture(t)
	before := f.bus.PublishedCount("n1")
	if _, err := f.enqueue(f.b, "a1"); err != nil {
		t.Fatal(err)
	}
	if _, err := f.enqueue(f.v, "a1"); err != nil {
		t.Fatal(err)
	}
	if _, err := f.reorder("a1", []string{f.v, f.b}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.dequeue(f.b); err != nil {
		t.Fatal(err)
	}
	if got := f.bus.PublishedCount("n1") - before; got != 4 {
		t.Fatalf("published %d times, want 4 (one per mutation)", got)
	}
}
