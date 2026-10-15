// Спека 0043: пульт турнира (ADR 0020, FR-8/FR-9/FR-19) — живой
// операционный дашборд оператора. Read-only относительно домена (FR-13/
// FR-17): собирает и подсказывает, ничего сам не ставит и не завершает.
// Переиспользует тот же первый проход, что TournamentLive (0034) и
// GetArenaBoards (0041) — gatherTournament (forecast.go) — без новых
// обращений к объекту площадки/номинации сверх уже установленного набора
// (NFR-2).
package service

import (
	"context"
	"strings"
	"time"

	"github.com/hema/server/modules/stage/domain"
)

// GetTournamentConsole собирает пульт турнира целиком: все неархивные
// площадки с темпом и прогнозом (FR-11), все номинации с остатком боёв
// (FR-12), очередь готовых к постановке пулов (FR-13), лента «требует
// внимания» (FR-14/FR-15).
//
// Два из шести видов ленты внимания — POOL_NOT_STARTED («пул стоит, но не
// начат») и NOMINATION_STALLED («номинация не двинулась») — требуют
// момента, с которого держится условие (когда пул поставили / когда
// раскладка зафиксирована). Ни `stage.pools`, ни `stage.stages` этот
// момент сегодня не отдают через domain.Pool/domain.Stage (в БД колонка
// updated_at есть, но не выведена в Go-типы ни на одном из существующих
// путей чтения) — заводить это как часть спеки 0043 означало бы отдельную
// правку пяти+ SQL-запросов пула и семи+ запросов этапа исключительно
// ради двух пороговых сигналов. Оба сигнала остаются реализованными в
// domain.DetectAlerts (протестировано) и присутствуют в контракте — эта
// функция сознательно не подаёт условие их срабатывания (см.
// buildConsoleArenaAlertInput/buildConsoleNominationAlertInput), пока
// момент фиксации не заведён отдельным инкрементом.
func (s *Service) GetTournamentConsole(ctx context.Context, tournamentID string) (domain.ConsoleSnapshot, error) {
	tournamentID = strings.TrimSpace(tournamentID)
	if tournamentID == "" {
		return domain.ConsoleSnapshot{}, domain.ErrInvalidInput
	}

	gathered, err := s.gatherTournament(ctx, tournamentID)
	if err != nil {
		return domain.ConsoleSnapshot{}, err
	}

	arenas := gathered.arenas
	containerByArena := make(map[string]tournamentContainer, len(gathered.containers))
	containerByPool := make(map[string]tournamentContainer, len(gathered.containers))
	for _, c := range gathered.containers {
		if c.pool.ArenaID != "" {
			containerByArena[c.pool.ArenaID] = c
		}
		if c.pool.ID != "" {
			containerByPool[c.pool.ID] = c
		}
	}
	// Пулы очередей неархивных площадок (спека 0063): они не «нераспределены»
	// (FR-24), а их бои учитываются в оценке номинации (FR-23).
	queuedPoolIDs := make(map[string]bool)
	for _, ids := range gathered.queues {
		for _, id := range ids {
			queuedPoolIDs[id] = true
		}
	}

	consoleArenas := make([]domain.ConsoleArena, 0, len(arenas))
	alertArenaInputs := make([]domain.ConsoleAlertArenaInput, 0, len(arenas))
	for _, arena := range arenas {
		c := containerByArena[arena.ID]
		ca, alertIn := buildConsoleArena(arena, c, gathered.forecasts, gathered.times)
		fillConsoleArenaQueue(&ca, &alertIn, gathered.queues[arena.ID], containerByPool, gathered.forecasts)
		consoleArenas = append(consoleArenas, ca)
		alertArenaInputs = append(alertArenaInputs, alertIn)
	}

	consoleNominations := make([]domain.ConsoleNomination, 0, len(gathered.groups))
	alertNominationInputs := make([]domain.ConsoleAlertNominationInput, 0, len(gathered.groups))
	queue := make([]domain.ConsoleQueueItem, 0)
	hasReadyQueue := false
	for _, g := range gathered.groups {
		consoleNominations = append(consoleNominations, buildConsoleNomination(g, gathered.forecasts, queuedPoolIDs))
		alertNominationInputs = append(alertNominationInputs, buildConsoleNominationAlertInput(g))

		for _, c := range g.containers {
			if c.pool.ID == "" || c.pool.ArenaID != "" {
				continue
			}
			// Пул в очереди — всё ещё готов к постановке (ARENA_IDLE не
			// гаснет, FR-25), но в «Не распределены» не показывается (FR-24).
			hasReadyQueue = true
			if queuedPoolIDs[c.pool.ID] {
				continue
			}
			queue = append(queue, domain.ConsoleQueueItem{
				PoolID:           c.pool.ID,
				NominationID:     c.nominationID,
				NominationName:   c.nominationName,
				StageTitle:       c.stageTitle,
				PoolName:         c.pool.Name,
				BoutCount:        len(c.bouts),
				EstimatedSeconds: int((gathered.tournamentPace.Tick * time.Duration(len(c.bouts))).Seconds()),
			})
		}
	}

	alerts := domain.DetectAlerts(
		alertArenaInputs,
		alertNominationInputs,
		domain.ConsoleAlertQueueInput{HasReadyPools: hasReadyQueue},
		gathered.now,
	)

	return domain.ConsoleSnapshot{
		TournamentID:    tournamentID,
		Arenas:          consoleArenas,
		Nominations:     consoleNominations,
		Queue:           queue,
		Alerts:          alerts,
		ServerNowUnixMS: gathered.now.UnixMilli(),
	}, nil
}

// fillConsoleArenaQueue дописывает очередь площадки в её карточку (спека 0063,
// FR-17/FR-21) и первый пул очереди во вход ленты внимания (FR-25). Пул
// очереди без контейнера в снапшоте (быть не должно: в очередь идут только
// пулы готовых этапов) пропускается.
func fillConsoleArenaQueue(ca *domain.ConsoleArena, alertIn *domain.ConsoleAlertArenaInput, queue []string, byPool map[string]tournamentContainer, forecasts map[string]containerForecast) {
	for i, id := range queue {
		c, ok := byPool[id]
		if !ok {
			continue
		}
		item := domain.ConsoleQueueItem{
			PoolID:         c.pool.ID,
			NominationID:   c.nominationID,
			NominationName: c.nominationName,
			StageTitle:     c.stageTitle,
			PoolName:       c.pool.Name,
			BoutCount:      len(c.bouts),
			QueuePosition:  i + 1,
		}
		if cf, ok := forecasts[id]; ok {
			var first time.Time
			for _, f := range cf.byBout {
				if f.BoutsAhead == 0 {
					first = f.ExpectedStartAt
				}
			}
			if !first.IsZero() {
				item.ExpectedStartAt = &first
			}
			item.EstimatedSeconds = int((cf.pace.Tick * time.Duration(len(c.bouts))).Seconds())
		}
		ca.Queue = append(ca.Queue, item)
	}
	ca.QueueLength = len(ca.Queue)
	if len(ca.Queue) > 0 {
		alertIn.NextPoolID = ca.Queue[0].PoolID
		alertIn.NextPoolName = ca.Queue[0].PoolName
	}
}

// buildConsoleArena собирает карточку площадки пульта (FR-11) и вход
// DetectAlerts для неё одним проходом по контейнеру — одна точка правды
// на площадку, а не две независимые сборки одних и тех же полей.
func buildConsoleArena(arena domain.ArenaRef, c tournamentContainer, forecasts map[string]containerForecast, times map[string]domain.BoutTimes) (domain.ConsoleArena, domain.ConsoleAlertArenaInput) {
	occupied := c.pool.ID != ""
	idleState, freeSince := domain.IdleStateOf(occupied, arena.LastFreedAt)

	ca := domain.ConsoleArena{
		ArenaID:   arena.ID,
		ArenaName: arena.Name,
		Position:  arena.Position,
		IdleState: idleState,
		FreeSince: freeSince,
	}
	alertIn := domain.ConsoleAlertArenaInput{
		ArenaID:   arena.ID,
		ArenaName: arena.Name,
		Occupied:  occupied,
		FreeSince: freeSince,
	}
	if !occupied {
		return ca, alertIn
	}

	ca.NominationID = c.nominationID
	ca.NominationName = c.nominationName
	ca.StageTitle = c.stageTitle
	ca.PoolID = c.pool.ID
	ca.PoolName = c.pool.Name
	alertIn.PoolID = c.pool.ID
	alertIn.PoolName = c.pool.Name

	total, finished := 0, 0
	var lastFinishedAt time.Time
	for _, b := range c.bouts {
		total++
		if b.State != domain.BoutStateFinished {
			continue
		}
		finished++
		if t, ok := times[b.ID]; ok && t.FinishedAt != nil && t.FinishedAt.After(lastFinishedAt) {
			lastFinishedAt = *t.FinishedAt
		}
	}
	ca.BoutTotal = total
	ca.BoutFinished = finished
	alertIn.PoolAllBoutsFinished = total > 0 && finished == total
	alertIn.PoolLastFinishedAt = lastFinishedAt
	// PoolAnyBoutStarted — см. doc-комментарий GetTournamentConsole:
	// «пул стоит, но не начат» требует момента постановки, которого домен
	// сегодня не отдаёт. true здесь означает «не проверять» (условие
	// !PoolAnyBoutStarted никогда не станет true), а не утверждение факта.
	alertIn.PoolAnyBoutStarted = true

	if cb, found := boutByID(c.bouts, c.currentBoutID); found {
		if f := boutForecastFor(forecasts, c.pool.ID, cb.ID); f != nil {
			cb.Forecast = f
		}
		ca.CurrentBout = &cb
		if cb.State == domain.BoutStateInProgress {
			alertIn.BoutInProgress = true
			alertIn.BoutID = cb.ID
			alertIn.BoutInProgressSince = currentBoutStartedAt(c.bouts, times)
		}
	}

	if cf, ok := forecasts[c.pool.ID]; ok {
		ca.Pace = cf.pace
		ca.PoolExpectedFinishAt = cf.finishAt
		ca.PoolExpectedFinishAtOK = cf.finishAtOK
	}

	return ca, alertIn
}

// buildConsoleNomination собирает строку номинации пульта (FR-12).
// ExpectedFinishAt — максимум по её ПОСТАВЛЕННЫМ контейнерам (ADR 0020):
// обычно у номинации один активный контейнер за раз, но структурно их
// может быть несколько (несколько групп поставлены одновременно).
// BoutRemainingUnseated считает остаток непоставленных контейнеров числом,
// без времени (горизонт оценки, FR-9).
func buildConsoleNomination(g nominationContainers, forecasts map[string]containerForecast, queuedPoolIDs map[string]bool) domain.ConsoleNomination {
	realStages := make([]domain.Stage, 0, len(g.stages))
	for _, st := range g.stages {
		if st.ID != "" {
			realStages = append(realStages, st)
		}
	}
	statuses := make([]domain.StageStatus, len(realStages))
	for i, st := range realStages {
		statuses[i] = st.ExecutionStatus
	}
	phase := nominationPhaseFromExecution(domain.ComputeNominationExecution(statuses))

	boutTotal, boutFinished, boutRemainingUnseated := 0, 0, 0
	var expectedFinishAt time.Time
	expectedFinishAtOK, provisional := false, false
	for _, c := range g.containers {
		finishedHere := 0
		for _, b := range c.bouts {
			if b.State == domain.BoutStateFinished {
				finishedHere++
			}
		}
		boutTotal += len(c.bouts)
		boutFinished += finishedHere

		// Спека 0063, FR-23: пул в очереди неархивной площадки — не
		// «непоставленный»: его бои идут в оценку (forecasts несёт запись
		// очереди под pool.ID).
		if c.pool.ID == "" || (c.pool.ArenaID == "" && !queuedPoolIDs[c.pool.ID]) {
			boutRemainingUnseated += len(c.bouts) - finishedHere
			continue
		}
		cf, ok := forecasts[c.pool.ID]
		if !ok || !cf.finishAtOK {
			continue
		}
		if !expectedFinishAtOK || cf.finishAt.After(expectedFinishAt) {
			expectedFinishAt = cf.finishAt
			expectedFinishAtOK = true
			provisional = cf.pace.Provisional
		}
	}

	return domain.ConsoleNomination{
		NominationID:          g.nom.ID,
		Title:                 g.nom.Title,
		Position:              g.nom.Position,
		Phase:                 phase,
		CurrentStageTitle:     currentStageTitleOf(realStages),
		BoutTotal:             boutTotal,
		BoutFinished:          boutFinished,
		BoutRemainingUnseated: boutRemainingUnseated,
		ExpectedFinishAt:      expectedFinishAt,
		ExpectedFinishAtOK:    expectedFinishAtOK,
		Provisional:           provisional,
	}
}

// buildConsoleNominationAlertInput — вход DetectAlerts для номинации.
// NextStageNotBuilt — предыдущий (по позиции) реальный этап доигран,
// следующий существует и стоит в draft (FR-15.5, без порога). Stalled
// (FR-15.6) не заполняется — см. doc-комментарий GetTournamentConsole:
// требует момента фиксации раскладки, которого домен сегодня не отдаёт.
func buildConsoleNominationAlertInput(g nominationContainers) domain.ConsoleAlertNominationInput {
	realStages := make([]domain.Stage, 0, len(g.stages))
	for _, st := range g.stages {
		if st.ID != "" {
			realStages = append(realStages, st)
		}
	}
	nextStageNotBuilt := false
	for i := 1; i < len(realStages); i++ {
		if realStages[i-1].ExecutionStatus == domain.StageStatusFinished && realStages[i].Status == domain.LayoutDraft {
			nextStageNotBuilt = true
			break
		}
	}
	return domain.ConsoleAlertNominationInput{
		NominationID:      g.nom.ID,
		NominationName:    g.nom.Title,
		NextStageNotBuilt: nextStageNotBuilt,
	}
}
