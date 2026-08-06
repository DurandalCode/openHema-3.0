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
// (SeedingRule.Validate) и проверяет источник: существует, та же
// номинация, тип groups, позиция раньше целевого этапа (иначе
// ErrSourceNotAllowed, AC-21); целевой групповой этап без заданного числа
// групп правило не принимает (ErrInvalidRule, FR-9a, AC-20).
//
// Пересчитывает position этапа от источника (FR-10): источник-этап →
// position(источника)+1 (параллельная ветка, если у источника уже есть
// другая ветка — та же позиция); источник-ростер → 0 (питает первый этап);
// правило снято → MaxStagePosition+1, как при создании без правила —
// регресс-гарантия сценария 0018 (AC-18).
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
		if err := rule.Validate(stage.Type == domain.StageTypeBracket); err != nil {
			return domain.Stage{}, err
		}
		if stage.Type == domain.StageTypeGroups && stage.Groups.GroupCount <= 0 {
			return domain.Stage{}, domain.ErrInvalidRule
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

	updated, found, err := s.repo.StageByID(ctx, stageID)
	if err != nil {
		return domain.Stage{}, err
	}
	if !found {
		return domain.Stage{}, domain.ErrNotFound
	}
	return updated, nil
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
