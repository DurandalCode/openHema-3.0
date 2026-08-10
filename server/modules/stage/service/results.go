// Спека 0021: ЖЦ номинации целиком — статус этапа/номинации (наполнение
// вычислением из прогресса боёв) и итоговый протокол. Ядро — чистые функции
// domain/results.go; этот файл собирает для них вход из существующих
// репозиториев/портов, по образцу applyArenaAndStatus/bracketStatusesForStage.
package service

import (
	"context"
	"strings"

	"github.com/hema/server/modules/stage/domain"
)

// stageStatuses возвращает реальные этапы номинации (без виртуального
// авто-этапа — в отличие от stagesForRead) с проставленным ExecutionStatus
// (спека 0021, FR-1..FR-3) — общий источник для протокола
// (resultsFromStages), исполнительной оси (syncNomination) и читающих
// путей (stagesForRead/ListStages).
func (s *Service) stageStatuses(ctx context.Context, nominationID string) ([]domain.Stage, error) {
	stages, err := s.repo.StagesByNomination(ctx, nominationID)
	if err != nil {
		return nil, err
	}
	for i := range stages {
		containers, err := s.stageContainers(ctx, stages[i])
		if err != nil {
			return nil, err
		}
		stages[i].ExecutionStatus = domain.ComputeStageStatus(stages[i].Status, containers)
	}
	return stages, nil
}

// stageContainers собирает контейнеры боёв этапа для ComputeStageStatus
// (спека 0021, FR-2): пулы группы (Total = число боёв) либо половины круга
// сетки (Total = число разрешаемых пар, 0018 FR-17).
func (s *Service) stageContainers(ctx context.Context, stage domain.Stage) ([]domain.StageContainer, error) {
	if stage.Type == domain.StageTypeBracket {
		return s.bracketStageContainers(ctx, stage)
	}
	pools, err := s.repo.PoolsByStage(ctx, stage.ID)
	if err != nil {
		return nil, err
	}
	out := make([]domain.StageContainer, 0, len(pools))
	for _, p := range pools {
		total, started, finished, err := s.bouts.PoolProgress(ctx, p.ID)
		if err != nil {
			return nil, err
		}
		out = append(out, domain.StageContainer{
			Status: domain.ComputePoolStatus(stage.Status, p.ArenaID, started, finished, total),
			Total:  total,
		})
	}
	return out, nil
}

// bracketStageContainers — stageContainers для этапа-сетки: контейнер —
// половина круга (как bracketContainerStatuses), знаменатель — разрешённые
// пары (0018, FR-17), не материализованные бои.
func (s *Service) bracketStageContainers(ctx context.Context, stage domain.Stage) ([]domain.StageContainer, error) {
	view, pools, err := s.bracketViewForStage(ctx, stage)
	if err != nil {
		return nil, err
	}
	poolByNumber := make(map[int]domain.Pool, len(pools))
	for _, p := range pools {
		poolByNumber[p.Number] = p
	}
	out := make([]domain.StageContainer, 0)
	for _, r := range view.Rounds {
		for _, h := range r.Halves {
			p := poolByNumber[h.ContainerNumber]
			total := len(h.Pairs)
			resolved, started := 0, 0
			for _, pr := range h.Pairs {
				if pr.Resolved {
					resolved++
				}
				if pr.Bout != nil && pr.Bout.State != domain.BoutStateNotStarted {
					started++
				}
			}
			out = append(out, domain.StageContainer{
				Status: computeHalfStatus(stage.Status, p.ArenaID, started, resolved, total),
				Total:  total,
			})
		}
	}
	return out, nil
}

// bracketViewForStage резолвит сетку этапа в чистый BracketView (посев +
// материализованные бои → domain.ResolveBracket) — тот же вход, что
// buildBracket/bracketStatusesForStage строят для своих нужд, здесь — для
// статусов контейнеров (bracketStageContainers) и протокола
// (resultEntriesForStage). Посев не может быть orphaned на этом пути —
// вызывается только для стадий не в draft (ready/выше), а enrichedSeeds
// помечает orphaned только для draft (см. её комментарий).
func (s *Service) bracketViewForStage(ctx context.Context, stage domain.Stage) (domain.BracketView, []domain.Pool, error) {
	active, err := s.fighters.ActiveFightersByNomination(ctx, stage.NominationID)
	if err != nil {
		return domain.BracketView{}, nil, err
	}
	activeByID := make(map[string]domain.FighterRef, len(active))
	for _, f := range active {
		activeByID[f.ID] = f
	}
	seeds, _, err := s.enrichedSeeds(ctx, stage, activeByID)
	if err != nil {
		return domain.BracketView{}, nil, err
	}
	pools, err := s.repo.PoolsByStage(ctx, stage.ID)
	if err != nil {
		return domain.BracketView{}, nil, err
	}
	bracketBouts, _, err := s.bracketBoutRows(ctx, stage.Bracket, pools)
	if err != nil {
		return domain.BracketView{}, nil, err
	}
	return domain.ResolveBracket(stage.Bracket, seeds, bracketBouts), pools, nil
}

// resultEntriesForStage строит строки протокола одного завершённого
// терминального этапа (спека 0021, FR-11/FR-11a/FR-12): по типу этапа —
// ComputeBracketPlaces либо ComputeGroupPlaces. placesFromOverallOrder —
// групповой этап больше чем на одну группу (FR-12) — интерфейс обязан
// показать оговорку про сведение без нормировки (0019, NFR-2).
func (s *Service) resultEntriesForStage(ctx context.Context, stage domain.Stage) ([]domain.ResultEntry, bool, error) {
	if stage.Type == domain.StageTypeBracket {
		view, _, err := s.bracketViewForStage(ctx, stage)
		if err != nil {
			return nil, false, err
		}
		return domain.ComputeBracketPlaces(view), false, nil
	}

	layout, err := s.loadLayout(ctx, stage.ID)
	if err != nil {
		return nil, false, err
	}
	groups := make([]domain.SourceGroup, 0, len(layout.Pools))
	for _, p := range layout.Pools {
		groups = append(groups, domain.SourceGroup{PoolID: p.ID, Label: p.Name, Standings: p.Standings})
	}
	return domain.ComputeGroupPlaces(groups), len(groups) > 1, nil
}

// resultsFromStages строит NominationResults из уже загруженных этапов
// номинации (с проставленным ExecutionStatus, stageStatuses/stagesForRead) —
// общее ядро для NominationResults (публичный путь) и NominationLive (не
// делает повторный проход по этапам, NFR-2). Виртуальный этап-заглушка
// (ID == "", stagesForRead без реальных строк) не считается — как и его
// отсутствие в StagesByNomination, даёт пустой протокол.
func (s *Service) resultsFromStages(ctx context.Context, nominationID string, stages []domain.Stage) (domain.NominationResults, error) {
	real := make([]domain.Stage, 0, len(stages))
	for _, st := range stages {
		if st.ID != "" {
			real = append(real, st)
		}
	}

	statuses := make([]domain.StageStatus, len(real))
	for i, st := range real {
		statuses[i] = st.ExecutionStatus
	}
	execution := domain.ComputeNominationExecution(statuses)

	terminal := domain.TerminalStages(real)
	sections := make([]domain.ResultsSection, 0, len(terminal))
	for _, stage := range terminal {
		section := domain.ResultsSection{
			StageID:    stage.ID,
			StageTitle: stage.Title,
			StageType:  stage.Type,
			Finished:   stage.ExecutionStatus == domain.StageStatusFinished,
		}
		if section.Finished {
			entries, placesFromOverall, err := s.resultEntriesForStage(ctx, stage)
			if err != nil {
				return domain.NominationResults{}, err
			}
			section.Entries = entries
			section.PlacesFromOverallOrder = placesFromOverall
		}
		sections = append(sections, section)
	}

	return domain.NominationResults{
		NominationID:       nominationID,
		NominationFinished: execution == domain.ExecutionFinished,
		Sections:           sections,
	}, nil
}

// NominationResults возвращает итоговый протокол номинации (спека 0021,
// FR-9..FR-15) — публичный путь (StagePublicService.GetNominationResults) и
// админский экран схемы (FR-19, показывает и недоигранные секции).
func (s *Service) NominationResults(ctx context.Context, nominationID string) (domain.NominationResults, error) {
	nominationID = strings.TrimSpace(nominationID)
	if nominationID == "" {
		return domain.NominationResults{}, domain.ErrInvalidInput
	}
	stages, err := s.stageStatuses(ctx, nominationID)
	if err != nil {
		return domain.NominationResults{}, err
	}
	return s.resultsFromStages(ctx, nominationID, stages)
}

// syncNomination — единая точка push'а обеих осей состояния номинации в
// модуль nomination (спека 0012 FR-10, спека 0021 FR-4/FR-5): считает
// hasDistributedFighters (существующая hasDistributedAcrossStages) и
// исполнительную ось (ComputeNominationExecution по статусам всех этапов) и
// синхронизирует их одним вызовом порта. Заменяет прежние отдельные вызовы
// SyncRegistrationState — вызывается после каждой мутации, способной
// изменить любую из осей (по результирующему состоянию, не по имени RPC,
// тот же принцип, что и раньше).
func (s *Service) syncNomination(ctx context.Context, nominationID string) error {
	distributed, err := s.hasDistributedAcrossStages(ctx, nominationID)
	if err != nil {
		return err
	}
	stages, err := s.stageStatuses(ctx, nominationID)
	if err != nil {
		return err
	}
	statuses := make([]domain.StageStatus, len(stages))
	for i, st := range stages {
		statuses[i] = st.ExecutionStatus
	}
	execution := domain.ComputeNominationExecution(statuses)
	return s.nominations.SyncNominationState(ctx, nominationID, distributed, execution)
}
