// Тесты юзкейсов переходов между этапами (спека 0019, T9-T11): правило
// отбора, превью формирования, формирование, откат, гейты создания/удаления
// этапа.
package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/hema/server/modules/stage/domain"
)

// ---------------------------------------------------------------------
// T9: SetStageRule.
// ---------------------------------------------------------------------

func allFromRosterRule() domain.SeedingRule {
	return domain.SeedingRule{
		SourceKind: domain.SourceKindRoster,
		Selector:   domain.SelectorKindAll,
		Method:     domain.LayoutMethodSnake,
	}
}

func groupPlacesRule(sourceStageID string, from, to int) domain.SeedingRule {
	return domain.SeedingRule{
		SourceKind:    domain.SourceKindStage,
		SourceStageID: sourceStageID,
		Selector:      domain.SelectorKindGroupPlaces,
		PlaceFrom:     from,
		PlaceTo:       to,
		Method:        domain.LayoutMethodSeeded,
	}
}

func TestSetStageRule_T9_SetsRuleAndRepositionsFromStageSource(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, _ := newService()
	fighters.Set("n1")

	sourceID := stageIDFor(t, repo, "n1") // авто-этап, position=0

	target, err := repo.CreateStage(ctx, "n1", 5, "Плейофф", domain.StageTypeBracket,
		domain.BracketConfig{Size: 8}, domain.GroupsConfig{}, domain.SeedingRule{})
	if err != nil {
		t.Fatalf("seed target: %v", err)
	}

	rule := groupPlacesRule(sourceID, 1, 2)
	updated, err := svc.SetStageRule(ctx, target.ID, rule)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if updated.Rule != rule {
		t.Fatalf("expected rule %+v, got %+v", rule, updated.Rule)
	}
	if updated.Position != 1 {
		t.Fatalf("expected position = source.Position(0)+1 = 1, got %d", updated.Position)
	}
}

func TestSetStageRule_T9_RosterSourcePositionsAtZero(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, _ := newService()
	fighters.Set("n1")

	target, err := repo.CreateStage(ctx, "n1", 3, "Отбор", domain.StageTypeGroups,
		domain.BracketConfig{}, domain.GroupsConfig{GroupCount: 2}, domain.SeedingRule{})
	if err != nil {
		t.Fatalf("seed target: %v", err)
	}

	updated, err := svc.SetStageRule(ctx, target.ID, allFromRosterRule())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if updated.Position != 0 {
		t.Fatalf("expected position 0 for roster source, got %d", updated.Position)
	}
}

func TestSetStageRule_T9_ClearingRuleFallsBackToMaxPlusOne(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, _ := newService()
	fighters.Set("n1")

	sourceID := stageIDFor(t, repo, "n1") // position 0
	target, err := repo.CreateStage(ctx, "n1", 1, "Плейофф", domain.StageTypeBracket,
		domain.BracketConfig{Size: 8}, domain.GroupsConfig{}, groupPlacesRule(sourceID, 1, 2))
	if err != nil {
		t.Fatalf("seed target: %v", err)
	}

	// Снимаем правило (пустой SeedingRule) — регресс-гарантия 0018 (AC-18):
	// этап без правила встаёт под MaxStagePosition+1, а не под 0 (FR-10).
	updated, err := svc.SetStageRule(ctx, target.ID, domain.SeedingRule{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !updated.Rule.IsZero() {
		t.Fatalf("expected rule cleared, got %+v", updated.Rule)
	}
	maxPos, err := repo.MaxStagePosition(ctx, "n1")
	if err != nil {
		t.Fatalf("MaxStagePosition: %v", err)
	}
	if updated.Position != maxPos {
		t.Fatalf("expected position = MaxStagePosition (already this stage) = %d, got %d", maxPos, updated.Position)
	}
}

func TestSetStageRule_T9_ErrRuleLocked_WhenComposed(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, _ := newService()
	fighters.Set("n1", domain.FighterRef{ID: "f1"})

	sourceID := stageIDFor(t, repo, "n1")
	target, err := repo.CreateStage(ctx, "n1", 1, "Плейофф", domain.StageTypeBracket,
		domain.BracketConfig{Size: 8}, domain.GroupsConfig{}, domain.SeedingRule{})
	if err != nil {
		t.Fatalf("seed target: %v", err)
	}
	if repo.SeedPoolInStage(target.ID, 1, "f1") == "" {
		t.Fatalf("seed pool in target failed")
	}

	if _, err := svc.SetStageRule(ctx, target.ID, groupPlacesRule(sourceID, 1, 2)); !errors.Is(err, domain.ErrRuleLocked) {
		t.Fatalf("expected ErrRuleLocked, got %v", err)
	}
}

func TestSetStageRule_T9_ErrInvalidRule_GroupTargetWithoutGroupCount(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, _ := newService()
	fighters.Set("n1")

	groupsStageID := stageIDFor(t, repo, "n1") // авто-этап: GroupCount=0 (FR-9)

	if _, err := svc.SetStageRule(ctx, groupsStageID, allFromRosterRule()); !errors.Is(err, domain.ErrInvalidRule) {
		t.Fatalf("expected ErrInvalidRule (FR-9a), got %v", err)
	}
}

func TestSetStageRule_T9_ErrSourceNotAllowed(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, _ := newService()
	fighters.Set("n1")
	fighters.Set("n2")

	_ = stageIDFor(t, repo, "n1") // авто-этап n1, position 0 (не источник в этом тесте)
	groupsN2 := stageIDFor(t, repo, "n2")

	bracketStage, err := repo.CreateStage(ctx, "n1", 2, "Сетка", domain.StageTypeBracket,
		domain.BracketConfig{Size: 8}, domain.GroupsConfig{}, domain.SeedingRule{})
	if err != nil {
		t.Fatalf("seed bracket: %v", err)
	}
	target, err := repo.CreateStage(ctx, "n1", 3, "Цель", domain.StageTypeBracket,
		domain.BracketConfig{Size: 8}, domain.GroupsConfig{}, domain.SeedingRule{})
	if err != nil {
		t.Fatalf("seed target: %v", err)
	}
	laterGroups, err := repo.CreateStage(ctx, "n1", 4, "Позже", domain.StageTypeGroups,
		domain.BracketConfig{}, domain.GroupsConfig{GroupCount: 2}, domain.SeedingRule{})
	if err != nil {
		t.Fatalf("seed later groups: %v", err)
	}

	cases := []struct {
		name string
		rule domain.SeedingRule
	}{
		{"not found", groupPlacesRule("missing", 1, 2)},
		{"different nomination", groupPlacesRule(groupsN2, 1, 2)},
		{"source is bracket", groupPlacesRule(bracketStage.ID, 1, 2)},
		{"source positioned after target", groupPlacesRule(laterGroups.ID, 1, 2)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := svc.SetStageRule(ctx, target.ID, tc.rule); !errors.Is(err, domain.ErrSourceNotAllowed) {
				t.Fatalf("expected ErrSourceNotAllowed, got %v", err)
			}
		})
	}
}

func TestSetStageRule_T9_ErrInvalidRule_MalformedRule(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, _ := newService()
	fighters.Set("n1")

	target, err := repo.CreateStage(ctx, "n1", 1, "Плейофф", domain.StageTypeBracket,
		domain.BracketConfig{Size: 8}, domain.GroupsConfig{}, domain.SeedingRule{})
	if err != nil {
		t.Fatalf("seed target: %v", err)
	}

	bad := domain.SeedingRule{SourceKind: domain.SourceKindRoster, Selector: domain.SelectorKindGroupPlaces}
	if _, err := svc.SetStageRule(ctx, target.ID, bad); !errors.Is(err, domain.ErrInvalidRule) {
		t.Fatalf("expected ErrInvalidRule, got %v", err)
	}
}

func TestSetStageRule_T9_NotFound(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, _ := newService()

	if _, err := svc.SetStageRule(ctx, "missing", allFromRosterRule()); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestSetStageRule_T9_EmptyStageID(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, _ := newService()

	if _, err := svc.SetStageRule(ctx, "", allFromRosterRule()); !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput, got %v", err)
	}
}
