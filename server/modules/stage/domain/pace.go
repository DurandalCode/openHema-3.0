package domain

import (
	"sort"
	"time"
)

// Спека 0043, ADR 0020: операционная оценка темпа площадки и прогноз
// начала боёв пула, стоящего на ней.

const (
	// PaceWindow — сколько последних наблюдений (интервалов между
	// началами боёв) текущего пула учитывается при оценке его темпа
	// (ADR 0020, п.2).
	PaceWindow = 5
	// TournamentWindow — окно наблюдений для резервного темпа турнира
	// в целом (ADR 0020, п.4). Задел на будущее агрегирование по всем
	// площадкам.
	TournamentWindow = 20
	// MinPaceSamples — минимальное число наблюдений, ниже которого
	// медиана не считается статистически значимой и происходит откат
	// на следующий резерв каскада (ADR 0020, пп.2,4).
	MinPaceSamples = 3
	// InterBoutPause — фиксированная пауза, прибавляемая к дефолтной
	// продолжительности боя площадки в последнем резерве каскада
	// («дефолт площадки», ADR 0020, п.4.2).
	InterBoutPause = 60 * time.Second
)

// PaceEstimate — оценка темпа площадки: сколько времени в среднем занимает
// один бой (от начала одного до начала следующего), на скольких
// наблюдениях основана оценка, и является ли она предварительной
// (посчитана не по факту текущего пула, а по резерву каскада).
type PaceEstimate struct {
	Tick        time.Duration
	SampleCount int
	Provisional bool
}

// IntervalsFromStarts переводит хронологически упорядоченный (по
// возрастанию) срез отметок начала боёв в срез последовательных
// интервалов «начало → начало следующего» (n меток → n-1 интервалов).
// Функция не сортирует starts сама — вызывающий отвечает за порядок.
func IntervalsFromStarts(starts []time.Time) []time.Duration {
	if len(starts) < 2 {
		return nil
	}
	out := make([]time.Duration, 0, len(starts)-1)
	for i := 1; i < len(starts); i++ {
		out = append(out, starts[i].Sub(starts[i-1]))
	}
	return out
}

// median возвращает медиану последних window наблюдений samples (либо
// всех samples, если их не больше window), число фактически
// использованных наблюдений n и признак ok — статистически ли значима
// оценка (n >= MinPaceSamples). Не мутирует входной срез.
func median(samples []time.Duration, window int) (tick time.Duration, n int, ok bool) {
	if len(samples) > window {
		samples = samples[len(samples)-window:]
	}
	n = len(samples)
	if n < MinPaceSamples {
		return 0, n, false
	}

	sorted := make([]time.Duration, n)
	copy(sorted, samples)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })

	if n%2 == 1 {
		tick = sorted[n/2]
	} else {
		tick = (sorted[n/2-1] + sorted[n/2]) / 2
	}
	return tick, n, true
}

// TournamentPace — резервный темп турнира в целом (ADR 0020, п.4.1):
// медиана по окну TournamentWindow. Оценка всегда помечена
// предварительной (Provisional=true), даже когда посчитана по
// достаточному числу наблюдений — предварительность здесь означает «не по
// факту ЭТОГО пула». При недостатке наблюдений возвращает нулевой
// PaceEstimate{} — сигнал ComputePace, что и этого резерва нет.
func TournamentPace(samples []time.Duration) PaceEstimate {
	tick, n, ok := median(samples, TournamentWindow)
	if !ok {
		return PaceEstimate{}
	}
	return PaceEstimate{Tick: tick, SampleCount: n, Provisional: true}
}

// ComputePace считает темп площадки по каскаду резервов (ADR 0020, пп.2,
// 4): темп текущего пула (по факту, единственный не предварительный
// случай) → резерв темпа турнира → дефолт площадки с фиксированной
// паузой.
func ComputePace(poolSamples []time.Duration, tournamentFallback PaceEstimate, arenaDefault time.Duration) PaceEstimate {
	if tick, n, ok := median(poolSamples, PaceWindow); ok {
		return PaceEstimate{Tick: tick, SampleCount: n, Provisional: false}
	}
	if tournamentFallback.SampleCount >= MinPaceSamples {
		return PaceEstimate{
			Tick:        tournamentFallback.Tick,
			SampleCount: tournamentFallback.SampleCount,
			Provisional: true,
		}
	}
	return PaceEstimate{Tick: arenaDefault + InterBoutPause, SampleCount: 0, Provisional: true}
}

// BoutForecast — прогноз для одного не начатого боя пула, стоящего на
// площадке.
type BoutForecast struct {
	ExpectedStartAt time.Time
	BoutsAhead      int
	Provisional     bool
	Imminent        bool
}

// ForecastPool считает прогноз начала для каждого не начатого боя пула
// (bouts должны быть уже отсортированы вызывающим по SequenceNumber).
// extraTicks=1 при идущем сейчас бое применяется одинаково ко ВСЕМ
// прогнозам (а не привязан к сравнению номеров) — это корректно и при
// циркуляции текущего боя (спека 0013 FR-8), когда идущий бой может
// иметь больший SequenceNumber, чем какой-то не начатый бой перед ним.
func ForecastPool(bouts []BoutRef, pace PaceEstimate, now, currentStartedAt time.Time) map[string]BoutForecast {
	inProgress := false
	for _, b := range bouts {
		if b.State == BoutStateInProgress {
			inProgress = true
			break
		}
	}

	var anchor time.Time
	var extraTicks int
	if inProgress && !currentStartedAt.IsZero() {
		anchor = currentStartedAt
		extraTicks = 1
	} else {
		anchor = now
		extraTicks = 0
	}

	out := make(map[string]BoutForecast)
	ahead := 0
	for _, b := range bouts {
		if b.State != BoutStateNotStarted {
			continue
		}
		expected := anchor.Add(pace.Tick * time.Duration(ahead+extraTicks))
		imminent := !expected.After(now)
		out[b.ID] = BoutForecast{
			ExpectedStartAt: expected,
			BoutsAhead:      ahead,
			Provisional:     pace.Provisional,
			Imminent:        imminent,
		}
		ahead++
	}
	return out
}
