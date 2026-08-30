// Спека 0043: сборка операционной оценки (ADR 0020) поверх уже собранных
// контейнеров (tournamentContainer, tournament_live.go) — общая часть
// TournamentLive (0034), GetArenaBoards (0041) и GetTournamentConsole
// (0043). Сама модель (медиана, каскад резервов, прогноз боя) — чистые
// функции domain/pace.go; этот файл только питает их уже прочитанными
// данными и не вводит новой доменной логики.
package service

import (
	"context"
	"sort"
	"time"

	"github.com/hema/server/modules/stage/domain"
)

// containerForecast — прогноз одного контейнера, стоящего на площадке:
// темп, посчитанный по его собственным наблюдениям (каскад резервов, ADR
// 0020 п.2/п.4), прогноз каждого не начатого боя (ключ — id боя) и
// ориентировочное время, когда контейнер доиграет последний бой.
type containerForecast struct {
	pace       domain.PaceEstimate
	byBout     map[string]domain.BoutForecast
	finishAt   time.Time
	finishAtOK bool
}

// nextBoutForecast — прогноз ближайшего не начатого боя контейнера
// (BoutsAhead == 0 среди byBout) — «следующий бой площадки» (спека 0043,
// FR-21), независимо от того, идёт ли сейчас другой бой этого же
// контейнера. nil, если не начатых боёв не осталось.
func (cf containerForecast) nextBoutForecast() *domain.BoutForecast {
	for _, f := range cf.byBout {
		if f.BoutsAhead == 0 {
			out := f
			return &out
		}
	}
	return nil
}

// containerPaceSamples — хронологические интервалы «начало → начало
// следующего» между уже начатыми боями ОДНОГО контейнера (ADR 0020, п.1).
// bouts должны быть отсортированы по SequenceNumber вызывающим — как везде
// в этом пакете (см. sortedBySequence): порядок последовательных начал
// внутри контейнера приближается порядком проведения, а не глобальным
// временем (циркуляция — известное ограничение модели, ADR 0020 п.9).
func containerPaceSamples(bouts []domain.BoutRef, startedAt map[string]time.Time) []time.Duration {
	starts := make([]time.Time, 0, len(bouts))
	for _, b := range bouts {
		if t, ok := startedAt[b.ID]; ok {
			starts = append(starts, t)
		}
	}
	return domain.IntervalsFromStarts(starts)
}

// tournamentPaceSamples собирает интервалы всех контейнеров турнира разом,
// тегированные временем второго боя интервала, и сортирует по этому
// времени — TournamentPace ждёт «последние N наблюдений» в хронологическом
// порядке (ADR 0020, п.4.1), а обход контейнеров по номинациям сам по себе
// эту хронологию не соблюдает (разные площадки/пулы вперемешку).
func tournamentPaceSamples(containers []tournamentContainer, startedAt map[string]time.Time) []time.Duration {
	type tagged struct {
		at       time.Time
		interval time.Duration
	}
	var samples []tagged
	for _, c := range containers {
		starts := make([]time.Time, 0, len(c.bouts))
		for _, b := range c.bouts {
			if t, ok := startedAt[b.ID]; ok {
				starts = append(starts, t)
			}
		}
		intervals := domain.IntervalsFromStarts(starts)
		for i, d := range intervals {
			samples = append(samples, tagged{at: starts[i+1], interval: d})
		}
	}
	sort.Slice(samples, func(i, j int) bool { return samples[i].at.Before(samples[j].at) })
	out := make([]time.Duration, len(samples))
	for i, sm := range samples {
		out[i] = sm.interval
	}
	return out
}

// currentBoutStartedAt возвращает фактический момент начала ИДУЩЕГО боя
// контейнера — times (BoutTimesForPools) несёт последнюю АКТУАЛЬНУЮ
// отметку с учётом restart-маркеров (не первую, в отличие от startedAt/
// StartedAtByBouts, который используется только для наблюдений темпа, см.
// containerPaceSamples). Нулевое значение, если сейчас ничего не идёт.
func currentBoutStartedAt(bouts []domain.BoutRef, times map[string]domain.BoutTimes) time.Time {
	for _, b := range bouts {
		if b.State == domain.BoutStateInProgress {
			if t, ok := times[b.ID]; ok && t.StartedAt != nil {
				return *t.StartedAt
			}
			return time.Time{}
		}
	}
	return time.Time{}
}

// buildContainerForecast считает прогноз одного контейнера, СТОЯЩЕГО на
// площадке. arenaDefault — дефолт таймера этой площадки (последний резерв
// каскада, ADR 0020 п.4.2); tournamentPace — уже посчитанный резерв уровня
// турнира (второй уровень каскада; нулевой — ComputePace тогда падает
// сразу на arenaDefault). finishAt — последняя оценка ForecastPool плюс
// один такт на завершение этого боя; если не начатых боёв не осталось, но
// что-то идёт — currentBoutStartedAt + один такт (оценка завершения
// идущего боя); если не идёт и нечего прогнозировать — finishAtOK=false
// (пул уже доигран целиком — сигнал ленты внимания, не прогноз).
func buildContainerForecast(bouts []domain.BoutRef, samples []time.Duration, tournamentPace domain.PaceEstimate, arenaDefault time.Duration, now time.Time, times map[string]domain.BoutTimes) containerForecast {
	pace := domain.ComputePace(samples, tournamentPace, arenaDefault)
	anchor := currentBoutStartedAt(bouts, times)
	byBout := domain.ForecastPool(bouts, pace, now, anchor)

	cf := containerForecast{pace: pace, byBout: byBout}
	for _, f := range byBout {
		if !cf.finishAtOK || f.ExpectedStartAt.After(cf.finishAt) {
			cf.finishAt = f.ExpectedStartAt
			cf.finishAtOK = true
		}
	}
	switch {
	case cf.finishAtOK:
		cf.finishAt = cf.finishAt.Add(pace.Tick)
	case !anchor.IsZero():
		cf.finishAt = anchor.Add(pace.Tick)
		cf.finishAtOK = true
	}
	return cf
}

// buildForecasts считает прогноз каждого стоящего на площадке контейнера
// турнира разом (ADR 0020): темп турнира — общий резерв для всех
// контейнеров одного вызова (одна медиана на снапшот, не на контейнер),
// дефолт площадки — свой на каждую (ArenaProvider.DefaultDurationSeconds,
// единственный НЕ пакетный вызов здесь — тот же порт, что уже вызывает
// per-arena arena_room.go при инициализации табло, не новый вид
// обращения). Незасеянные контейнеры (ArenaID == "") прогноза не получают
// вовсе — горизонт оценки, FR-9: их не начатые бои остаются с nil
// Forecast везде, где вызывающий их читает. Результат ключуется по
// c.pool.ID контейнера (не по arena.ID) — так его можно использовать и
// для карточки площадки, и для агрегата по номинации без второго индекса.
// tournamentGathered — весь материал, собранный за один проход по турниру:
// контейнеры по номинациям, фактические времена/наблюдения боёв, прогноз
// каждого стоящего на площадке контейнера и резервный темп турнира целиком.
// Общий вход GetArenaBoards и GetTournamentConsole (спека 0043, NFR-2).
// TournamentLive (0034) собирает то же самое инлайн — у него другой набор
// последующих шагов (лента боёв, сайдбар номинаций), заводить здесь общую
// структуру ради одного места использования избыточно.
type tournamentGathered struct {
	groups         []nominationContainers
	containers     []tournamentContainer
	times          map[string]domain.BoutTimes
	forecasts      map[string]containerForecast
	tournamentPace domain.PaceEstimate
	now            time.Time
}

// gatherTournament выполняет единственный проход по турниру: номинации →
// этапы → готовые контейнеры (gatherNominationContainers), фактические
// времена и наблюдения боёв разом на все собранные пулы (BoutTimesForPools/
// StartedAtByBouts — по одному вызову на весь турнир, не на объект), затем
// прогноз (buildForecasts). now фиксируется один раз на весь результат —
// единая точка отсчёта «текущего момента» для всех дальнейших вычислений
// вызывающего (пульт/доска не должны видеть разное now для разных площадок
// одного и того же ответа).
func (s *Service) gatherTournament(ctx context.Context, tournamentID string) (tournamentGathered, error) {
	groups, err := s.gatherNominationContainers(ctx, tournamentID)
	if err != nil {
		return tournamentGathered{}, err
	}
	containers := make([]tournamentContainer, 0)
	for _, g := range groups {
		containers = append(containers, g.containers...)
	}

	poolIDs := make([]string, 0, len(containers))
	allBoutIDs := make([]string, 0, len(containers))
	for _, c := range containers {
		if c.pool.ID != "" {
			poolIDs = append(poolIDs, c.pool.ID)
		}
		for _, b := range c.bouts {
			allBoutIDs = append(allBoutIDs, b.ID)
		}
	}
	times, err := s.bouts.BoutTimesForPools(ctx, poolIDs)
	if err != nil {
		return tournamentGathered{}, err
	}
	startedAt, err := s.bouts.StartedAtByBouts(ctx, allBoutIDs)
	if err != nil {
		return tournamentGathered{}, err
	}
	now := time.Now()
	forecasts, tournamentPace, err := s.buildForecasts(ctx, containers, startedAt, times, now)
	if err != nil {
		return tournamentGathered{}, err
	}
	return tournamentGathered{
		groups:         groups,
		containers:     containers,
		times:          times,
		forecasts:      forecasts,
		tournamentPace: tournamentPace,
		now:            now,
	}, nil
}

func (s *Service) buildForecasts(ctx context.Context, containers []tournamentContainer, startedAt map[string]time.Time, times map[string]domain.BoutTimes, now time.Time) (map[string]containerForecast, domain.PaceEstimate, error) {
	tournamentPace := domain.TournamentPace(tournamentPaceSamples(containers, startedAt))

	out := make(map[string]containerForecast)
	for _, c := range containers {
		if c.pool.ID == "" || c.pool.ArenaID == "" {
			continue
		}
		arenaDefaultSeconds, err := s.arenas.DefaultDurationSeconds(ctx, c.pool.ArenaID)
		if err != nil {
			return nil, domain.PaceEstimate{}, err
		}
		samples := containerPaceSamples(c.bouts, startedAt)
		out[c.pool.ID] = buildContainerForecast(c.bouts, samples, tournamentPace, time.Duration(arenaDefaultSeconds)*time.Second, now, times)
	}
	return out, tournamentPace, nil
}

// boutForecastFor резолвит прогноз одного боя по id его контейнера (см.
// комментарий у buildForecasts про ключ по pool.ID) — nil, если контейнер
// не поставлен на площадку (не в forecasts) или бой не подходит под
// прогноз (не начат — см. domain.ForecastPool).
func boutForecastFor(forecasts map[string]containerForecast, poolID, boutID string) *domain.BoutForecast {
	cf, ok := forecasts[poolID]
	if !ok {
		return nil
	}
	if f, ok := cf.byBout[boutID]; ok {
		return &f
	}
	return nil
}
