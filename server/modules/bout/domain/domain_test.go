package domain_test

import (
	"errors"
	"testing"
	"time"

	"github.com/hema/server/modules/bout/domain"
)

var (
	fa = domain.FighterRef{ID: "fa", Name: "Alice"}
	fb = domain.FighterRef{ID: "fb", Name: "Bob"}
)

func scheduledEvent(t *testing.T) domain.Event {
	t.Helper()
	ev, err := domain.Scheduled("pool-1", "nom-1", 1, 1, fa, fb, time.Unix(0, 0))
	if err != nil {
		t.Fatalf("Scheduled: %v", err)
	}
	return ev
}

// --- T2: Outcome (AC-2/AC-2b/AC-3) ---

func TestOutcome_FighterAWins(t *testing.T) {
	b := domain.Bout{ScoreA: 5, ScoreB: 3}
	if got := b.Outcome(); got != domain.OutcomeFighterA {
		t.Fatalf("Outcome() = %v, want OutcomeFighterA", got)
	}
}

func TestOutcome_FighterBWins(t *testing.T) {
	b := domain.Bout{ScoreA: 2, ScoreB: 6}
	if got := b.Outcome(); got != domain.OutcomeFighterB {
		t.Fatalf("Outcome() = %v, want OutcomeFighterB", got)
	}
}

func TestOutcome_Draw(t *testing.T) {
	b := domain.Bout{ScoreA: 4, ScoreB: 4}
	if got := b.Outcome(); got != domain.OutcomeDraw {
		t.Fatalf("Outcome() = %v, want OutcomeDraw", got)
	}
	// 0:0 (not started) is also a draw — предварительный исход.
	if got := (domain.Bout{}).Outcome(); got != domain.OutcomeDraw {
		t.Fatalf("Outcome() of zero-value bout = %v, want OutcomeDraw", got)
	}
}

// --- T3: Scheduled + Rebuild/apply per event type ---

func TestScheduled_InvalidInput(t *testing.T) {
	now := time.Unix(0, 0)
	cases := []struct {
		name                 string
		poolID, nominationID string
		round, seq           int
		a, b                 domain.FighterRef
	}{
		{"empty pool", "", "nom-1", 1, 1, fa, fb},
		{"empty nomination", "pool-1", "", 1, 1, fa, fb},
		{"empty fighter a id", "pool-1", "nom-1", 1, 1, domain.FighterRef{}, fb},
		{"empty fighter b id", "pool-1", "nom-1", 1, 1, fa, domain.FighterRef{}},
		{"same fighter", "pool-1", "nom-1", 1, 1, fa, fa},
		{"round zero", "pool-1", "nom-1", 0, 1, fa, fb},
		{"sequence zero", "pool-1", "nom-1", 1, 0, fa, fb},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := domain.Scheduled(tc.poolID, tc.nominationID, tc.round, tc.seq, tc.a, tc.b, now)
			if !errors.Is(err, domain.ErrInvalidInput) {
				t.Fatalf("Scheduled() error = %v, want ErrInvalidInput", err)
			}
		})
	}
}

func TestRebuild_EmptyStream_ErrNotFound(t *testing.T) {
	_, err := domain.Rebuild("bout-1", nil)
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("Rebuild() error = %v, want ErrNotFound", err)
	}
}

func TestRebuild_Scheduled(t *testing.T) {
	b, err := domain.Rebuild("bout-1", []domain.Event{scheduledEvent(t)})
	if err != nil {
		t.Fatalf("Rebuild: %v", err)
	}
	if b.ID != "bout-1" || b.PoolID != "pool-1" || b.NominationID != "nom-1" {
		t.Fatalf("unexpected identity: %+v", b)
	}
	if b.RoundNumber != 1 || b.SequenceNumber != 1 {
		t.Fatalf("unexpected round/sequence: %+v", b)
	}
	if b.FighterA != fa || b.FighterB != fb {
		t.Fatalf("unexpected fighters: %+v", b)
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
}

func TestRebuild_Started(t *testing.T) {
	sched := scheduledEvent(t)
	b, _ := domain.Rebuild("bout-1", []domain.Event{sched})
	ev, err := b.Start("secretary-1", time.Unix(1, 0))
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	b, err = domain.Rebuild("bout-1", []domain.Event{sched, ev})
	if err != nil {
		t.Fatalf("Rebuild: %v", err)
	}
	if b.State != domain.StateInProgress {
		t.Fatalf("State = %v, want StateInProgress", b.State)
	}
	if b.Version != 2 {
		t.Fatalf("Version = %d, want 2", b.Version)
	}
}

func TestRebuild_Scored(t *testing.T) {
	sched := scheduledEvent(t)
	b, _ := domain.Rebuild("bout-1", []domain.Event{sched})
	started, _ := b.Start("secretary-1", time.Unix(1, 0))
	b, _ = domain.Rebuild("bout-1", []domain.Event{sched, started})
	scored, err := b.Score("secretary-1", 5, 3, time.Unix(2, 0))
	if err != nil {
		t.Fatalf("Score: %v", err)
	}
	b, err = domain.Rebuild("bout-1", []domain.Event{sched, started, scored})
	if err != nil {
		t.Fatalf("Rebuild: %v", err)
	}
	if b.ScoreA != 5 || b.ScoreB != 3 {
		t.Fatalf("unexpected score: %d:%d", b.ScoreA, b.ScoreB)
	}
	if b.State != domain.StateInProgress {
		t.Fatalf("State = %v, want StateInProgress (Score doesn't change state)", b.State)
	}
}

func TestRebuild_Finished(t *testing.T) {
	sched := scheduledEvent(t)
	b, _ := domain.Rebuild("bout-1", []domain.Event{sched})
	started, _ := b.Start("secretary-1", time.Unix(1, 0))
	b, _ = domain.Rebuild("bout-1", []domain.Event{sched, started})
	scored, _ := b.Score("secretary-1", 5, 3, time.Unix(2, 0))
	b, _ = domain.Rebuild("bout-1", []domain.Event{sched, started, scored})
	finished, err := b.Finish("secretary-1", time.Unix(3, 0))
	if err != nil {
		t.Fatalf("Finish: %v", err)
	}
	b, err = domain.Rebuild("bout-1", []domain.Event{sched, started, scored, finished})
	if err != nil {
		t.Fatalf("Rebuild: %v", err)
	}
	if b.State != domain.StateFinished {
		t.Fatalf("State = %v, want StateFinished", b.State)
	}
	if b.ScoreA != 5 || b.ScoreB != 3 {
		t.Fatalf("score changed on finish: %d:%d", b.ScoreA, b.ScoreB)
	}
	if b.Outcome() != domain.OutcomeFighterA {
		t.Fatalf("Outcome() = %v, want OutcomeFighterA", b.Outcome())
	}
}

func TestRebuild_Reopened(t *testing.T) {
	sched := scheduledEvent(t)
	b, _ := domain.Rebuild("bout-1", []domain.Event{sched})
	started, _ := b.Start("s", time.Unix(1, 0))
	b, _ = domain.Rebuild("bout-1", []domain.Event{sched, started})
	scored, _ := b.Score("s", 5, 3, time.Unix(2, 0))
	b, _ = domain.Rebuild("bout-1", []domain.Event{sched, started, scored})
	finished, _ := b.Finish("s", time.Unix(3, 0))
	b, _ = domain.Rebuild("bout-1", []domain.Event{sched, started, scored, finished})

	reopened, err := b.Reopen("s", time.Unix(4, 0))
	if err != nil {
		t.Fatalf("Reopen: %v", err)
	}
	b, err = domain.Rebuild("bout-1", []domain.Event{sched, started, scored, finished, reopened})
	if err != nil {
		t.Fatalf("Rebuild: %v", err)
	}
	if b.State != domain.StateInProgress {
		t.Fatalf("State = %v, want StateInProgress", b.State)
	}
	// Score preserved across reopen (spec AC-7: only a subsequent Score changes it).
	if b.ScoreA != 5 || b.ScoreB != 3 {
		t.Fatalf("expected score preserved after reopen, got %d:%d", b.ScoreA, b.ScoreB)
	}
}

func TestRebuild_Reset(t *testing.T) {
	sched := scheduledEvent(t)
	b, _ := domain.Rebuild("bout-1", []domain.Event{sched})
	started, _ := b.Start("s", time.Unix(1, 0))
	b, _ = domain.Rebuild("bout-1", []domain.Event{sched, started})
	scored, _ := b.Score("s", 2, 1, time.Unix(2, 0))
	b, _ = domain.Rebuild("bout-1", []domain.Event{sched, started, scored})

	reset, err := b.Reset("s", time.Unix(3, 0))
	if err != nil {
		t.Fatalf("Reset: %v", err)
	}
	b, err = domain.Rebuild("bout-1", []domain.Event{sched, started, scored, reset})
	if err != nil {
		t.Fatalf("Rebuild: %v", err)
	}
	if b.State != domain.StateNotStarted {
		t.Fatalf("State = %v, want StateNotStarted", b.State)
	}
	if b.ScoreA != 0 || b.ScoreB != 0 {
		t.Fatalf("expected score reset to 0:0, got %d:%d", b.ScoreA, b.ScoreB)
	}
}

func TestRebuild_UnknownEventType(t *testing.T) {
	_, err := domain.Rebuild("bout-1", []domain.Event{{Type: "bogus", Sequence: 1}})
	if err == nil {
		t.Fatal("expected error for unknown event type")
	}
}

// --- T3: valid/invalid transitions per command ---

func newNotStarted(t *testing.T) domain.Bout {
	t.Helper()
	b, err := domain.Rebuild("bout-1", []domain.Event{scheduledEvent(t)})
	if err != nil {
		t.Fatalf("Rebuild: %v", err)
	}
	return b
}

func newInProgress(t *testing.T) domain.Bout {
	t.Helper()
	b := newNotStarted(t)
	ev, err := b.Start("s", time.Unix(1, 0))
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	b, err = domain.Rebuild("bout-1", []domain.Event{scheduledEvent(t), ev})
	if err != nil {
		t.Fatalf("Rebuild: %v", err)
	}
	return b
}

// finishedHistory builds the full event history of a bout that reached
// StateFinished with score 5:3 (scheduled → started → scored → finished).
func finishedHistory(t *testing.T) []domain.Event {
	t.Helper()
	sched := scheduledEvent(t)
	b, err := domain.Rebuild("bout-1", []domain.Event{sched})
	if err != nil {
		t.Fatalf("Rebuild: %v", err)
	}
	startEv, err := b.Start("s", time.Unix(1, 0))
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	b, err = domain.Rebuild("bout-1", []domain.Event{sched, startEv})
	if err != nil {
		t.Fatalf("Rebuild: %v", err)
	}
	scoreEv, err := b.Score("s", 5, 3, time.Unix(2, 0))
	if err != nil {
		t.Fatalf("Score: %v", err)
	}
	b, err = domain.Rebuild("bout-1", []domain.Event{sched, startEv, scoreEv})
	if err != nil {
		t.Fatalf("Rebuild: %v", err)
	}
	finishEv, err := b.Finish("s", time.Unix(3, 0))
	if err != nil {
		t.Fatalf("Finish: %v", err)
	}
	return []domain.Event{sched, startEv, scoreEv, finishEv}
}

func newFinished(t *testing.T) domain.Bout {
	t.Helper()
	b, err := domain.Rebuild("bout-1", finishedHistory(t))
	if err != nil {
		t.Fatalf("Rebuild: %v", err)
	}
	return b
}

func TestStart_FromNotStarted_OK(t *testing.T) {
	b := newNotStarted(t)
	ev, err := b.Start("s", time.Unix(1, 0))
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	if ev.Type != domain.EventStarted {
		t.Fatalf("Type = %v, want EventStarted", ev.Type)
	}
	if ev.Sequence != 2 {
		t.Fatalf("Sequence = %d, want 2", ev.Sequence)
	}
}

func TestStart_FromInProgress_ErrInvalidTransition(t *testing.T) {
	b := newInProgress(t)
	_, err := b.Start("s", time.Unix(1, 0))
	if !errors.Is(err, domain.ErrInvalidTransition) {
		t.Fatalf("Start() error = %v, want ErrInvalidTransition", err)
	}
}

func TestStart_FromFinished_ErrInvalidTransition(t *testing.T) {
	b := newFinished(t)
	_, err := b.Start("s", time.Unix(1, 0))
	if !errors.Is(err, domain.ErrInvalidTransition) {
		t.Fatalf("Start() error = %v, want ErrInvalidTransition", err)
	}
}

func TestScore_FromInProgress_OK(t *testing.T) {
	b := newInProgress(t)
	ev, err := b.Score("s", 7, 4, time.Unix(2, 0))
	if err != nil {
		t.Fatalf("Score: %v", err)
	}
	if ev.Payload.ScoreA != 7 || ev.Payload.ScoreB != 4 {
		t.Fatalf("unexpected payload: %+v", ev.Payload)
	}
}

// AC-4: score only while in_progress.
func TestScore_FromNotStarted_ErrInvalidTransition(t *testing.T) {
	b := newNotStarted(t)
	_, err := b.Score("s", 1, 0, time.Unix(2, 0))
	if !errors.Is(err, domain.ErrInvalidTransition) {
		t.Fatalf("Score() error = %v, want ErrInvalidTransition", err)
	}
}

func TestScore_FromFinished_ErrInvalidTransition(t *testing.T) {
	b := newFinished(t)
	_, err := b.Score("s", 1, 0, time.Unix(2, 0))
	if !errors.Is(err, domain.ErrInvalidTransition) {
		t.Fatalf("Score() error = %v, want ErrInvalidTransition", err)
	}
}

// AC-4/FR-2a: negative scores are rejected.
func TestScore_NegativeScoreA_ErrInvalidInput(t *testing.T) {
	b := newInProgress(t)
	_, err := b.Score("s", -1, 0, time.Unix(2, 0))
	if !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("Score() error = %v, want ErrInvalidInput", err)
	}
}

func TestScore_NegativeScoreB_ErrInvalidInput(t *testing.T) {
	b := newInProgress(t)
	_, err := b.Score("s", 0, -1, time.Unix(2, 0))
	if !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("Score() error = %v, want ErrInvalidInput", err)
	}
}

func TestFinish_FromInProgress_OK(t *testing.T) {
	b := newInProgress(t)
	_, err := b.Finish("s", time.Unix(3, 0))
	if err != nil {
		t.Fatalf("Finish: %v", err)
	}
}

func TestFinish_FromNotStarted_ErrInvalidTransition(t *testing.T) {
	b := newNotStarted(t)
	_, err := b.Finish("s", time.Unix(3, 0))
	if !errors.Is(err, domain.ErrInvalidTransition) {
		t.Fatalf("Finish() error = %v, want ErrInvalidTransition", err)
	}
}

func TestFinish_FromFinished_ErrInvalidTransition(t *testing.T) {
	b := newFinished(t)
	_, err := b.Finish("s", time.Unix(3, 0))
	if !errors.Is(err, domain.ErrInvalidTransition) {
		t.Fatalf("Finish() error = %v, want ErrInvalidTransition", err)
	}
}

func TestReopen_FromFinished_OK(t *testing.T) {
	b := newFinished(t)
	_, err := b.Reopen("s", time.Unix(4, 0))
	if err != nil {
		t.Fatalf("Reopen: %v", err)
	}
}

func TestReopen_FromNotStarted_ErrInvalidTransition(t *testing.T) {
	b := newNotStarted(t)
	_, err := b.Reopen("s", time.Unix(4, 0))
	if !errors.Is(err, domain.ErrInvalidTransition) {
		t.Fatalf("Reopen() error = %v, want ErrInvalidTransition", err)
	}
}

func TestReopen_FromInProgress_ErrInvalidTransition(t *testing.T) {
	b := newInProgress(t)
	_, err := b.Reopen("s", time.Unix(4, 0))
	if !errors.Is(err, domain.ErrInvalidTransition) {
		t.Fatalf("Reopen() error = %v, want ErrInvalidTransition", err)
	}
}

func TestReset_FromInProgress_OK(t *testing.T) {
	b := newInProgress(t)
	_, err := b.Reset("s", time.Unix(3, 0))
	if err != nil {
		t.Fatalf("Reset: %v", err)
	}
}

func TestReset_FromNotStarted_ErrInvalidTransition(t *testing.T) {
	b := newNotStarted(t)
	_, err := b.Reset("s", time.Unix(3, 0))
	if !errors.Is(err, domain.ErrInvalidTransition) {
		t.Fatalf("Reset() error = %v, want ErrInvalidTransition", err)
	}
}

func TestReset_FromFinished_ErrInvalidTransition(t *testing.T) {
	b := newFinished(t)
	_, err := b.Reset("s", time.Unix(3, 0))
	if !errors.Is(err, domain.ErrInvalidTransition) {
		t.Fatalf("Reset() error = %v, want ErrInvalidTransition", err)
	}
}
