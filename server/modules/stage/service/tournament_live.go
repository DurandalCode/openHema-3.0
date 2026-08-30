// Спека 0034: публичная живая сводка турнира целиком для главной страницы
// (FR-12..FR-20). В отличие от NominationLive (одна номинация, service.go) —
// по всем номинациям турнира разом, одной подпиской (NFR-2): решение принято
// на уровне спеки — фан-аут N подписок на клиенте упирается в браузерный
// лимит соединений и не показывает свободные площадки (ArenaAdminService
// admin-only).
package service

import (
	"context"
	"strings"
	"time"

	"github.com/hema/server/modules/stage/domain"
)

// tournamentContainer — один контейнер боёв турнира, собранный либо из
// готового группового этапа (groupLivePools), либо из половины круга
// готового bracket-этапа (buildBracket — Halves[i].Container/Pairs[j].Bout,
// см. proto-комментарий Pool: «у этапа-сетки — половина круга»). Общее
// представление позволяет дальше обрабатывать оба типа этапа одним проходом
// — без него бои плейофф-сетки выпали бы из публичной сводки (макет прямо
// показывает такой бой, «Длинный меч · 1/4»).
type tournamentContainer struct {
	pool           domain.Pool
	bouts          []domain.BoutRef
	currentBoutID  string
	nominationID   string
	nominationName string
	stageTitle     string
}

// TournamentLive собирает живую сводку турнира целиком (спека 0034): пустой
// tournamentID отклоняется без обращения к провайдерам (тот же паттерн, что
// NominationLive на пустом nominationID). Непустой, но не указывающий на
// активный турнир — не валидируется здесь: ActiveArenas/
// NominationsByTournament уже резолвят и проверяют tournamentID против
// активного турнира на стороне своих адаптеров (join-волна T13) — их ошибка
// прокидывается как есть.
func (s *Service) TournamentLive(ctx context.Context, tournamentID string) (domain.TournamentSnapshot, error) {
	tournamentID = strings.TrimSpace(tournamentID)
	if tournamentID == "" {
		return domain.TournamentSnapshot{}, domain.ErrInvalidInput
	}

	groups, err := s.gatherNominationContainers(ctx, tournamentID)
	if err != nil {
		return domain.TournamentSnapshot{}, err
	}

	containers := make([]tournamentContainer, 0)
	liveNominations := make([]domain.LiveNominationView, 0, len(groups))

	for _, g := range groups {
		containers = append(containers, g.containers...)

		view, err := s.liveNominationView(ctx, g.nom, g.stages, g.containers)
		if err != nil {
			return domain.TournamentSnapshot{}, err
		}
		liveNominations = append(liveNominations, view)
	}

	// BoutTimesForPools — один вызов на ВСЕ собранные пулы разом (групповые
	// контейнеры и половины круга вместе), не по одному на пул и не по
	// одному на тип этапа (план T9, п.3/п.9): дешевле и детерминированно
	// тестируется через spy fake-кондуктора.
	poolIDs := make([]string, 0, len(containers))
	for _, c := range containers {
		if c.pool.ID != "" {
			poolIDs = append(poolIDs, c.pool.ID)
		}
	}
	times, err := s.bouts.BoutTimesForPools(ctx, poolIDs)
	if err != nil {
		return domain.TournamentSnapshot{}, err
	}

	// StartedAtByBouts — наблюдения для темпа площадок (спека 0043, ADR
	// 0020), тем же батч-приёмом, что BoutTimesForPools выше: один вызов
	// на все собранные бои снапшота разом, не по одному на пул.
	allBoutIDs := make([]string, 0, len(containers))
	for _, c := range containers {
		for _, b := range c.bouts {
			allBoutIDs = append(allBoutIDs, b.ID)
		}
	}
	startedAt, err := s.bouts.StartedAtByBouts(ctx, allBoutIDs)
	if err != nil {
		return domain.TournamentSnapshot{}, err
	}
	now := time.Now()
	forecasts, _, err := s.buildForecasts(ctx, containers, startedAt, times, now)
	if err != nil {
		return domain.TournamentSnapshot{}, err
	}

	bouts := make([]domain.FeedBout, 0)
	for _, c := range containers {
		for _, b := range c.bouts {
			bouts = append(bouts, toFeedBout(c, b, times[b.ID], boutForecastFor(forecasts, c.pool.ID, b.ID)))
		}
	}

	arenas, err := s.arenas.ActiveArenas(ctx, tournamentID)
	if err != nil {
		return domain.TournamentSnapshot{}, err
	}
	containerByArena := make(map[string]tournamentContainer, len(containers))
	for _, c := range containers {
		if c.pool.ArenaID != "" {
			containerByArena[c.pool.ArenaID] = c
		}
	}
	liveArenas := make([]domain.LiveArenaView, 0, len(arenas))
	for _, arena := range arenas {
		liveArenas = append(liveArenas, toLiveArenaView(arena, containerByArena[arena.ID], times, forecasts))
	}

	return domain.TournamentSnapshot{
		TournamentID:    tournamentID,
		Arenas:          liveArenas,
		Bouts:           bouts,
		Nominations:     liveNominations,
		ServerNowUnixMS: now.UnixMilli(),
	}, nil
}

// nominationContainers — одна номинация турнира вместе с её этапами и уже
// собранными готовыми контейнерами (спека 0043: общий вход для сборки
// строки номинации TournamentLive и ConsoleNomination/ConsoleQueueItem
// GetTournamentConsole — оба читают одни и те же контейнеры, без второго
// обхода этапов).
type nominationContainers struct {
	nom        domain.NominationRef
	stages     []domain.Stage
	containers []tournamentContainer
}

// gatherNominationContainers резолвит номинации турнира (спека 0034,
// FR-20 — тот же охват и admin-порядок, что ActiveArenas) и для каждой
// собирает её этапы и готовые контейнеры — единственный проход по
// номинациям/этапам турнира, переиспользуемый TournamentLive и
// GetTournamentConsole (спека 0043, NFR-2).
func (s *Service) gatherNominationContainers(ctx context.Context, tournamentID string) ([]nominationContainers, error) {
	nominations, err := s.nominations.NominationsByTournament(ctx, tournamentID)
	if err != nil {
		return nil, err
	}
	out := make([]nominationContainers, 0, len(nominations))
	for _, nom := range nominations {
		stages, err := s.stagesForRead(ctx, nom.ID)
		if err != nil {
			return nil, err
		}
		containers, err := s.tournamentContainersForNomination(ctx, nom, stages)
		if err != nil {
			return nil, err
		}
		out = append(out, nominationContainers{nom: nom, stages: stages, containers: containers})
	}
	return out, nil
}

// tournamentContainersForNomination собирает tournamentContainer для все
// готовые (ready) этапы одной номинации — групповые контейнеры (через
// groupLivePools, переиспользуя уже прочитанные бои и эффективный текущий
// бой) и половины круга готовых bracket-этапов (через buildBracket,
// includeUnassigned=false — публичный путь). Черновые этапы пропускаются тем
// же гейтом, что NominationLive (FR-24 = 0014 FR-12).
func (s *Service) tournamentContainersForNomination(ctx context.Context, nom domain.NominationRef, stages []domain.Stage) ([]tournamentContainer, error) {
	out := make([]tournamentContainer, 0)
	for _, stage := range stages {
		if stage.ID == "" || stage.Status != domain.LayoutReady {
			continue
		}
		switch stage.Type {
		case domain.StageTypeGroups:
			pools, err := s.groupLivePools(ctx, stage)
			if err != nil {
				return nil, err
			}
			for _, lp := range pools {
				out = append(out, tournamentContainer{
					pool: lp.Pool, bouts: lp.Bouts, currentBoutID: lp.CurrentBoutID,
					nominationID: nom.ID, nominationName: nom.Title, stageTitle: stage.Title,
				})
			}
		case domain.StageTypeBracket:
			bracket, err := s.buildBracket(ctx, stage, false)
			if err != nil {
				return nil, err
			}
			for _, round := range bracket.Rounds {
				for _, half := range round.Halves {
					if half.Container.ID == "" {
						// Контейнер круга ещё не материализован (создаётся
						// только lockBracket'ом, план «service/bracket.go») —
						// нечего показывать, пары этой половины ещё не
						// разрешены (Bout == nil у всех).
						continue
					}
					boutsOfHalf := make([]domain.BoutRef, 0, len(half.Pairs))
					for _, pair := range half.Pairs {
						if pair.Bout != nil {
							boutsOfHalf = append(boutsOfHalf, *pair.Bout)
						}
					}
					out = append(out, tournamentContainer{
						pool: half.Container, bouts: sortedBySequence(boutsOfHalf), currentBoutID: half.CurrentBoutID,
						nominationID: nom.ID, nominationName: nom.Title, stageTitle: stage.Title,
					})
				}
			}
		}
	}
	return out, nil
}

// liveNominationView собирает строку сайдбара «Номинации» (FR-20): фаза —
// из ExecutionStatus реальных этапов (не виртуального, ID == ""), бойцов —
// активный ростер номинации (весь состав, не только те, кто уже дрался, —
// «24 бойца» в макете), боёв — сумма по уже собранным контейнерам этой
// номинации.
func (s *Service) liveNominationView(ctx context.Context, nom domain.NominationRef, stages []domain.Stage, containers []tournamentContainer) (domain.LiveNominationView, error) {
	realStages := make([]domain.Stage, 0, len(stages))
	for _, st := range stages {
		if st.ID != "" {
			realStages = append(realStages, st)
		}
	}
	statuses := make([]domain.StageStatus, len(realStages))
	for i, st := range realStages {
		statuses[i] = st.ExecutionStatus
	}
	phase := nominationPhaseFromExecution(domain.ComputeNominationExecution(statuses))

	currentStageTitle := currentStageTitleOf(realStages)

	boutTotal, boutFinished := 0, 0
	for _, c := range containers {
		boutTotal += len(c.bouts)
		for _, b := range c.bouts {
			if b.State == domain.BoutStateFinished {
				boutFinished++
			}
		}
	}

	active, err := s.fighters.ActiveFightersByNomination(ctx, nom.ID)
	if err != nil {
		return domain.LiveNominationView{}, err
	}

	return domain.LiveNominationView{
		NominationID:      nom.ID,
		Title:             nom.Title,
		Position:          nom.Position,
		Phase:             phase,
		CurrentStageTitle: currentStageTitle,
		BoutTotal:         boutTotal,
		BoutFinished:      boutFinished,
		FighterCount:      len(active),
	}, nil
}

// currentStageTitleOf — человекочитаемая «текущая» стадия номинации (FR-20):
// первый (по позиции) этап, ещё не доигранный целиком; если все доиграны —
// заголовок последнего (терминального) этапа; без реальных этапов — пусто.
func currentStageTitleOf(realStages []domain.Stage) string {
	for _, st := range realStages {
		if st.ExecutionStatus != domain.StageStatusFinished {
			return st.Title
		}
	}
	if len(realStages) > 0 {
		return realStages[len(realStages)-1].Title
	}
	return ""
}

// nominationPhaseFromExecution маппит исполнительную ось номинации (спека
// 0021, ComputeNominationExecution — уже используется resultsFromStages/
// syncNomination для той же величины) на фазу сайдбара публичной сводки
// (спека 0034, FR-20): none -> upcoming, active -> running, finished ->
// finished.
func nominationPhaseFromExecution(execution domain.NominationExecution) domain.NominationPhase {
	switch execution {
	case domain.ExecutionActive:
		return domain.NominationPhaseRunning
	case domain.ExecutionFinished:
		return domain.NominationPhaseFinished
	default:
		return domain.NominationPhaseUpcoming
	}
}

// toFeedBout маппит один бой контейнера в строку ленты (FR-15/FR-16).
// Времена — через feedBoutTimes: гейтятся текущим состоянием боя, а не
// сырыми отметками журнала, — переоткрытие бой после завершения (AC-14)
// иначе показало бы старое время завершения, пока журнал ещё не обновлён
// новым событием (сознательное решение этого инкремента, не полагающееся на
// нюансы SQL-агрегата модуля bout).
func toFeedBout(c tournamentContainer, b domain.BoutRef, t domain.BoutTimes, forecast *domain.BoutForecast) domain.FeedBout {
	startedAt, finishedAt := feedBoutTimes(b.State, t)
	return domain.FeedBout{
		BoutID:         b.ID,
		NominationID:   c.nominationID,
		NominationName: c.nominationName,
		StageTitle:     c.stageTitle,
		PoolName:       c.pool.Name,
		ArenaID:        c.pool.ArenaID,
		ArenaName:      c.pool.ArenaName,
		SequenceNumber: b.SequenceNumber,
		PoolBoutTotal:  len(c.bouts),
		FighterA:       b.FighterA,
		FighterB:       b.FighterB,
		State:          b.State,
		ScoreA:         b.ScoreA,
		ScoreB:         b.ScoreB,
		StartedAt:      startedAt,
		FinishedAt:     finishedAt,
		Forecast:       forecast,
	}
}

// feedBoutTimes гейтит сырые времена журнала (BoutTimesForPools) текущим
// состоянием боя (FR-16, AC-11..AC-14): не начат — оба пусты (прочерк, без
// прогноза); идёт — только начало (в т.ч. после переоткрытия — старое время
// завершения не всплывает, даже если журнал его ещё несёт, AC-14);
// завершён — оба заполнены (начало — не показывается представлением по
// FR-16, но не мешает).
func feedBoutTimes(state domain.BoutState, t domain.BoutTimes) (startedAt, finishedAt *time.Time) {
	switch state {
	case domain.BoutStateInProgress:
		return t.StartedAt, nil
	case domain.BoutStateFinished:
		return t.StartedAt, t.FinishedAt
	default:
		return nil, nil
	}
}

// toLiveArenaView собирает карточку площадки (FR-14). container — нулевое
// значение (pool.ID == ""), если на арене сейчас никого нет — FREE без
// заполненных полей. Если пул стоит, но эффективного текущего боя нет (все
// бои завершены, UnseatPool ещё не вызван) — тоже FREE: сознательное сужение
// против макета (тот показывает под «свободна» ещё и итог только что
// отыгранного пула — данные протокола пула вне FR-14 в этом инкременте,
// план T9 п.5).
func toLiveArenaView(arena domain.ArenaRef, c tournamentContainer, times map[string]domain.BoutTimes, forecasts map[string]containerForecast) domain.LiveArenaView {
	view := domain.LiveArenaView{
		ArenaID:   arena.ID,
		ArenaName: arena.Name,
		Position:  arena.Position,
		State:     domain.LiveArenaFree,
	}
	if c.pool.ID == "" || c.currentBoutID == "" {
		return view
	}

	var current *domain.BoutRef
	for i := range c.bouts {
		if c.bouts[i].ID == c.currentBoutID {
			current = &c.bouts[i]
			break
		}
	}
	if current == nil {
		return view
	}

	finished, total := 0, len(c.bouts)
	for _, b := range c.bouts {
		if b.State == domain.BoutStateFinished {
			finished++
		}
	}

	view.NominationID = c.nominationID
	view.NominationName = c.nominationName
	view.PoolName = c.pool.Name
	view.StageTitle = c.stageTitle
	view.PoolBoutTotal = total
	view.PoolBoutFinished = finished
	feedBout := toFeedBout(c, *current, times[current.ID], boutForecastFor(forecasts, c.pool.ID, current.ID))
	view.CurrentBout = &feedBout
	if current.State == domain.BoutStateInProgress {
		view.State = domain.LiveArenaBoutInProgress
	} else {
		view.State = domain.LiveArenaPreparing
	}
	// NextBoutForecast — прогноз ближайшего не начатого боя ЭТОЙ площадки
	// (спека 0043, FR-21): при PREPARING совпадает с CurrentBout.Forecast
	// (сам CurrentBout и есть следующий бой), при BOUT_IN_PROGRESS — прогноз
	// боя ПОСЛЕ идущего (у CurrentBout в этом состоянии своего прогноза нет).
	if cf, ok := forecasts[c.pool.ID]; ok {
		view.NextBoutForecast = cf.nextBoutForecast()
	}
	return view
}

// SubscribeTournament — тонкий passthrough к LiveSubscriber (спека 0034, по
// аналогии с SubscribeNomination, спека 0014): api-слой (WatchTournamentLive)
// подписывается через сервис, не держа собственной ссылки на шину.
func (s *Service) SubscribeTournament() (<-chan struct{}, func()) {
	return s.liveBus.SubscribeTournament()
}
