package domain

import (
	"testing"
	"time"
)

func TestForecastPool_AnchoredOnInProgressBout(t *testing.T) {
	now := mustParse(t, "2026-08-29T12:00:00Z")
	started := mustParse(t, "2026-08-29T11:58:00Z")
	pace := PaceEstimate{Tick: 3 * time.Minute, SampleCount: 5, Provisional: false}

	bouts := []BoutRef{
		{ID: "b1", SequenceNumber: 1, State: BoutStateInProgress},
		{ID: "b2", SequenceNumber: 2, State: BoutStateNotStarted},
		{ID: "b3", SequenceNumber: 3, State: BoutStateNotStarted},
		{ID: "b4", SequenceNumber: 4, State: BoutStateNotStarted},
	}

	got := ForecastPool(bouts, pace, now, started)

	f2, ok := got["b2"]
	if !ok {
		t.Fatalf("b2 missing from forecast")
	}
	if want := started.Add(pace.Tick * 1); f2.ExpectedStartAt != want {
		t.Errorf("b2 ExpectedStartAt = %v, want %v", f2.ExpectedStartAt, want)
	}
	if f2.BoutsAhead != 0 {
		t.Errorf("b2 BoutsAhead = %d, want 0", f2.BoutsAhead)
	}

	f3, ok := got["b3"]
	if !ok {
		t.Fatalf("b3 missing from forecast")
	}
	if want := started.Add(pace.Tick * 2); f3.ExpectedStartAt != want {
		t.Errorf("b3 ExpectedStartAt = %v, want %v", f3.ExpectedStartAt, want)
	}
	if f3.BoutsAhead != 1 {
		t.Errorf("b3 BoutsAhead = %d, want 1", f3.BoutsAhead)
	}

	f4, ok := got["b4"]
	if !ok {
		t.Fatalf("b4 missing from forecast")
	}
	if want := started.Add(pace.Tick * 3); f4.ExpectedStartAt != want {
		t.Errorf("b4 ExpectedStartAt = %v, want %v", f4.ExpectedStartAt, want)
	}
	if f4.BoutsAhead != 2 {
		t.Errorf("b4 BoutsAhead = %d, want 2", f4.BoutsAhead)
	}
}

func TestForecastPool_AnchoredOnNowWhenNothingInProgress(t *testing.T) {
	now := mustParse(t, "2026-08-29T12:00:00Z")
	pace := PaceEstimate{Tick: 3 * time.Minute, SampleCount: 5, Provisional: false}

	bouts := []BoutRef{
		{ID: "b1", SequenceNumber: 1, State: BoutStateNotStarted},
		{ID: "b2", SequenceNumber: 2, State: BoutStateNotStarted},
	}

	got := ForecastPool(bouts, pace, now, time.Time{})

	f1, ok := got["b1"]
	if !ok {
		t.Fatalf("b1 missing from forecast")
	}
	if f1.BoutsAhead != 0 {
		t.Errorf("b1 BoutsAhead = %d, want 0", f1.BoutsAhead)
	}
	if !f1.ExpectedStartAt.Equal(now) {
		t.Errorf("b1 ExpectedStartAt = %v, want %v", f1.ExpectedStartAt, now)
	}
	if !f1.Imminent {
		t.Errorf("b1 Imminent = false, want true (expected == now)")
	}

	f2, ok := got["b2"]
	if !ok {
		t.Fatalf("b2 missing from forecast")
	}
	if want := now.Add(pace.Tick); f2.ExpectedStartAt != want {
		t.Errorf("b2 ExpectedStartAt = %v, want %v", f2.ExpectedStartAt, want)
	}
}

func TestForecastPool_CirculationDoesNotAffectExtraTicks(t *testing.T) {
	// Идущий бой (SequenceNumber=5) стоит ПОСЛЕ не начатых боёв с
	// меньшими номерами в списке bouts — циркуляция (спека 0013 FR-8).
	// extraTicks=1 должен применяться ко всем прогнозам одинаково, а не
	// зависеть от сравнения номеров.
	now := mustParse(t, "2026-08-29T12:00:00Z")
	started := mustParse(t, "2026-08-29T11:55:00Z")
	pace := PaceEstimate{Tick: 2 * time.Minute, SampleCount: 5, Provisional: false}

	bouts := []BoutRef{
		{ID: "b1", SequenceNumber: 1, State: BoutStateNotStarted},
		{ID: "b2", SequenceNumber: 2, State: BoutStateNotStarted},
		{ID: "b5", SequenceNumber: 5, State: BoutStateInProgress},
		{ID: "b3", SequenceNumber: 3, State: BoutStateFinished},
	}

	got := ForecastPool(bouts, pace, now, started)

	f1, ok := got["b1"]
	if !ok {
		t.Fatalf("b1 missing from forecast")
	}
	if want := started.Add(pace.Tick * 1); f1.ExpectedStartAt != want {
		t.Errorf("b1 ExpectedStartAt = %v, want %v", f1.ExpectedStartAt, want)
	}
	if f1.BoutsAhead != 0 {
		t.Errorf("b1 BoutsAhead = %d, want 0", f1.BoutsAhead)
	}

	f2, ok := got["b2"]
	if !ok {
		t.Fatalf("b2 missing from forecast")
	}
	if want := started.Add(pace.Tick * 2); f2.ExpectedStartAt != want {
		t.Errorf("b2 ExpectedStartAt = %v, want %v", f2.ExpectedStartAt, want)
	}
	if f2.BoutsAhead != 1 {
		t.Errorf("b2 BoutsAhead = %d, want 1", f2.BoutsAhead)
	}

	if len(got) != 2 {
		t.Errorf("len(got) = %d, want 2 (only not-started bouts)", len(got))
	}
}

func TestForecastPool_ImminentWhenExpectedInPast(t *testing.T) {
	now := mustParse(t, "2026-08-29T12:00:00Z")
	// Темп нулевой -> все прогнозы совпадают с anchor (now), что не
	// строго в будущем -> Imminent=true для всех.
	pace := PaceEstimate{Tick: 0, SampleCount: 0, Provisional: true}

	bouts := []BoutRef{
		{ID: "b1", SequenceNumber: 1, State: BoutStateNotStarted},
		{ID: "b2", SequenceNumber: 2, State: BoutStateNotStarted},
	}

	got := ForecastPool(bouts, pace, now, time.Time{})
	for id, f := range got {
		if !f.Imminent {
			t.Errorf("%s Imminent = false, want true", id)
		}
	}

	// Другой случай: pace.Tick положителен, но бой начался достаточно
	// давно (currentStartedAt сильно в прошлом), что расчётное время
	// следующего боя всё равно уже в прошлом относительно now.
	started := now.Add(-10 * time.Minute)
	pace2 := PaceEstimate{Tick: time.Minute, SampleCount: 5, Provisional: false}
	bouts2 := []BoutRef{
		{ID: "b1", SequenceNumber: 1, State: BoutStateInProgress},
		{ID: "b2", SequenceNumber: 2, State: BoutStateNotStarted},
	}
	got2 := ForecastPool(bouts2, pace2, now, started)
	f2 := got2["b2"]
	// expected = started + tick*(0+1) = now-10min+1min = now-9min < now
	if !f2.Imminent {
		t.Errorf("b2 Imminent = false, want true (expected in the past relative to now)")
	}
}

func TestForecastPool_OnlyNotStartedBoutsIncluded(t *testing.T) {
	now := mustParse(t, "2026-08-29T12:00:00Z")
	pace := PaceEstimate{Tick: time.Minute, SampleCount: 5, Provisional: false}
	bouts := []BoutRef{
		{ID: "b1", SequenceNumber: 1, State: BoutStateFinished},
		{ID: "b2", SequenceNumber: 2, State: BoutStateInProgress},
		{ID: "b3", SequenceNumber: 3, State: BoutStateNotStarted},
	}
	got := ForecastPool(bouts, pace, now, now)
	if _, ok := got["b1"]; ok {
		t.Errorf("finished bout b1 must not be in forecast")
	}
	if _, ok := got["b2"]; ok {
		t.Errorf("in-progress bout b2 must not be in forecast")
	}
	if _, ok := got["b3"]; !ok {
		t.Errorf("not-started bout b3 must be in forecast")
	}
	if len(got) != 1 {
		t.Errorf("len(got) = %d, want 1", len(got))
	}
}

func TestForecastPool_ProvisionalCopiedFromPace(t *testing.T) {
	now := mustParse(t, "2026-08-29T12:00:00Z")
	bouts := []BoutRef{{ID: "b1", SequenceNumber: 1, State: BoutStateNotStarted}}

	provisional := PaceEstimate{Tick: time.Minute, SampleCount: 1, Provisional: true}
	got := ForecastPool(bouts, provisional, now, time.Time{})
	if !got["b1"].Provisional {
		t.Errorf("Provisional = false, want true (copied from pace.Provisional)")
	}

	exact := PaceEstimate{Tick: time.Minute, SampleCount: 5, Provisional: false}
	got2 := ForecastPool(bouts, exact, now, time.Time{})
	if got2["b1"].Provisional {
		t.Errorf("Provisional = true, want false (copied from pace.Provisional)")
	}
}
