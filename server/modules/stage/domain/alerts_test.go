package domain

import (
	"testing"
	"time"
)

func hasAlert(alerts []ConsoleAlert, kind ConsoleAlertKind) (ConsoleAlert, bool) {
	for _, a := range alerts {
		if a.Kind == kind {
			return a, true
		}
	}
	return ConsoleAlert{}, false
}

func TestDetectAlerts_ArenaIdle(t *testing.T) {
	now := mustParse(t, "2026-08-29T12:00:00Z")

	t.Run("threshold not reached -> no alert", func(t *testing.T) {
		freeSince := now.Add(-2 * time.Minute)
		arenas := []ConsoleAlertArenaInput{
			{ArenaID: "a1", ArenaName: "Ристалище 1", Occupied: false, FreeSince: &freeSince},
		}
		got := DetectAlerts(arenas, nil, ConsoleAlertQueueInput{HasReadyPools: true}, now)
		if _, ok := hasAlert(got, ConsoleAlertArenaIdle); ok {
			t.Errorf("unexpected ARENA_IDLE alert before threshold")
		}
	})

	t.Run("threshold crossed -> alert present", func(t *testing.T) {
		freeSince := now.Add(-ArenaIdleAlertThreshold - time.Second)
		arenas := []ConsoleAlertArenaInput{
			{ArenaID: "a1", ArenaName: "Ристалище 1", Occupied: false, FreeSince: &freeSince},
		}
		got := DetectAlerts(arenas, nil, ConsoleAlertQueueInput{HasReadyPools: true}, now)
		a, ok := hasAlert(got, ConsoleAlertArenaIdle)
		if !ok {
			t.Fatalf("expected ARENA_IDLE alert")
		}
		if a.Since != freeSince {
			t.Errorf("Since = %v, want %v", a.Since, freeSince)
		}
		if a.ArenaID != "a1" || a.ArenaName != "Ристалище 1" {
			t.Errorf("ArenaID/ArenaName not populated correctly: %+v", a)
		}
	})

	t.Run("condition lifted: occupied -> no alert", func(t *testing.T) {
		freeSince := now.Add(-ArenaIdleAlertThreshold - time.Hour)
		arenas := []ConsoleAlertArenaInput{
			{ArenaID: "a1", ArenaName: "Ристалище 1", Occupied: true, FreeSince: &freeSince},
		}
		got := DetectAlerts(arenas, nil, ConsoleAlertQueueInput{HasReadyPools: true}, now)
		if _, ok := hasAlert(got, ConsoleAlertArenaIdle); ok {
			t.Errorf("unexpected ARENA_IDLE alert while occupied")
		}
	})

	t.Run("no ready pools -> no alert even past threshold", func(t *testing.T) {
		freeSince := now.Add(-ArenaIdleAlertThreshold - time.Hour)
		arenas := []ConsoleAlertArenaInput{
			{ArenaID: "a1", ArenaName: "Ристалище 1", Occupied: false, FreeSince: &freeSince},
		}
		got := DetectAlerts(arenas, nil, ConsoleAlertQueueInput{HasReadyPools: false}, now)
		if _, ok := hasAlert(got, ConsoleAlertArenaIdle); ok {
			t.Errorf("unexpected ARENA_IDLE alert when no ready pools")
		}
	})

	t.Run("never freed (FreeSince nil) -> no alert", func(t *testing.T) {
		arenas := []ConsoleAlertArenaInput{
			{ArenaID: "a1", ArenaName: "Ристалище 1", Occupied: false, FreeSince: nil},
		}
		got := DetectAlerts(arenas, nil, ConsoleAlertQueueInput{HasReadyPools: true}, now)
		if _, ok := hasAlert(got, ConsoleAlertArenaIdle); ok {
			t.Errorf("unexpected ARENA_IDLE alert when arena never freed")
		}
	})
}

func TestDetectAlerts_BoutStuck(t *testing.T) {
	now := mustParse(t, "2026-08-29T12:00:00Z")

	t.Run("threshold not reached -> no alert", func(t *testing.T) {
		arenas := []ConsoleAlertArenaInput{
			{ArenaID: "a1", ArenaName: "A1", Occupied: true, BoutInProgress: true,
				BoutInProgressSince: now.Add(-5 * time.Minute), BoutID: "b1"},
		}
		got := DetectAlerts(arenas, nil, ConsoleAlertQueueInput{}, now)
		if _, ok := hasAlert(got, ConsoleAlertBoutStuck); ok {
			t.Errorf("unexpected BOUT_STUCK alert before threshold")
		}
	})

	t.Run("threshold crossed -> alert present", func(t *testing.T) {
		since := now.Add(-BoutStuckAlertThreshold - time.Second)
		arenas := []ConsoleAlertArenaInput{
			{ArenaID: "a1", ArenaName: "A1", Occupied: true, BoutInProgress: true,
				BoutInProgressSince: since, BoutID: "b1", PoolID: "p1", PoolName: "Pool 1"},
		}
		got := DetectAlerts(arenas, nil, ConsoleAlertQueueInput{}, now)
		a, ok := hasAlert(got, ConsoleAlertBoutStuck)
		if !ok {
			t.Fatalf("expected BOUT_STUCK alert")
		}
		if a.Since != since || a.BoutID != "b1" || a.PoolID != "p1" || a.PoolName != "Pool 1" {
			t.Errorf("unexpected alert content: %+v", a)
		}
	})

	t.Run("condition lifted: bout not in progress -> no alert", func(t *testing.T) {
		since := now.Add(-BoutStuckAlertThreshold - time.Hour)
		arenas := []ConsoleAlertArenaInput{
			{ArenaID: "a1", ArenaName: "A1", Occupied: true, BoutInProgress: false,
				BoutInProgressSince: since, BoutID: "b1"},
		}
		got := DetectAlerts(arenas, nil, ConsoleAlertQueueInput{}, now)
		if _, ok := hasAlert(got, ConsoleAlertBoutStuck); ok {
			t.Errorf("unexpected BOUT_STUCK alert when bout not in progress")
		}
	})
}

func TestDetectAlerts_PoolNotStarted(t *testing.T) {
	now := mustParse(t, "2026-08-29T12:00:00Z")

	t.Run("threshold not reached -> no alert", func(t *testing.T) {
		arenas := []ConsoleAlertArenaInput{
			{ArenaID: "a1", ArenaName: "A1", Occupied: true, PoolID: "p1", PoolName: "Pool 1",
				PoolAnyBoutStarted: false, PoolSeatedSince: now.Add(-5 * time.Minute)},
		}
		got := DetectAlerts(arenas, nil, ConsoleAlertQueueInput{}, now)
		if _, ok := hasAlert(got, ConsoleAlertPoolNotStarted); ok {
			t.Errorf("unexpected POOL_NOT_STARTED alert before threshold")
		}
	})

	t.Run("threshold crossed -> alert present", func(t *testing.T) {
		since := now.Add(-PoolNotStartedAlertThreshold - time.Second)
		arenas := []ConsoleAlertArenaInput{
			{ArenaID: "a1", ArenaName: "A1", Occupied: true, PoolID: "p1", PoolName: "Pool 1",
				PoolAnyBoutStarted: false, PoolSeatedSince: since},
		}
		got := DetectAlerts(arenas, nil, ConsoleAlertQueueInput{}, now)
		a, ok := hasAlert(got, ConsoleAlertPoolNotStarted)
		if !ok {
			t.Fatalf("expected POOL_NOT_STARTED alert")
		}
		if a.Since != since || a.PoolID != "p1" {
			t.Errorf("unexpected alert content: %+v", a)
		}
	})

	t.Run("condition lifted: a bout has started -> no alert", func(t *testing.T) {
		since := now.Add(-PoolNotStartedAlertThreshold - time.Hour)
		arenas := []ConsoleAlertArenaInput{
			{ArenaID: "a1", ArenaName: "A1", Occupied: true, PoolID: "p1", PoolName: "Pool 1",
				PoolAnyBoutStarted: true, PoolSeatedSince: since},
		}
		got := DetectAlerts(arenas, nil, ConsoleAlertQueueInput{}, now)
		if _, ok := hasAlert(got, ConsoleAlertPoolNotStarted); ok {
			t.Errorf("unexpected POOL_NOT_STARTED alert when a bout has started")
		}
	})
}

func TestDetectAlerts_PoolDoneNotUnseated(t *testing.T) {
	now := mustParse(t, "2026-08-29T12:00:00Z")

	t.Run("threshold not reached -> no alert", func(t *testing.T) {
		arenas := []ConsoleAlertArenaInput{
			{ArenaID: "a1", ArenaName: "A1", Occupied: true, PoolID: "p1", PoolName: "Pool 1",
				PoolAllBoutsFinished: true, PoolLastFinishedAt: now.Add(-1 * time.Minute)},
		}
		got := DetectAlerts(arenas, nil, ConsoleAlertQueueInput{}, now)
		if _, ok := hasAlert(got, ConsoleAlertPoolDoneNotUnseated); ok {
			t.Errorf("unexpected POOL_DONE_NOT_UNSEATED alert before threshold")
		}
	})

	t.Run("threshold crossed -> alert present", func(t *testing.T) {
		since := now.Add(-PoolDoneNotUnseatedAlertThreshold - time.Second)
		arenas := []ConsoleAlertArenaInput{
			{ArenaID: "a1", ArenaName: "A1", Occupied: true, PoolID: "p1", PoolName: "Pool 1",
				PoolAllBoutsFinished: true, PoolLastFinishedAt: since},
		}
		got := DetectAlerts(arenas, nil, ConsoleAlertQueueInput{}, now)
		a, ok := hasAlert(got, ConsoleAlertPoolDoneNotUnseated)
		if !ok {
			t.Fatalf("expected POOL_DONE_NOT_UNSEATED alert")
		}
		if a.Since != since || a.PoolID != "p1" {
			t.Errorf("unexpected alert content: %+v", a)
		}
	})

	t.Run("condition lifted: not all bouts finished -> no alert", func(t *testing.T) {
		since := now.Add(-PoolDoneNotUnseatedAlertThreshold - time.Hour)
		arenas := []ConsoleAlertArenaInput{
			{ArenaID: "a1", ArenaName: "A1", Occupied: true, PoolID: "p1", PoolName: "Pool 1",
				PoolAllBoutsFinished: false, PoolLastFinishedAt: since},
		}
		got := DetectAlerts(arenas, nil, ConsoleAlertQueueInput{}, now)
		if _, ok := hasAlert(got, ConsoleAlertPoolDoneNotUnseated); ok {
			t.Errorf("unexpected POOL_DONE_NOT_UNSEATED alert when not all bouts finished")
		}
	})
}

func TestDetectAlerts_NextStageNotBuilt(t *testing.T) {
	now := mustParse(t, "2026-08-29T12:00:00Z")

	t.Run("false -> no alert", func(t *testing.T) {
		noms := []ConsoleAlertNominationInput{
			{NominationID: "n1", NominationName: "Nom 1", NextStageNotBuilt: false},
		}
		got := DetectAlerts(nil, noms, ConsoleAlertQueueInput{}, now)
		if _, ok := hasAlert(got, ConsoleAlertNextStageNotBuilt); ok {
			t.Errorf("unexpected NEXT_STAGE_NOT_BUILT alert when false")
		}
	})

	t.Run("true -> alert fires immediately (no threshold)", func(t *testing.T) {
		noms := []ConsoleAlertNominationInput{
			{NominationID: "n1", NominationName: "Nom 1", NextStageNotBuilt: true},
		}
		got := DetectAlerts(nil, noms, ConsoleAlertQueueInput{}, now)
		a, ok := hasAlert(got, ConsoleAlertNextStageNotBuilt)
		if !ok {
			t.Fatalf("expected NEXT_STAGE_NOT_BUILT alert")
		}
		if a.Since != now {
			t.Errorf("Since = %v, want now (%v)", a.Since, now)
		}
		if a.NominationID != "n1" || a.NominationName != "Nom 1" {
			t.Errorf("unexpected alert content: %+v", a)
		}
	})

	t.Run("condition lifted: reverted to false -> no alert", func(t *testing.T) {
		noms := []ConsoleAlertNominationInput{
			{NominationID: "n1", NominationName: "Nom 1", NextStageNotBuilt: false},
		}
		got := DetectAlerts(nil, noms, ConsoleAlertQueueInput{}, now)
		if _, ok := hasAlert(got, ConsoleAlertNextStageNotBuilt); ok {
			t.Errorf("unexpected NEXT_STAGE_NOT_BUILT alert after condition lifted")
		}
	})
}

func TestDetectAlerts_NominationStalled(t *testing.T) {
	now := mustParse(t, "2026-08-29T12:00:00Z")

	t.Run("threshold not reached -> no alert", func(t *testing.T) {
		noms := []ConsoleAlertNominationInput{
			{NominationID: "n1", NominationName: "Nom 1", Stalled: true, StalledSince: now.Add(-5 * time.Minute)},
		}
		got := DetectAlerts(nil, noms, ConsoleAlertQueueInput{}, now)
		if _, ok := hasAlert(got, ConsoleAlertNominationStalled); ok {
			t.Errorf("unexpected NOMINATION_STALLED alert before threshold")
		}
	})

	t.Run("threshold crossed -> alert present", func(t *testing.T) {
		since := now.Add(-NominationStalledAlertThreshold - time.Second)
		noms := []ConsoleAlertNominationInput{
			{NominationID: "n1", NominationName: "Nom 1", Stalled: true, StalledSince: since},
		}
		got := DetectAlerts(nil, noms, ConsoleAlertQueueInput{}, now)
		a, ok := hasAlert(got, ConsoleAlertNominationStalled)
		if !ok {
			t.Fatalf("expected NOMINATION_STALLED alert")
		}
		if a.Since != since || a.NominationID != "n1" {
			t.Errorf("unexpected alert content: %+v", a)
		}
	})

	t.Run("condition lifted: not stalled -> no alert", func(t *testing.T) {
		since := now.Add(-NominationStalledAlertThreshold - time.Hour)
		noms := []ConsoleAlertNominationInput{
			{NominationID: "n1", NominationName: "Nom 1", Stalled: false, StalledSince: since},
		}
		got := DetectAlerts(nil, noms, ConsoleAlertQueueInput{}, now)
		if _, ok := hasAlert(got, ConsoleAlertNominationStalled); ok {
			t.Errorf("unexpected NOMINATION_STALLED alert when not stalled")
		}
	})
}

func TestDetectAlerts_MultipleArenasAndNominationsAccumulate(t *testing.T) {
	now := mustParse(t, "2026-08-29T12:00:00Z")
	freeSince := now.Add(-ArenaIdleAlertThreshold - time.Minute)
	stuckSince := now.Add(-BoutStuckAlertThreshold - time.Minute)

	arenas := []ConsoleAlertArenaInput{
		{ArenaID: "a1", ArenaName: "A1", Occupied: false, FreeSince: &freeSince},
		{ArenaID: "a2", ArenaName: "A2", Occupied: true, BoutInProgress: true,
			BoutInProgressSince: stuckSince, BoutID: "b1", PoolAnyBoutStarted: true},
	}
	noms := []ConsoleAlertNominationInput{
		{NominationID: "n1", NominationName: "Nom 1", NextStageNotBuilt: true},
		{NominationID: "n2", NominationName: "Nom 2", Stalled: true,
			StalledSince: now.Add(-NominationStalledAlertThreshold - time.Minute)},
	}

	got := DetectAlerts(arenas, noms, ConsoleAlertQueueInput{HasReadyPools: true}, now)

	wantKinds := []ConsoleAlertKind{
		ConsoleAlertArenaIdle, ConsoleAlertBoutStuck, ConsoleAlertNextStageNotBuilt, ConsoleAlertNominationStalled,
	}
	for _, k := range wantKinds {
		if _, ok := hasAlert(got, k); !ok {
			t.Errorf("expected alert kind %q to be present, got %+v", k, got)
		}
	}
	if len(got) != len(wantKinds) {
		t.Errorf("len(got) = %d, want %d (got: %+v)", len(got), len(wantKinds), got)
	}
}

func TestDetectAlerts_EmptyInputsProduceEmptyResult(t *testing.T) {
	now := mustParse(t, "2026-08-29T12:00:00Z")
	got := DetectAlerts(nil, nil, ConsoleAlertQueueInput{}, now)
	if len(got) != 0 {
		t.Errorf("len(got) = %d, want 0", len(got))
	}
}
