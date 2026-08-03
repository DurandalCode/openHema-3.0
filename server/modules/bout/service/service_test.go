package service_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/hema/server/modules/bout/domain"
	"github.com/hema/server/modules/bout/service"
	"github.com/hema/server/modules/bout/testutil"
)

const (
	n1           = "11111111-1111-1111-1111-111111111111"
	secretaryID  = "22222222-2222-2222-2222-222222222222"
	poolIDConst  = "33333333-3333-3333-3333-333333333333"
	fighterAIDLC = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
	fighterBIDLC = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
)

// seedScheduledBout заводит в fake-репозитории новый бой в состоянии
// not_started (только событие scheduled) через реальную доменную команду —
// возвращает его ID.
func seedScheduledBout(t *testing.T, repo *testutil.FakeRepo) string {
	t.Helper()
	boutID := uuid.NewString()
	ev, err := domain.Scheduled(poolIDConst, n1, 1, 1,
		domain.FighterRef{ID: fighterAIDLC, Name: "Alice"},
		domain.FighterRef{ID: fighterBIDLC, Name: "Bob"},
		time.Unix(0, 0))
	if err != nil {
		t.Fatalf("Scheduled: %v", err)
	}
	if _, err := repo.SeedEvents(boutID, ev); err != nil {
		t.Fatalf("SeedEvents: %v", err)
	}
	return boutID
}

// seedInProgressBout — тот же бой, но уже начатый (in_progress, счёт 0:0).
func seedInProgressBout(t *testing.T, repo *testutil.FakeRepo) string {
	t.Helper()
	boutID := seedScheduledBout(t, repo)
	events, err := repo.Load(context.Background(), boutID)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	b, err := domain.Rebuild(boutID, events)
	if err != nil {
		t.Fatalf("Rebuild: %v", err)
	}
	startEv, err := b.Start(secretaryID, time.Unix(1, 0))
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	if _, err := repo.SeedEvents(boutID, append(events, startEv)...); err != nil {
		t.Fatalf("SeedEvents: %v", err)
	}
	return boutID
}

func TestGenerateForStage_CollectsAllPoolsInOneReplaceCall(t *testing.T) {
	repo := testutil.NewFakeRepo()
	svc := service.New(repo)

	pools := []domain.PoolInput{
		{PoolID: "p1", Fighters: []domain.FighterRef{{ID: "a"}, {ID: "b"}, {ID: "c"}}},
		{PoolID: "p2", Fighters: []domain.FighterRef{{ID: "d"}, {ID: "e"}}},
	}

	if err := svc.GenerateForStage(context.Background(), n1, pools); err != nil {
		t.Fatalf("GenerateForStage: %v", err)
	}

	calls := repo.ReplaceCalls()
	if len(calls) != 1 {
		t.Fatalf("expected exactly 1 ReplaceForNomination call, got %d", len(calls))
	}
	if calls[0].NominationID != n1 {
		t.Errorf("NominationID = %q, want %q", calls[0].NominationID, n1)
	}
	// p1 (3 fighters) -> 3 bouts, p2 (2 fighters) -> 1 bout = 4 total.
	if len(calls[0].Bouts) != 4 {
		t.Fatalf("expected 4 bouts total, got %d", len(calls[0].Bouts))
	}
	for _, b := range calls[0].Bouts {
		if b.NominationID != n1 {
			t.Errorf("bout NominationID = %q, want %q", b.NominationID, n1)
		}
		if b.PoolID != "p1" && b.PoolID != "p2" {
			t.Errorf("unexpected PoolID %q", b.PoolID)
		}
	}

	list, err := repo.ListByNomination(context.Background(), n1)
	if err != nil {
		t.Fatalf("ListByNomination: %v", err)
	}
	if len(list) != 4 {
		t.Fatalf("expected 4 bouts persisted, got %d", len(list))
	}
}

func TestGenerateForStage_SkipsPoolsWithFewerThanTwoFighters(t *testing.T) {
	repo := testutil.NewFakeRepo()
	svc := service.New(repo)

	pools := []domain.PoolInput{
		{PoolID: "empty", Fighters: nil},
		{PoolID: "solo", Fighters: []domain.FighterRef{{ID: "a"}}},
	}

	if err := svc.GenerateForStage(context.Background(), n1, pools); err != nil {
		t.Fatalf("GenerateForStage: %v", err)
	}

	calls := repo.ReplaceCalls()
	if len(calls) != 1 {
		t.Fatalf("expected exactly 1 ReplaceForNomination call, got %d", len(calls))
	}
	if len(calls[0].Bouts) != 0 {
		t.Fatalf("expected 0 bouts, got %d", len(calls[0].Bouts))
	}
}

func TestGenerateForStage_EmptyNominationIDReturnsErrInvalidInput(t *testing.T) {
	repo := testutil.NewFakeRepo()
	svc := service.New(repo)

	err := svc.GenerateForStage(context.Background(), "", []domain.PoolInput{{PoolID: "p1", Fighters: []domain.FighterRef{{ID: "a"}, {ID: "b"}}}})
	if !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput, got %v", err)
	}
	if len(repo.ReplaceCalls()) != 0 {
		t.Fatalf("repo must not be called on invalid input")
	}
}

// T10 (spec 0017, FR-8): ClearForPools deletes bouts of the listed pools
// only, leaving bouts of another pool in the same nomination untouched.
func TestClearForPools_DeletesOnlyListedPools_LeavesOtherPoolBoutsUntouched(t *testing.T) {
	repo := testutil.NewFakeRepo()
	svc := service.New(repo)
	repo.SeedBouts(n1,
		domain.Bout{PoolID: "p1", NominationID: n1, RoundNumber: 1, SequenceNumber: 1},
		domain.Bout{PoolID: "p2", NominationID: n1, RoundNumber: 1, SequenceNumber: 1},
	)

	if err := svc.ClearForPools(context.Background(), []string{"p1"}); err != nil {
		t.Fatalf("ClearForPools: %v", err)
	}

	calls := repo.DeleteByPoolsCalls()
	if len(calls) != 1 || len(calls[0]) != 1 || calls[0][0] != "p1" {
		t.Fatalf("expected exactly 1 DeleteBoutsByPools([p1]) call, got %+v", calls)
	}

	p1Bouts, err := svc.BoutsByPool(context.Background(), "p1")
	if err != nil {
		t.Fatalf("BoutsByPool(p1): %v", err)
	}
	if len(p1Bouts) != 0 {
		t.Fatalf("expected p1 bouts cleared, got %d", len(p1Bouts))
	}

	p2Bouts, err := svc.BoutsByPool(context.Background(), "p2")
	if err != nil {
		t.Fatalf("BoutsByPool(p2): %v", err)
	}
	if len(p2Bouts) != 1 {
		t.Fatalf("expected p2 (another pool in the same nomination) bouts untouched, got %d", len(p2Bouts))
	}
}

// T10 (spec 0017, FR-8): an empty pool-ID list is a valid no-op — not an
// error, and it must not clear bouts of every pool.
func TestClearForPools_EmptyPoolIDs_NoOp(t *testing.T) {
	repo := testutil.NewFakeRepo()
	svc := service.New(repo)
	repo.SeedBouts(n1, domain.Bout{PoolID: "p1", NominationID: n1, RoundNumber: 1, SequenceNumber: 1})

	if err := svc.ClearForPools(context.Background(), nil); err != nil {
		t.Fatalf("ClearForPools(empty): %v", err)
	}

	if len(repo.DeleteByPoolsCalls()) != 0 {
		t.Fatalf("repo must not be called with an empty pool list")
	}
	got, err := svc.BoutsByPool(context.Background(), "p1")
	if err != nil {
		t.Fatalf("BoutsByPool: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected empty pool list to be a no-op, got %d bouts left", len(got))
	}
}

func TestListByNomination_Passthrough(t *testing.T) {
	repo := testutil.NewFakeRepo()
	svc := service.New(repo)
	repo.SeedBouts(n1,
		domain.Bout{PoolID: "p2", NominationID: n1, RoundNumber: 1, SequenceNumber: 1},
		domain.Bout{PoolID: "p1", NominationID: n1, RoundNumber: 1, SequenceNumber: 1},
	)

	got, err := svc.ListByNomination(context.Background(), n1)
	if err != nil {
		t.Fatalf("ListByNomination: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 bouts, got %d", len(got))
	}
	// Passthrough preserves repo's own ordering (PoolID, SequenceNumber).
	if got[0].PoolID != "p1" || got[1].PoolID != "p2" {
		t.Errorf("unexpected order: %+v", got)
	}
}

func TestListByNomination_EmptyNominationIDReturnsErrInvalidInput(t *testing.T) {
	repo := testutil.NewFakeRepo()
	svc := service.New(repo)

	if _, err := svc.ListByNomination(context.Background(), ""); !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput, got %v", err)
	}
}

func TestGenerateForStage_WritesScheduledStateAndVersion(t *testing.T) {
	repo := testutil.NewFakeRepo()
	svc := service.New(repo)

	pools := []domain.PoolInput{
		{PoolID: poolIDConst, Fighters: []domain.FighterRef{{ID: fighterAIDLC}, {ID: fighterBIDLC}}},
	}
	if err := svc.GenerateForStage(context.Background(), n1, pools); err != nil {
		t.Fatalf("GenerateForStage: %v", err)
	}

	list, err := svc.ListByNomination(context.Background(), n1)
	if err != nil {
		t.Fatalf("ListByNomination: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("expected 1 bout, got %d", len(list))
	}
	b := list[0]
	if b.ID == "" {
		t.Fatal("expected bout ID to be assigned")
	}
	if b.State != domain.StateNotStarted {
		t.Fatalf("State = %v, want StateNotStarted", b.State)
	}
	if b.ScoreA != 0 || b.ScoreB != 0 {
		t.Fatalf("expected 0:0 score, got %d:%d", b.ScoreA, b.ScoreB)
	}
	if b.Version != 1 {
		t.Fatalf("Version = %d, want 1", b.Version)
	}

	// The bout's own event stream must carry the scheduled event too.
	events, err := repo.Load(context.Background(), b.ID)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if len(events) != 1 || events[0].Type != domain.EventScheduled {
		t.Fatalf("expected single scheduled event, got %+v", events)
	}
}

// --- T5: lifecycle happy path ---

func TestStartBout_HappyPath(t *testing.T) {
	repo := testutil.NewFakeRepo()
	svc := service.New(repo)
	boutID := seedScheduledBout(t, repo)

	b, err := svc.StartBout(context.Background(), boutID, secretaryID, time.Unix(1, 0))
	if err != nil {
		t.Fatalf("StartBout: %v", err)
	}
	if b.State != domain.StateInProgress {
		t.Fatalf("State = %v, want StateInProgress", b.State)
	}
	if b.Version != 2 {
		t.Fatalf("Version = %d, want 2", b.Version)
	}
}

func TestStartBout_AlreadyStarted_ErrInvalidTransition(t *testing.T) {
	repo := testutil.NewFakeRepo()
	svc := service.New(repo)
	boutID := seedInProgressBout(t, repo)

	_, err := svc.StartBout(context.Background(), boutID, secretaryID, time.Unix(1, 0))
	if !errors.Is(err, domain.ErrInvalidTransition) {
		t.Fatalf("StartBout() error = %v, want ErrInvalidTransition", err)
	}
}

func TestScoreBout_HappyPath(t *testing.T) {
	repo := testutil.NewFakeRepo()
	svc := service.New(repo)
	boutID := seedInProgressBout(t, repo)

	b, err := svc.ScoreBout(context.Background(), boutID, secretaryID, 5, 3, time.Unix(2, 0))
	if err != nil {
		t.Fatalf("ScoreBout: %v", err)
	}
	if b.ScoreA != 5 || b.ScoreB != 3 {
		t.Fatalf("unexpected score: %d:%d", b.ScoreA, b.ScoreB)
	}
}

// AC-4: score only while in_progress.
func TestScoreBout_NotStarted_ErrInvalidTransition(t *testing.T) {
	repo := testutil.NewFakeRepo()
	svc := service.New(repo)
	boutID := seedScheduledBout(t, repo)

	_, err := svc.ScoreBout(context.Background(), boutID, secretaryID, 1, 0, time.Unix(2, 0))
	if !errors.Is(err, domain.ErrInvalidTransition) {
		t.Fatalf("ScoreBout() error = %v, want ErrInvalidTransition", err)
	}
}

func TestScoreBout_NegativeScore_ErrInvalidInput(t *testing.T) {
	repo := testutil.NewFakeRepo()
	svc := service.New(repo)
	boutID := seedInProgressBout(t, repo)

	_, err := svc.ScoreBout(context.Background(), boutID, secretaryID, -1, 0, time.Unix(2, 0))
	if !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("ScoreBout() error = %v, want ErrInvalidInput", err)
	}
}

func TestFinishBout_HappyPath(t *testing.T) {
	repo := testutil.NewFakeRepo()
	svc := service.New(repo)
	boutID := seedInProgressBout(t, repo)
	if _, err := svc.ScoreBout(context.Background(), boutID, secretaryID, 5, 3, time.Unix(2, 0)); err != nil {
		t.Fatalf("ScoreBout: %v", err)
	}

	b, err := svc.FinishBout(context.Background(), boutID, secretaryID, time.Unix(3, 0))
	if err != nil {
		t.Fatalf("FinishBout: %v", err)
	}
	if b.State != domain.StateFinished {
		t.Fatalf("State = %v, want StateFinished", b.State)
	}
	if b.Outcome() != domain.OutcomeFighterA {
		t.Fatalf("Outcome() = %v, want OutcomeFighterA", b.Outcome())
	}
}

func TestFinishBout_NotStarted_ErrInvalidTransition(t *testing.T) {
	repo := testutil.NewFakeRepo()
	svc := service.New(repo)
	boutID := seedScheduledBout(t, repo)

	_, err := svc.FinishBout(context.Background(), boutID, secretaryID, time.Unix(3, 0))
	if !errors.Is(err, domain.ErrInvalidTransition) {
		t.Fatalf("FinishBout() error = %v, want ErrInvalidTransition", err)
	}
}

func TestReopenBout_HappyPath_PreservesScoreThenAllowsEdit(t *testing.T) {
	repo := testutil.NewFakeRepo()
	svc := service.New(repo)
	boutID := seedInProgressBout(t, repo)
	if _, err := svc.ScoreBout(context.Background(), boutID, secretaryID, 5, 3, time.Unix(2, 0)); err != nil {
		t.Fatalf("ScoreBout: %v", err)
	}
	if _, err := svc.FinishBout(context.Background(), boutID, secretaryID, time.Unix(3, 0)); err != nil {
		t.Fatalf("FinishBout: %v", err)
	}

	b, err := svc.ReopenBout(context.Background(), boutID, secretaryID, time.Unix(4, 0))
	if err != nil {
		t.Fatalf("ReopenBout: %v", err)
	}
	if b.State != domain.StateInProgress {
		t.Fatalf("State = %v, want StateInProgress", b.State)
	}
	if b.ScoreA != 5 || b.ScoreB != 3 {
		t.Fatalf("expected score preserved after reopen, got %d:%d", b.ScoreA, b.ScoreB)
	}

	// AC-7: fix the score, finish again — history keeps both finishes.
	if _, err := svc.ScoreBout(context.Background(), boutID, secretaryID, 5, 5, time.Unix(5, 0)); err != nil {
		t.Fatalf("ScoreBout: %v", err)
	}
	b, err = svc.FinishBout(context.Background(), boutID, secretaryID, time.Unix(6, 0))
	if err != nil {
		t.Fatalf("FinishBout: %v", err)
	}
	if b.ScoreA != 5 || b.ScoreB != 5 {
		t.Fatalf("unexpected score: %d:%d", b.ScoreA, b.ScoreB)
	}
	if b.Outcome() != domain.OutcomeDraw {
		t.Fatalf("Outcome() = %v, want OutcomeDraw", b.Outcome())
	}

	events, err := repo.Load(context.Background(), boutID)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	finishedCount := 0
	for _, ev := range events {
		if ev.Type == domain.EventFinished {
			finishedCount++
		}
	}
	if finishedCount != 2 {
		t.Fatalf("expected 2 EventFinished in history, got %d", finishedCount)
	}
}

func TestReopenBout_NotStarted_ErrInvalidTransition(t *testing.T) {
	repo := testutil.NewFakeRepo()
	svc := service.New(repo)
	boutID := seedScheduledBout(t, repo)

	_, err := svc.ReopenBout(context.Background(), boutID, secretaryID, time.Unix(4, 0))
	if !errors.Is(err, domain.ErrInvalidTransition) {
		t.Fatalf("ReopenBout() error = %v, want ErrInvalidTransition", err)
	}
}

func TestResetBout_HappyPath(t *testing.T) {
	repo := testutil.NewFakeRepo()
	svc := service.New(repo)
	boutID := seedInProgressBout(t, repo)
	if _, err := svc.ScoreBout(context.Background(), boutID, secretaryID, 2, 1, time.Unix(2, 0)); err != nil {
		t.Fatalf("ScoreBout: %v", err)
	}

	b, err := svc.ResetBout(context.Background(), boutID, secretaryID, time.Unix(3, 0))
	if err != nil {
		t.Fatalf("ResetBout: %v", err)
	}
	if b.State != domain.StateNotStarted {
		t.Fatalf("State = %v, want StateNotStarted", b.State)
	}
	if b.ScoreA != 0 || b.ScoreB != 0 {
		t.Fatalf("expected score reset to 0:0, got %d:%d", b.ScoreA, b.ScoreB)
	}
}

func TestResetBout_NotStarted_ErrInvalidTransition(t *testing.T) {
	repo := testutil.NewFakeRepo()
	svc := service.New(repo)
	boutID := seedScheduledBout(t, repo)

	_, err := svc.ResetBout(context.Background(), boutID, secretaryID, time.Unix(3, 0))
	if !errors.Is(err, domain.ErrInvalidTransition) {
		t.Fatalf("ResetBout() error = %v, want ErrInvalidTransition", err)
	}
}

func TestStartBout_UnknownBout_ErrNotFound(t *testing.T) {
	repo := testutil.NewFakeRepo()
	svc := service.New(repo)

	_, err := svc.StartBout(context.Background(), uuid.NewString(), secretaryID, time.Unix(1, 0))
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("StartBout() error = %v, want ErrNotFound", err)
	}
}

// --- T5: read methods ---

func TestBoutsByPool_OrderedBySequence(t *testing.T) {
	repo := testutil.NewFakeRepo()
	svc := service.New(repo)
	repo.SeedBouts(n1,
		domain.Bout{PoolID: poolIDConst, RoundNumber: 1, SequenceNumber: 2},
		domain.Bout{PoolID: poolIDConst, RoundNumber: 1, SequenceNumber: 1},
	)

	got, err := svc.BoutsByPool(context.Background(), poolIDConst)
	if err != nil {
		t.Fatalf("BoutsByPool: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 bouts, got %d", len(got))
	}
	if got[0].SequenceNumber != 1 || got[1].SequenceNumber != 2 {
		t.Fatalf("unexpected order: %+v", got)
	}
}

func TestPoolProgress_CountsStartedAndFinished(t *testing.T) {
	repo := testutil.NewFakeRepo()
	svc := service.New(repo)
	boutID1 := seedInProgressBout(t, repo)
	_ = boutID1
	repo.SeedBouts(n1, domain.Bout{PoolID: poolIDConst, RoundNumber: 1, SequenceNumber: 2, State: domain.StateNotStarted})

	total, started, finished, err := svc.PoolProgress(context.Background(), poolIDConst)
	if err != nil {
		t.Fatalf("PoolProgress: %v", err)
	}
	if total != 2 {
		t.Fatalf("total = %d, want 2", total)
	}
	if started != 1 {
		t.Fatalf("started = %d, want 1", started)
	}
	if finished != 0 {
		t.Fatalf("finished = %d, want 0", finished)
	}
}

// T10 (spec 0017, FR-8): AnyStartedInPools only looks within the given pool
// list, ignoring started bouts that live outside it.
func TestAnyStartedInPools_OnlyLooksWithinGivenPools(t *testing.T) {
	repo := testutil.NewFakeRepo()
	svc := service.New(repo)
	repo.SeedBouts(n1, domain.Bout{PoolID: "p2", NominationID: n1, RoundNumber: 1, SequenceNumber: 1, State: domain.StateInProgress})

	got, err := svc.AnyStartedInPools(context.Background(), []string{"p1"})
	if err != nil {
		t.Fatalf("AnyStartedInPools: %v", err)
	}
	if got {
		t.Fatal("expected false: the started bout is in p2, outside the requested pool list")
	}

	got, err = svc.AnyStartedInPools(context.Background(), []string{"p1", "p2"})
	if err != nil {
		t.Fatalf("AnyStartedInPools: %v", err)
	}
	if !got {
		t.Fatal("expected true: p2 is in the requested pool list and has a started bout")
	}
}

// T10 (spec 0017, FR-8): an empty pool-ID list is a valid no-op — not an
// error, and it must not report started bouts that live outside it as if
// they were in scope.
func TestAnyStartedInPools_EmptyPoolIDs_NoOp(t *testing.T) {
	repo := testutil.NewFakeRepo()
	svc := service.New(repo)
	repo.SeedBouts(n1, domain.Bout{PoolID: "p1", NominationID: n1, RoundNumber: 1, SequenceNumber: 1, State: domain.StateInProgress})

	got, err := svc.AnyStartedInPools(context.Background(), nil)
	if err != nil {
		t.Fatalf("AnyStartedInPools(empty): %v", err)
	}
	if got {
		t.Fatal("expected false: an empty pool list must not report started bouts anywhere")
	}
}

// --- T5: transparent retry on concurrency conflict (ADR 0011 п.3, AC-15) ---

// flakyRepo — тестовый декоратор над FakeRepo, симулирующий конфликт версии
// (ErrConcurrency) на первых N вызовах Append, не трогая реальное хранилище.
type flakyRepo struct {
	*testutil.FakeRepo
	failuresLeft int
	calls        int
}

func (r *flakyRepo) Append(ctx context.Context, boutID string, expectedVersion int, ev domain.Event, view domain.BoutView) error {
	r.calls++
	if r.failuresLeft > 0 {
		r.failuresLeft--
		return domain.ErrConcurrency
	}
	return r.FakeRepo.Append(ctx, boutID, expectedVersion, ev, view)
}

func TestConcurrency_OneRetryThenSuccess(t *testing.T) {
	repo := &flakyRepo{FakeRepo: testutil.NewFakeRepo()}
	svc := service.New(repo)
	boutID := seedScheduledBout(t, repo.FakeRepo)

	repo.failuresLeft = 1
	repo.calls = 0
	b, err := svc.StartBout(context.Background(), boutID, secretaryID, time.Unix(1, 0))
	if err != nil {
		t.Fatalf("expected StartBout to succeed after one retry, got %v", err)
	}
	if b.State != domain.StateInProgress {
		t.Fatalf("State = %v, want StateInProgress", b.State)
	}
	if repo.calls != 2 {
		t.Fatalf("expected exactly 2 Append calls (1 conflict + 1 retry), got %d", repo.calls)
	}
}

func TestConcurrency_ExhaustedThenAborted(t *testing.T) {
	repo := &flakyRepo{FakeRepo: testutil.NewFakeRepo()}
	svc := service.New(repo)
	boutID := seedScheduledBout(t, repo.FakeRepo)

	repo.failuresLeft = 2
	repo.calls = 0
	_, err := svc.StartBout(context.Background(), boutID, secretaryID, time.Unix(1, 0))
	if !errors.Is(err, domain.ErrConcurrency) {
		t.Fatalf("expected ErrConcurrency after exhausted retry, got %v", err)
	}
	if repo.calls != 2 {
		t.Fatalf("expected exactly 2 Append attempts (no unbounded retry loop), got %d", repo.calls)
	}
}
