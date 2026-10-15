package domain

import (
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestEnqueueOrder_AppendsToEnd(t *testing.T) {
	got := EnqueueOrder([]string{"b", "v"}, "g")
	if want := []string{"b", "v", "g"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestEnqueueOrder_EmptyQueue(t *testing.T) {
	got := EnqueueOrder(nil, "b")
	if want := []string{"b"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestEnqueueOrder_AlreadyPresentMovesToEnd(t *testing.T) {
	got := EnqueueOrder([]string{"b", "v", "g"}, "b")
	if want := []string{"v", "g", "b"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestEnqueueOrder_DoesNotMutateInput(t *testing.T) {
	in := []string{"b", "v"}
	_ = EnqueueOrder(in, "g")
	if !reflect.DeepEqual(in, []string{"b", "v"}) {
		t.Fatalf("input mutated: %v", in)
	}
}

func TestRemoveFromOrder(t *testing.T) {
	got := RemoveFromOrder([]string{"b", "v", "g"}, "v")
	if want := []string{"b", "g"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	if got := RemoveFromOrder([]string{"b"}, "x"); !reflect.DeepEqual(got, []string{"b"}) {
		t.Fatalf("absent id must be a no-op, got %v", got)
	}
}

func TestValidateReorder(t *testing.T) {
	cases := []struct {
		name    string
		cur     []string
		next    []string
		wantErr error
	}{
		{"same set new order", []string{"b", "v", "g"}, []string{"g", "b", "v"}, nil},
		{"empty both", nil, nil, nil},
		{"missing id", []string{"b", "v"}, []string{"b"}, ErrQueueMismatch},
		{"extra id", []string{"b"}, []string{"b", "v"}, ErrQueueMismatch},
		{"foreign id", []string{"b", "v"}, []string{"b", "x"}, ErrQueueMismatch},
		{"duplicate", []string{"b", "v"}, []string{"b", "b"}, ErrQueueMismatch},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := ValidateReorder(c.cur, c.next)
			if !errors.Is(err, c.wantErr) {
				t.Fatalf("err = %v, want %v", err, c.wantErr)
			}
		})
	}
}

func TestPoolQueuedError_NamesArena(t *testing.T) {
	err := &PoolQueuedError{ArenaID: "a1", ArenaName: "Арена 1"}
	if !errors.Is(err, ErrPoolQueued) {
		t.Fatal("PoolQueuedError must wrap ErrPoolQueued")
	}
	if !strings.Contains(err.Error(), "Арена 1") {
		t.Fatalf("message must name the arena, got %q", err.Error())
	}
}

func queueBouts(prefix string, n int) []BoutRef {
	out := make([]BoutRef, n)
	for i := range out {
		out[i] = BoutRef{ID: prefix + string(rune('0'+i)), SequenceNumber: i + 1, State: BoutStateNotStarted}
	}
	return out
}

// AC-10: пул доигрывает в 11:00, в очереди Б (6 боёв), темп 4 минуты →
// первый бой 11:05 (пауза смены), шестой 11:25; оценка предварительная.
func TestForecastQueue_AC10(t *testing.T) {
	now := mustParse(t, "2026-10-15T10:00:00Z")
	start := mustParse(t, "2026-10-15T11:00:00Z")
	pace := PaceEstimate{Tick: 4 * time.Minute, SampleCount: 5}

	got, end := ForecastQueue([][]BoutRef{queueBouts("b", 6)}, pace, now, start)

	first := got["b0"]
	if want := mustParse(t, "2026-10-15T11:05:00Z"); !first.ExpectedStartAt.Equal(want) {
		t.Fatalf("first = %v, want %v", first.ExpectedStartAt, want)
	}
	sixth := got["b5"]
	if want := mustParse(t, "2026-10-15T11:25:00Z"); !sixth.ExpectedStartAt.Equal(want) {
		t.Fatalf("sixth = %v, want %v", sixth.ExpectedStartAt, want)
	}
	if !first.Provisional || !sixth.Provisional {
		t.Fatal("queue forecast must always be provisional (FR-22)")
	}
	if sixth.BoutsAhead != 5 {
		t.Fatalf("BoutsAhead = %d, want 5", sixth.BoutsAhead)
	}
	if want := mustParse(t, "2026-10-15T11:29:00Z"); !end.Equal(want) {
		t.Fatalf("end = %v, want %v", end, want)
	}
}

// AC-11: свободная арена, сейчас 10:00 → первый бой очереди 10:05.
func TestForecastQueue_FreeArena_AC11(t *testing.T) {
	now := mustParse(t, "2026-10-15T10:00:00Z")
	pace := PaceEstimate{Tick: 4 * time.Minute}
	got, _ := ForecastQueue([][]BoutRef{queueBouts("b", 1)}, pace, now, now)
	if want := mustParse(t, "2026-10-15T10:05:00Z"); !got["b0"].ExpectedStartAt.Equal(want) {
		t.Fatalf("first = %v, want %v", got["b0"].ExpectedStartAt, want)
	}
}

func TestForecastQueue_SecondPoolAddsChangeoverPause(t *testing.T) {
	now := mustParse(t, "2026-10-15T10:00:00Z")
	pace := PaceEstimate{Tick: 4 * time.Minute}
	got, end := ForecastQueue([][]BoutRef{queueBouts("b", 2), queueBouts("v", 1)}, pace, now, now)

	// Б: 10:05, 10:09; Б доигрывает 10:13; В: 10:13 + 5 = 10:18.
	if want := mustParse(t, "2026-10-15T10:18:00Z"); !got["v0"].ExpectedStartAt.Equal(want) {
		t.Fatalf("second pool start = %v, want %v", got["v0"].ExpectedStartAt, want)
	}
	if want := mustParse(t, "2026-10-15T10:22:00Z"); !end.Equal(want) {
		t.Fatalf("end = %v, want %v", end, want)
	}
}

func TestForecastQueue_SkipsStartedBoutsAndEmptyQueue(t *testing.T) {
	now := mustParse(t, "2026-10-15T10:00:00Z")
	pace := PaceEstimate{Tick: time.Minute}
	if got, end := ForecastQueue(nil, pace, now, now); len(got) != 0 || !end.Equal(now) {
		t.Fatalf("empty queue: got %v end %v", got, end)
	}
	bouts := queueBouts("b", 2)
	bouts[0].State = BoutStateFinished
	got, _ := ForecastQueue([][]BoutRef{bouts}, pace, now, now)
	if _, ok := got["b0"]; ok {
		t.Fatal("finished bout must not get a forecast")
	}
	if _, ok := got["b1"]; !ok {
		t.Fatal("not-started bout must get a forecast")
	}
}
