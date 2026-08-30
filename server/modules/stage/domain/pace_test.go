package domain

import (
	"testing"
	"time"
)

func mustParse(t *testing.T, s string) time.Time {
	t.Helper()
	tm, err := time.Parse(time.RFC3339, s)
	if err != nil {
		t.Fatalf("parse %q: %v", s, err)
	}
	return tm
}

func TestIntervalsFromStarts(t *testing.T) {
	base := mustParse(t, "2026-08-29T10:00:00Z")

	t.Run("empty slice returns nil", func(t *testing.T) {
		if got := IntervalsFromStarts(nil); got != nil {
			t.Errorf("got %v, want nil", got)
		}
	})

	t.Run("single element returns nil", func(t *testing.T) {
		if got := IntervalsFromStarts([]time.Time{base}); got != nil {
			t.Errorf("got %v, want nil", got)
		}
	})

	t.Run("several elements return sequential intervals", func(t *testing.T) {
		starts := []time.Time{
			base,
			base.Add(3 * time.Minute),
			base.Add(3*time.Minute + 30*time.Second),
			base.Add(10 * time.Minute),
		}
		got := IntervalsFromStarts(starts)
		want := []time.Duration{
			3 * time.Minute,
			30 * time.Second,
			6*time.Minute + 30*time.Second,
		}
		if len(got) != len(want) {
			t.Fatalf("len(got) = %d, want %d", len(got), len(want))
		}
		for i := range want {
			if got[i] != want[i] {
				t.Errorf("interval[%d] = %v, want %v", i, got[i], want[i])
			}
		}
	})
}

func TestMedian_ViaComputePace(t *testing.T) {
	// median() сама не экспортирована — прогоняем сценарии через
	// ComputePace(poolSamples, ...), у которого первый шаг каскада —
	// median(poolSamples, PaceWindow).

	t.Run("odd window uses middle element", func(t *testing.T) {
		samples := []time.Duration{
			5 * time.Minute,
			1 * time.Minute,
			3 * time.Minute,
			2 * time.Minute,
			4 * time.Minute,
		} // sorted: 1,2,3,4,5 -> median 3
		pace := ComputePace(samples, PaceEstimate{}, time.Minute)
		if pace.Tick != 3*time.Minute {
			t.Errorf("Tick = %v, want %v", pace.Tick, 3*time.Minute)
		}
		if pace.SampleCount != 5 {
			t.Errorf("SampleCount = %d, want 5", pace.SampleCount)
		}
		if pace.Provisional {
			t.Errorf("Provisional = true, want false (pool-level exact fit)")
		}
	})

	t.Run("even window below PaceWindow uses average of two middles", func(t *testing.T) {
		// 4 наблюдения (< PaceWindow=5, не обрезается окном), но >=
		// MinPaceSamples=3 -> считается чётная медиана.
		samples := []time.Duration{
			4 * time.Minute,
			2 * time.Minute,
			1 * time.Minute,
			3 * time.Minute,
		} // sorted: 1,2,3,4 -> median (2+3)/2 = 2.5min
		pace := ComputePace(samples, PaceEstimate{}, time.Minute)
		want := 2*time.Minute + 30*time.Second
		if pace.Tick != want {
			t.Errorf("Tick = %v, want %v", pace.Tick, want)
		}
		if pace.SampleCount != 4 {
			t.Errorf("SampleCount = %d, want 4", pace.SampleCount)
		}
		if pace.Provisional {
			t.Errorf("Provisional = true, want false")
		}
	})

	t.Run("window longer than history takes only the latest PaceWindow", func(t *testing.T) {
		// 7 наблюдений, хронологически по возрастанию. Последние 5:
		// 10,1,2,3,4 -> sorted: 1,2,3,4,10 -> median 3.
		samples := []time.Duration{
			100 * time.Minute,
			200 * time.Minute,
			10 * time.Minute,
			1 * time.Minute,
			2 * time.Minute,
			3 * time.Minute,
			4 * time.Minute,
		}
		pace := ComputePace(samples, PaceEstimate{}, time.Minute)
		if pace.Tick != 3*time.Minute {
			t.Errorf("Tick = %v, want %v", pace.Tick, 3*time.Minute)
		}
		if pace.SampleCount != PaceWindow {
			t.Errorf("SampleCount = %d, want %d", pace.SampleCount, PaceWindow)
		}
	})

	t.Run("exactly MinPaceSamples is not provisional at pool level", func(t *testing.T) {
		samples := []time.Duration{
			2 * time.Minute,
			1 * time.Minute,
			3 * time.Minute,
		}
		pace := ComputePace(samples, PaceEstimate{}, time.Minute)
		if pace.SampleCount != MinPaceSamples {
			t.Fatalf("SampleCount = %d, want %d", pace.SampleCount, MinPaceSamples)
		}
		if pace.Provisional {
			t.Errorf("Provisional = true, want false")
		}
		if pace.Tick != 2*time.Minute {
			t.Errorf("Tick = %v, want %v", pace.Tick, 2*time.Minute)
		}
	})

	t.Run("below MinPaceSamples falls back", func(t *testing.T) {
		samples := []time.Duration{
			2 * time.Minute,
			1 * time.Minute,
		}
		fallback := PaceEstimate{Tick: 90 * time.Second, SampleCount: MinPaceSamples, Provisional: true}
		pace := ComputePace(samples, fallback, time.Minute)
		if pace.Tick != 90*time.Second {
			t.Errorf("Tick = %v, want %v", pace.Tick, 90*time.Second)
		}
		if !pace.Provisional {
			t.Errorf("Provisional = false, want true")
		}
	})
}

func TestMedian_RobustToOutlier(t *testing.T) {
	// 5 нормальных интервалов ~2 минуты, один заменён на огромный выброс.
	// Медиана почти не сдвигается (в отличие от среднего, который бы улетел).
	samples := []time.Duration{
		2 * time.Minute,
		2*time.Minute + 5*time.Second,
		1*time.Minute + 55*time.Second,
		2*time.Minute + 2*time.Second,
		200 * time.Minute, // выброс
	}
	pace := ComputePace(samples, PaceEstimate{}, time.Minute)
	// sorted: 1:55, 2:00, 2:02, 2:05, 200:00 -> median = 2:02
	want := 2*time.Minute + 2*time.Second
	if pace.Tick != want {
		t.Errorf("Tick = %v, want %v (median should resist the outlier)", pace.Tick, want)
	}
	// Убедимся, что среднее было бы совсем другим порядком величины —
	// подтверждает, что тест действительно проверяет устойчивость.
	var sum time.Duration
	for _, s := range samples {
		sum += s
	}
	mean := sum / time.Duration(len(samples))
	if mean-pace.Tick < 30*time.Minute {
		t.Fatalf("test setup issue: mean (%v) not far enough from median (%v)", mean, pace.Tick)
	}
}

func TestComputePace_Cascade(t *testing.T) {
	t.Run("pool samples sufficient -> not provisional", func(t *testing.T) {
		samples := []time.Duration{time.Minute, 2 * time.Minute, 3 * time.Minute}
		pace := ComputePace(samples, PaceEstimate{}, 4*time.Minute)
		if pace.Provisional {
			t.Errorf("Provisional = true, want false")
		}
		if pace.SampleCount != 3 {
			t.Errorf("SampleCount = %d, want 3", pace.SampleCount)
		}
	})

	t.Run("pool samples insufficient, tournament fallback sufficient -> provisional tournament", func(t *testing.T) {
		fallback := PaceEstimate{Tick: 5 * time.Minute, SampleCount: 10, Provisional: true}
		pace := ComputePace(nil, fallback, time.Minute)
		if !pace.Provisional {
			t.Errorf("Provisional = false, want true")
		}
		if pace.Tick != 5*time.Minute {
			t.Errorf("Tick = %v, want %v", pace.Tick, 5*time.Minute)
		}
		if pace.SampleCount != 10 {
			t.Errorf("SampleCount = %d, want 10", pace.SampleCount)
		}
	})

	t.Run("pool and tournament both insufficient -> arena default fallback", func(t *testing.T) {
		fallback := PaceEstimate{Tick: 5 * time.Minute, SampleCount: 1, Provisional: true}
		arenaDefault := 3 * time.Minute
		pace := ComputePace(nil, fallback, arenaDefault)
		if !pace.Provisional {
			t.Errorf("Provisional = false, want true")
		}
		if pace.SampleCount != 0 {
			t.Errorf("SampleCount = %d, want 0", pace.SampleCount)
		}
		want := arenaDefault + InterBoutPause
		if pace.Tick != want {
			t.Errorf("Tick = %v, want %v", pace.Tick, want)
		}
	})

	t.Run("no tournament fallback at all -> arena default", func(t *testing.T) {
		arenaDefault := 90 * time.Second
		pace := ComputePace(nil, PaceEstimate{}, arenaDefault)
		if !pace.Provisional {
			t.Errorf("Provisional = false, want true")
		}
		if pace.SampleCount != 0 {
			t.Errorf("SampleCount = %d, want 0", pace.SampleCount)
		}
		if pace.Tick != arenaDefault+InterBoutPause {
			t.Errorf("Tick = %v, want %v", pace.Tick, arenaDefault+InterBoutPause)
		}
	})
}

func TestTournamentPace(t *testing.T) {
	t.Run("insufficient samples -> zero estimate", func(t *testing.T) {
		got := TournamentPace([]time.Duration{time.Minute, 2 * time.Minute})
		want := PaceEstimate{}
		if got != want {
			t.Errorf("got %+v, want %+v", got, want)
		}
	})

	t.Run("sufficient samples -> always provisional", func(t *testing.T) {
		samples := make([]time.Duration, 0, TournamentWindow*2)
		for i := 0; i < TournamentWindow*2; i++ {
			samples = append(samples, time.Duration(i+1)*time.Minute)
		}
		got := TournamentPace(samples)
		if !got.Provisional {
			t.Errorf("Provisional = false, want true even with abundant samples")
		}
		if got.SampleCount != TournamentWindow {
			t.Errorf("SampleCount = %d, want %d", got.SampleCount, TournamentWindow)
		}
	})
}
