// Package service — спека 0019: переходы между этапами (ADR 0014 §5-7).
// Правило отбора этапа, превью формирования и само формирование — здесь;
// схема и её исполнение остаются в одном модуле (ADR 0014 §8), переход
// «прочитать итоги источника → отобрать → разложить → записать состав»
// выполняется одной локальной транзакцией репозитория (ApplyStageBuild).
package service

import (
	"context"
	"strings"

	"github.com/hema/server/modules/stage/domain"
)

// ---------------------------------------------------------------------
// Правило отбора (FR-1/FR-6/FR-10).
// ---------------------------------------------------------------------

// SetStageRule задаёт или снимает правило отбора этапа (FR-1/FR-6):
// разрешено только пока состав этапа пуст (ErrRuleLocked) — как у этапа
// без правила (набирается руками), так и у уже сформированного/набранного
// целевого этапа. Пустое правило (rule.IsZero()) снимает правило без
// валидации источника. Непустое правило валидируется
// (SeedingRule.Validate) и проверяет источник: не создаёт цикла источников
// (ErrSourceCycle, спека 0020 FR-4, AC-5 — проверяется раньше позиционного
// гейта, чтобы дать более точную причину отказа), существует, та же
// номинация, тип groups, позиция раньше целевого этапа (иначе
// ErrSourceNotAllowed, AC-21); целевой групповой этап без заданного числа
// групп правило не принимает (ErrInvalidRule, FR-9a, AC-20).
//
// Пересчитывает position этапа от источника (FR-10): источник-этап →
// position(источника)+1 (параллельная ветка, если у источника уже есть
// другая ветка — та же позиция); источник-ростер → 0 (питает первый этап);
// правило снято → MaxStagePosition+1, как при создании без правила —
// регресс-гарантия сценария 0018 (AC-18). Спека 0020 (FR-3) добавляет
// каскад: после записи собственной позиции пересчитывает позиции ВСЕХ
// этапов номинации (cascadeStagePositions) — смена источника одной ветки
// перестраивает уровни всех этапов, что от нее (транзитивно) зависят.
func (s *Service) SetStageRule(ctx context.Context, stageID string, rule domain.SeedingRule) (domain.Stage, error) {
	stageID = strings.TrimSpace(stageID)
	if stageID == "" {
		return domain.Stage{}, domain.ErrInvalidInput
	}
	stage, found, err := s.repo.StageByID(ctx, stageID)
	if err != nil {
		return domain.Stage{}, err
	}
	if !found {
		return domain.Stage{}, domain.ErrNotFound
	}

	if !rule.IsZero() {
		// Метод раскладки клиент не присылает (FR-4) — выводим сам из типа
		// целевого этапа ДО валидации, иначе Validate отклонит правило по
		// пустому Method независимо от остальных полей.
		rule.Method = domain.ResolveMethod(stage.Type == domain.StageTypeBracket)
		if err := rule.Validate(stage.Type == domain.StageTypeBracket); err != nil {
			return domain.Stage{}, err
		}
		if stage.Type == domain.StageTypeGroups && stage.Groups.GroupCount <= 0 {
			return domain.Stage{}, domain.ErrInvalidRule
		}
		if rule.SourceKind == domain.SourceKindStage {
			stages, err := s.repo.StagesByNomination(ctx, stage.NominationID)
			if err != nil {
				return domain.Stage{}, err
			}
			if domain.DetectSourceCycle(stages, stageID, rule.SourceStageID) {
				return domain.Stage{}, domain.ErrSourceCycle
			}
		}
		if err := s.validateRuleSource(ctx, stage, rule); err != nil {
			return domain.Stage{}, err
		}
	}

	empty, err := s.stageComposeEmpty(ctx, stage)
	if err != nil {
		return domain.Stage{}, err
	}
	if !empty {
		return domain.Stage{}, domain.ErrRuleLocked
	}

	position, err := s.resolveStagePosition(ctx, stage.NominationID, rule)
	if err != nil {
		return domain.Stage{}, err
	}
	if err := s.repo.SetSeedingRule(ctx, stageID, rule, position); err != nil {
		return domain.Stage{}, err
	}
	if err := s.cascadeStagePositions(ctx, stage.NominationID); err != nil {
		return domain.Stage{}, err
	}

	updated, found, err := s.repo.StageByID(ctx, stageID)
	if err != nil {
		return domain.Stage{}, err
	}
	if !found {
		return domain.Stage{}, domain.ErrNotFound
	}
	return updated, nil
}

// cascadeStagePositions пересчитывает позиции всех этапов номинации от их
// источников (спека 0020, FR-3) и записывает только те, что реально
// изменились. Вызывается после SetStageRule, когда позиция затронутого
// этапа уже записана в репозиторий — domain.ResolveStagePositions читает
// свежее состояние и распространяет изменение на транзитивных зависимых.
func (s *Service) cascadeStagePositions(ctx context.Context, nominationID string) error {
	stages, err := s.repo.StagesByNomination(ctx, nominationID)
	if err != nil {
		return err
	}
	resolved, err := domain.ResolveStagePositions(stages)
	if err != nil {
		return err
	}
	updates := make(map[string]int)
	for _, st := range stages {
		if pos, ok := resolved[st.ID]; ok && pos != st.Position {
			updates[st.ID] = pos
		}
	}
	if len(updates) == 0 {
		return nil
	}
	return s.repo.SetStagePositions(ctx, updates)
}

// validateRuleSource проверяет источник-этап правила (FR-2, AC-21):
// найден, та же номинация, не сам целевой этап, тип groups, позиция раньше
// целевого этапа (по его текущей, ещё не пересчитанной позиции). Для
// источника-ростера — no-op (у ростера нет своего этапа).
func (s *Service) validateRuleSource(ctx context.Context, target domain.Stage, rule domain.SeedingRule) error {
	if rule.SourceKind != domain.SourceKindStage {
		return nil
	}
	src, found, err := s.repo.StageByID(ctx, rule.SourceStageID)
	if err != nil {
		return err
	}
	if !found || src.ID == target.ID || src.NominationID != target.NominationID ||
		src.Type != domain.StageTypeGroups || src.Position >= target.Position {
		return domain.ErrSourceNotAllowed
	}
	return nil
}

// resolveStagePosition вычисляет позицию этапа от его правила (FR-10):
// источник-этап → position(источника)+1; источник-ростер → 0; правила нет
// → MaxStagePosition(номинации)+1, как при создании явного этапа без
// правила (0018, FR-2) — так этап без правила по-прежнему встаёт следующим
// по порядку, а не занимает позицию 0 (регресс-гарантия AC-18).
func (s *Service) resolveStagePosition(ctx context.Context, nominationID string, rule domain.SeedingRule) (int, error) {
	switch rule.SourceKind {
	case domain.SourceKindStage:
		src, found, err := s.repo.StageByID(ctx, rule.SourceStageID)
		if err != nil {
			return 0, err
		}
		if !found {
			return 0, domain.ErrSourceNotAllowed
		}
		return src.Position + 1, nil
	case domain.SourceKindRoster:
		return 0, nil
	default:
		maxPos, err := s.repo.MaxStagePosition(ctx, nominationID)
		if err != nil {
			return 0, err
		}
		return maxPos + 1, nil
	}
}

// stageComposeEmpty — «состав этапа пуст» (FR-6/FR-18): ни одного членства
// в контейнерах ЭТОГО этапа. Единый гейт для groups (нет посаженных бойцов
// в его пулах) и bracket (нет посева — членство со slot > 0 тоже membership,
// MembersByStage не различает slot).
func (s *Service) stageComposeEmpty(ctx context.Context, stage domain.Stage) (bool, error) {
	members, err := s.repo.MembersByStage(ctx, stage.ID)
	if err != nil {
		return false, err
	}
	return len(members) == 0, nil
}

// ---------------------------------------------------------------------
// Превью и формирование (FR-13..FR-22).
// ---------------------------------------------------------------------

// computeStageBuildPlan прогоняет весь конвейер отбора (FR-15): источник →
// SelectByRule → пересечение с параллельными ветками (FR-11) → раскладка в
// целевой этап (FR-4). Результат — общий для PreviewStageBuild (показ) и
// BuildStage (применение через Groups/Seeds), считается ровно один раз на
// вызов, чтобы показанное превью и то, что реально применяется, не могли
// разойтись. Вызывающий уже проверил, что у этапа есть правило
// (ErrNoSeedingRule).
func (s *Service) computeStageBuildPlan(ctx context.Context, stage domain.Stage, ties []domain.TieResolution) (domain.StageBuildPreview, error) {
	groups, sourceUnfinished, err := s.sourceGroupsForRule(ctx, stage.Rule)
	if err != nil {
		return domain.StageBuildPreview{}, err
	}
	active, err := s.fighters.ActiveFightersByNomination(ctx, stage.NominationID)
	if err != nil {
		return domain.StageBuildPreview{}, err
	}

	selected, tieAsks, err := domain.SelectByRule(stage.Rule, groups, active, ties)
	if err != nil {
		return domain.StageBuildPreview{}, err
	}
	for i := range selected {
		if selected[i].OriginLabel == "" {
			selected[i].OriginLabel = "Ростер номинации"
		}
	}

	overlaps, err := s.selectorOverlaps(ctx, stage, selected)
	if err != nil {
		return domain.StageBuildPreview{}, err
	}
	unselected := s.unselectedFor(stage.Rule, groups, active, selected)

	preview := domain.StageBuildPreview{
		Entries: selected, Ties: tieAsks, Overlaps: overlaps, Unselected: unselected,
		SourceUnfinishedBouts: sourceUnfinished,
	}
	if stage.Type == domain.StageTypeBracket {
		preview.Capacity = stage.Bracket.Size
		fitting := selected
		if preview.Capacity > 0 && len(selected) > preview.Capacity {
			fitting = selected[:preview.Capacity]
		}
		seeds, err := domain.PlanBracketSeeds(fitting, stage.Bracket)
		if err != nil {
			return domain.StageBuildPreview{}, err
		}
		preview.Seeds = seeds
	} else {
		// Групповой целевой этап не имеет жёсткой вместимости (FR-19
		// ограничивает только сетку — «слотов сетки»): Capacity=0 сигналит
		// «без ограничения», гейт ErrCapacityExceeded в BuildStage
		// проверяется только для type=bracket.
		preview.Groups = domain.PlanGroupAssignments(selected, stage.Groups.GroupCount)
	}
	return preview, nil
}

// sourceGroupsForRule читает итоги источника-этапа (FR-2): пулы + их
// итоговые таблицы (0016, ComputeStandings — переиспользуется как есть,
// вместе с решением 0016 не показывать таблицу без единого завершённого
// боя, FR-7 той спеки) через loadLayout (та же обогащённая проекция, что и
// у GetLayout: активные бойцы, статус, Standings). Источник-ростер не
// группируется — единственный элемент нет ни groups, ни незавершённых боёв.
func (s *Service) sourceGroupsForRule(ctx context.Context, rule domain.SeedingRule) ([]domain.SourceGroup, int, error) {
	if rule.SourceKind != domain.SourceKindStage {
		return nil, 0, nil
	}
	layout, err := s.loadLayout(ctx, rule.SourceStageID)
	if err != nil {
		return nil, 0, err
	}
	groups := make([]domain.SourceGroup, 0, len(layout.Pools))
	unfinished := 0
	for _, p := range layout.Pools {
		groups = append(groups, domain.SourceGroup{PoolID: p.ID, Label: p.Name, Standings: p.Standings})
		total, _, finished, err := s.bouts.PoolProgress(ctx, p.ID)
		if err != nil {
			return nil, 0, err
		}
		unfinished += total - finished
	}
	return groups, unfinished, nil
}

// selectorOverlaps проверяет пересечение отобранных с параллельными
// ветками того же источника-этапа (FR-11, AC-3): для каждой ветки,
// ссылающейся на тот же source_stage_id (кроме самого stage), пересчитывает
// её отбор (свежие ties той ветки не передаются — незакрытый дележ там
// просто сужает её текущий отбор, консервативно) и берёт пересечение по
// FighterRef.ID. Источник-ростер вне скоупа этой проверки (ADR 0014/план,
// «Риски»): порт StagesBySource адресован по source_stage_id, у ростера
// такого адреса нет — заявленные схемы (двойной плейофф/двойная сетка
// групп) используют только источник-этап.
func (s *Service) selectorOverlaps(ctx context.Context, stage domain.Stage, selected []domain.SelectedFighter) ([]domain.FighterRef, error) {
	if stage.Rule.SourceKind != domain.SourceKindStage {
		return nil, nil
	}
	siblings, err := s.repo.StagesBySource(ctx, stage.Rule.SourceStageID)
	if err != nil {
		return nil, err
	}
	seen := make(map[string]domain.FighterRef)
	for _, sib := range siblings {
		if sib.ID == stage.ID || sib.Rule.IsZero() {
			continue
		}
		sibGroups, _, err := s.sourceGroupsForRule(ctx, sib.Rule)
		if err != nil {
			return nil, err
		}
		sibActive, err := s.fighters.ActiveFightersByNomination(ctx, sib.NominationID)
		if err != nil {
			return nil, err
		}
		sibSelected, _, err := domain.SelectByRule(sib.Rule, sibGroups, sibActive, nil)
		if err != nil {
			return nil, err
		}
		for _, f := range domain.Overlap(selected, sibSelected) {
			seen[f.ID] = f
		}
	}
	if len(seen) == 0 {
		return nil, nil
	}
	out := make([]domain.FighterRef, 0, len(seen))
	for _, f := range seen {
		out = append(out, f)
	}
	return out, nil
}

// unselectedFor — участники источника, не попавшие в эту ветку (FR-15):
// для источника-ростера — активный ростер номинации целиком минус
// отобранные (первый этап питается от всех); для источника-этапа —
// активные участники ЕГО ГРУПП (не вся номинация — соседняя параллельная
// ветка того же источника не в счёт), минус отобранные.
func (s *Service) unselectedFor(rule domain.SeedingRule, groups []domain.SourceGroup, active []domain.FighterRef, selected []domain.SelectedFighter) []domain.FighterRef {
	selectedSet := make(map[string]bool, len(selected))
	for _, sf := range selected {
		selectedSet[sf.Fighter.ID] = true
	}
	if rule.SourceKind == domain.SourceKindRoster {
		out := make([]domain.FighterRef, 0, len(active))
		for _, f := range active {
			if !selectedSet[f.ID] {
				out = append(out, f)
			}
		}
		return out
	}
	activeSet := make(map[string]bool, len(active))
	for _, f := range active {
		activeSet[f.ID] = true
	}
	overall := domain.ComputeOverallOrder(groups)
	out := make([]domain.FighterRef, 0, len(overall))
	for _, sf := range overall {
		if activeSet[sf.Fighter.ID] && !selectedSet[sf.Fighter.ID] {
			out = append(out, sf.Fighter)
		}
	}
	return out
}

// PreviewStageBuild считает, кто будет отобран текущим правилом этапа и
// куда каждый попадёт, без применения (FR-15): требует установленного
// правила (ErrNoSeedingRule). ties — ответы организатора на дележи,
// разрешённые в предыдущем вызове того же формирования (FR-22, FR-24, не
// персистируются).
func (s *Service) PreviewStageBuild(ctx context.Context, stageID string, ties []domain.TieResolution) (domain.StageBuildPreview, error) {
	stageID = strings.TrimSpace(stageID)
	if stageID == "" {
		return domain.StageBuildPreview{}, domain.ErrInvalidInput
	}
	stage, found, err := s.repo.StageByID(ctx, stageID)
	if err != nil {
		return domain.StageBuildPreview{}, err
	}
	if !found {
		return domain.StageBuildPreview{}, domain.ErrNotFound
	}
	if stage.Rule.IsZero() {
		return domain.StageBuildPreview{}, domain.ErrNoSeedingRule
	}
	return s.computeStageBuildPlan(ctx, stage, ties)
}

// BuildStage применяет план последнего PreviewStageBuild этого же вызова
// (FR-16): заполняет состав целевого этапа (группы — автораспределением,
// сетку — посевом) и оставляет этап в черновике — фиксация и бои остаются
// отдельными существующими действиями (0009 FR-9, 0018 FR-10). Отклоняется,
// если правила нет (ErrNoSeedingRule), состав уже не пуст (ErrStageNotEmpty,
// FR-18), остались непокрытые дележи (ErrTieUnresolved, FR-22), селектор
// пересекается с параллельной веткой (ErrSelectorOverlap, FR-11) или
// отобранных больше вместимости сетки (ErrCapacityExceeded, FR-19, только
// для type=bracket — у групп вместимости нет).
//
// Возвращает ровно один из двух: Layout (целевой этап — группы) либо
// Bracket (целевой этап — сетка); второе значение остаётся нулевым.
func (s *Service) BuildStage(ctx context.Context, stageID string, ties []domain.TieResolution) (domain.Layout, domain.Bracket, error) {
	stageID = strings.TrimSpace(stageID)
	if stageID == "" {
		return domain.Layout{}, domain.Bracket{}, domain.ErrInvalidInput
	}
	stage, found, err := s.repo.StageByID(ctx, stageID)
	if err != nil {
		return domain.Layout{}, domain.Bracket{}, err
	}
	if !found {
		return domain.Layout{}, domain.Bracket{}, domain.ErrNotFound
	}
	if stage.Rule.IsZero() {
		return domain.Layout{}, domain.Bracket{}, domain.ErrNoSeedingRule
	}

	empty, err := s.stageComposeEmpty(ctx, stage)
	if err != nil {
		return domain.Layout{}, domain.Bracket{}, err
	}
	if !empty {
		return domain.Layout{}, domain.Bracket{}, domain.ErrStageNotEmpty
	}

	plan, err := s.computeStageBuildPlan(ctx, stage, ties)
	if err != nil {
		return domain.Layout{}, domain.Bracket{}, err
	}
	if len(plan.Overlaps) > 0 {
		return domain.Layout{}, domain.Bracket{}, domain.ErrSelectorOverlap
	}
	if len(plan.Ties) > 0 {
		return domain.Layout{}, domain.Bracket{}, domain.ErrTieUnresolved
	}
	if stage.Type == domain.StageTypeBracket && len(plan.Entries) > plan.Capacity {
		return domain.Layout{}, domain.Bracket{}, domain.ErrCapacityExceeded
	}

	if err := s.repo.ApplyStageBuild(ctx, stageID, plan.Groups, plan.Seeds); err != nil {
		return domain.Layout{}, domain.Bracket{}, err
	}

	if stage.Type == domain.StageTypeBracket {
		if err := s.syncBracketRegistration(ctx, stage.NominationID); err != nil {
			return domain.Layout{}, domain.Bracket{}, err
		}
		s.liveBus.PublishNominationChanged(stage.NominationID)
		bracket, err := s.buildBracket(ctx, stage, true)
		return domain.Layout{}, bracket, err
	}

	layout, err := s.loadLayoutAndSync(ctx, stageID)
	if err != nil {
		return domain.Layout{}, domain.Bracket{}, err
	}
	s.liveBus.PublishNominationChanged(stage.NominationID)
	return layout, domain.Bracket{}, nil
}
