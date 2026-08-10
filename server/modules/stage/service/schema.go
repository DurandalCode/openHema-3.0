// Package service — спека 0020: конструктор схемы номинации + пресеты
// формата (ADR 0014 §8/§9). Редактирование конфига уже созданного этапа
// (FR-2), пресеты как отпечаток схемы (FR-11/FR-12) и применение формата —
// один и тот же путь для «применить пресет» и «скопировать схему из
// номинации» (FR-13/FR-15) — живут здесь; схема и её исполнение остаются в
// одном модуле (ADR 0014 §8).
package service

import (
	"context"
	"strings"

	"github.com/hema/server/modules/stage/domain"
)

// ---------------------------------------------------------------------
// Редактирование этапа (FR-2/FR-7).
// ---------------------------------------------------------------------

// UpdateStage правит название и конфиг уже созданного этапа (спека 0020,
// FR-2): название — всегда, конфиг (bracket у сетки, groups у группового
// этапа) — только если он реально изменился, и только пока этап в draft и
// состав пуст (ErrStageLocked). Тип этапа не принимается — сменить его
// нечем: конфиг проверяется по уже сохранённому Stage.Type. Число групп
// «не задано» (0) — законное значение для группового этапа (FR-7), но
// обнулить его нельзя, пока у этапа есть правило отбора (ErrInvalidRule —
// инвариант 0019 FR-9a сохраняется), — эта проверка выполняется до записи.
func (s *Service) UpdateStage(ctx context.Context, stageID, title string, bracket domain.BracketConfig, groups domain.GroupsConfig) (domain.Stage, error) {
	stageID = strings.TrimSpace(stageID)
	title = strings.TrimSpace(title)
	if stageID == "" || title == "" {
		return domain.Stage{}, domain.ErrInvalidInput
	}
	stage, found, err := s.repo.StageByID(ctx, stageID)
	if err != nil {
		return domain.Stage{}, err
	}
	if !found {
		return domain.Stage{}, domain.ErrNotFound
	}

	switch stage.Type {
	case domain.StageTypeBracket:
		if !domain.ValidBracketSize(bracket.Size) || groups.GroupCount != 0 {
			return domain.Stage{}, domain.ErrInvalidInput
		}
	case domain.StageTypeGroups:
		if groups.GroupCount < 0 || bracket != (domain.BracketConfig{}) {
			return domain.Stage{}, domain.ErrInvalidInput
		}
	default:
		return domain.Stage{}, domain.ErrInvalidInput
	}

	if bracket != stage.Bracket || groups != stage.Groups {
		if stage.Status != domain.LayoutDraft {
			return domain.Stage{}, domain.ErrStageLocked
		}
		empty, err := s.stageComposeEmpty(ctx, stage)
		if err != nil {
			return domain.Stage{}, err
		}
		if !empty {
			return domain.Stage{}, domain.ErrStageLocked
		}
		if stage.Type == domain.StageTypeGroups && groups.GroupCount <= 0 && !stage.Rule.IsZero() {
			return domain.Stage{}, domain.ErrInvalidRule
		}
	}

	if err := s.repo.UpdateStage(ctx, stageID, title, bracket, groups); err != nil {
		return domain.Stage{}, err
	}
	updated, found, err := s.repo.StageByID(ctx, stageID)
	if err != nil {
		return domain.Stage{}, err
	}
	if !found {
		return domain.Stage{}, domain.ErrNotFound
	}
	s.liveBus.PublishNominationChanged(updated.NominationID)
	if err := s.syncNomination(ctx, updated.NominationID); err != nil {
		return domain.Stage{}, err
	}
	return updated, nil
}

// ---------------------------------------------------------------------
// Пресеты формата (FR-11/FR-12).
// ---------------------------------------------------------------------

// SaveFormatPreset сохраняет схему номинации как именованный пресет (FR-11/
// FR-12): отпечаток схемы на момент вызова (копия по значению, FR-16), не
// живая ссылка — дальнейшие правки схемы номинации пресет не затрагивают.
// Номинация без единого материализованного этапа (0017, FR-4 — виртуальный
// авто-этап, строки в БД ещё нет) даёт пустую спецификацию —
// ErrInvalidSpec: сохранять нечего.
func (s *Service) SaveFormatPreset(ctx context.Context, name, nominationID string) (domain.FormatPreset, error) {
	name = strings.TrimSpace(name)
	nominationID = strings.TrimSpace(nominationID)
	if name == "" || nominationID == "" {
		return domain.FormatPreset{}, domain.ErrInvalidInput
	}
	stages, err := s.repo.StagesByNomination(ctx, nominationID)
	if err != nil {
		return domain.FormatPreset{}, err
	}
	spec := domain.SpecFromStages(stages)
	if err := domain.ValidateFormatSpec(spec); err != nil {
		return domain.FormatPreset{}, err
	}
	return s.repo.InsertFormatPreset(ctx, name, spec)
}

// ListFormatPresets возвращает библиотеку пресетов целиком (FR-12).
func (s *Service) ListFormatPresets(ctx context.Context) ([]domain.FormatPreset, error) {
	return s.repo.ListFormatPresets(ctx)
}

// RenameFormatPreset переименовывает пресет, не трогая его схему и уже
// применённые к номинациям копии (FR-12/FR-16).
func (s *Service) RenameFormatPreset(ctx context.Context, presetID, name string) (domain.FormatPreset, error) {
	presetID = strings.TrimSpace(presetID)
	name = strings.TrimSpace(name)
	if presetID == "" || name == "" {
		return domain.FormatPreset{}, domain.ErrInvalidInput
	}
	return s.repo.RenameFormatPreset(ctx, presetID, name)
}

// DeleteFormatPreset удаляет пресет из библиотеки; номинации, к которым он
// уже применялся, не затрагивает (FR-16).
func (s *Service) DeleteFormatPreset(ctx context.Context, presetID string) error {
	presetID = strings.TrimSpace(presetID)
	if presetID == "" {
		return domain.ErrInvalidInput
	}
	return s.repo.DeleteFormatPreset(ctx, presetID)
}

// ---------------------------------------------------------------------
// Применение формата (FR-13/FR-14/FR-15).
// ---------------------------------------------------------------------

// ApplyFormat заменяет схему номинации целиком — источником спецификации
// служит либо пресет библиотеки (presetID), либо схема другой номинации
// (sourceNominationID) — копирование и применение пресета проходят один и
// тот же путь, отличаясь только сбором FormatSpec на входе (FR-13/FR-15).
// Разрешено, только если схема номинации не тронута: нет членств, ни один
// пул не стоит на арене, не начато ни одного боя (три отдельные проверки —
// пустой состав необходим, но не достаточен, план «Риски») — иначе
// ErrSchemaNotEmpty (FR-14). Атомарно на уровне ReplaceSchema (NFR-1).
func (s *Service) ApplyFormat(ctx context.Context, nominationID, presetID, sourceNominationID string) ([]domain.Stage, error) {
	nominationID = strings.TrimSpace(nominationID)
	presetID = strings.TrimSpace(presetID)
	sourceNominationID = strings.TrimSpace(sourceNominationID)
	if nominationID == "" {
		return nil, domain.ErrInvalidInput
	}
	if (presetID == "") == (sourceNominationID == "") {
		// Ровно один источник должен быть задан — ни оба, ни ни один.
		return nil, domain.ErrInvalidInput
	}
	if sourceNominationID != "" && sourceNominationID == nominationID {
		return nil, domain.ErrInvalidInput
	}

	var spec domain.FormatSpec
	if presetID != "" {
		preset, found, err := s.repo.GetFormatPreset(ctx, presetID)
		if err != nil {
			return nil, err
		}
		if !found {
			return nil, domain.ErrNotFound
		}
		spec = preset.Spec
	} else {
		donorStages, err := s.repo.StagesByNomination(ctx, sourceNominationID)
		if err != nil {
			return nil, err
		}
		spec = domain.SpecFromStages(donorStages)
	}
	if err := domain.ValidateFormatSpec(spec); err != nil {
		return nil, err
	}

	if err := s.gateSchemaEmpty(ctx, nominationID); err != nil {
		return nil, err
	}
	poolIDs, err := s.poolIDsForNomination(ctx, nominationID)
	if err != nil {
		return nil, err
	}
	if err := s.bouts.ClearForPools(ctx, poolIDs); err != nil {
		return nil, err
	}

	positions := resolveApplyPositions(spec)
	if _, err := s.repo.ReplaceSchema(ctx, nominationID, spec.Stages, positions); err != nil {
		return nil, err
	}
	// cascadeStagePositions — консистентность на всякий случай (защитная
	// повторная проверка тем же путём, что и SetStageRule): resolveApplyPositions
	// уже сама воспроизводит domain.ResolveStagePositions, реальных дельт не
	// ожидается.
	if err := s.cascadeStagePositions(ctx, nominationID); err != nil {
		return nil, err
	}
	if err := s.syncBracketRegistration(ctx, nominationID); err != nil {
		return nil, err
	}
	s.liveBus.PublishNominationChanged(nominationID)

	return s.repo.StagesByNomination(ctx, nominationID)
}

// gateSchemaEmpty — «схема номинации не тронута» (FR-13/FR-14): ни одного
// членства по всем этапам номинации, ни один пул не стоит на арене, не
// начато ни одного боя. Три отдельные проверки, а не одна: пустой состав —
// необходимое, но не единственное условие (пул без бойцов теоретически мог
// быть поставлен на арену либо получить начатый бой — молча сносить такое
// нельзя).
func (s *Service) gateSchemaEmpty(ctx context.Context, nominationID string) error {
	memberCount, err := s.repo.MembersCountByNomination(ctx, nominationID)
	if err != nil {
		return err
	}
	if memberCount > 0 {
		return domain.ErrSchemaNotEmpty
	}

	stages, err := s.repo.StagesByNomination(ctx, nominationID)
	if err != nil {
		return err
	}
	for _, st := range stages {
		seated, err := s.repo.AnySeatedInStage(ctx, st.ID)
		if err != nil {
			return err
		}
		if seated {
			return domain.ErrSchemaNotEmpty
		}
	}

	poolIDs, err := s.poolIDsForNomination(ctx, nominationID)
	if err != nil {
		return err
	}
	started, err := s.bouts.AnyStartedInPools(ctx, poolIDs)
	if err != nil {
		return err
	}
	if started {
		return domain.ErrSchemaNotEmpty
	}
	return nil
}

// poolIDsForNomination собирает id всех пулов номинации по всем её этапам —
// вход AnyStartedInPools/ClearForPools (симметрично тому, что делает
// service.DeleteStage для одного этапа).
func (s *Service) poolIDsForNomination(ctx context.Context, nominationID string) ([]string, error) {
	pools, err := s.repo.PoolsByNomination(ctx, nominationID)
	if err != nil {
		return nil, err
	}
	return poolIDsOf(pools), nil
}

// resolveApplyPositions вычисляет позиции этапов спецификации симуляцией
// последовательного создания (ADR 0014 §1, FR-8a, AC-22) — а не нумерацией
// по индексу: этап с источником-этапом получает position(источника)+1, с
// источником-ростером — 0, БЕЗ правила — max(уже назначенных)+1, ровно та
// же семантика, что MaxStagePosition+1 у CreateStage без правила (0018,
// FR-2). Порядок spec.Stages уже гарантирует, что источник стоит раньше
// своей ветки (ValidateFormatSpec: SourceIndex < i), поэтому позиция
// источника на момент обращения всегда уже вычислена.
func resolveApplyPositions(spec domain.FormatSpec) []int {
	positions := make([]int, len(spec.Stages))
	maxPos := -1
	for i, st := range spec.Stages {
		var pos int
		switch st.SourceKind {
		case domain.SourceKindStage:
			pos = positions[st.SourceIndex] + 1
		case domain.SourceKindRoster:
			pos = 0
		default:
			pos = maxPos + 1
		}
		positions[i] = pos
		if pos > maxPos {
			maxPos = pos
		}
	}
	return positions
}
