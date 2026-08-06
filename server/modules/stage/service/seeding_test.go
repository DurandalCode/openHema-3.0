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

// ---------------------------------------------------------------------
// T10/T11: PreviewStageBuild / BuildStage. Общие хелперы построения
// источника (групповой этап с результатами боёв).
// ---------------------------------------------------------------------

func fref(id string) domain.FighterRef { return domain.FighterRef{ID: id} }

func finished(poolID string, a, b domain.FighterRef, scoreA, scoreB int) domain.BoutRef {
	return domain.BoutRef{
		ID: poolID + "-" + a.ID + "-" + b.ID, FighterA: a, FighterB: b,
		State: domain.BoutStateFinished, ScoreA: scoreA, ScoreB: scoreB,
	}
}

// seedGroupOfThree — сажает трёх бойцов в пул number этапа stageID и
// проводит между ними круговую систему так, что fighters[0] занимает
// 1-е место, fighters[1] — 2-е, fighters[2] — 3-е (детерминированно).
func seedGroupOfThree(repo interface {
	SeedPoolInStage(stageID string, number int, fighterIDs ...string) string
}, bouts seedBoutSetter, stageID string, number int, fighters [3]domain.FighterRef) string {
	poolID := repo.SeedPoolInStage(stageID, number, fighters[0].ID, fighters[1].ID, fighters[2].ID)
	bouts.SeedBout(poolID, finished(poolID, fighters[0], fighters[1], 5, 2))
	bouts.SeedBout(poolID, finished(poolID, fighters[0], fighters[2], 5, 1))
	bouts.SeedBout(poolID, finished(poolID, fighters[1], fighters[2], 4, 2))
	return poolID
}

// seedBoutSetter — минимальный интерфейс FakeBoutConductor, нужный
// хелперам сидирования (SeedBout).
type seedBoutSetter interface {
	SeedBout(poolID string, b domain.BoutRef)
}

func TestPreviewStageBuild_T10_ErrNoSeedingRule(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, _ := newService()
	fighters.Set("n1")
	stageID := stageIDFor(t, repo, "n1")

	if _, err := svc.PreviewStageBuild(ctx, stageID, nil); !errors.Is(err, domain.ErrNoSeedingRule) {
		t.Fatalf("expected ErrNoSeedingRule, got %v", err)
	}
}

func TestPreviewStageBuild_T10_GroupPlacesIntoBracket(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, bouts, _ := newService()

	f1, f2, f3 := fref("f1"), fref("f2"), fref("f3")
	f4, f5, f6 := fref("f4"), fref("f5"), fref("f6")
	fighters.Set("n1", f1, f2, f3, f4, f5, f6)

	sourceID := stageIDFor(t, repo, "n1")
	seedGroupOfThree(repo, bouts, sourceID, 1, [3]domain.FighterRef{f1, f2, f3})
	seedGroupOfThree(repo, bouts, sourceID, 2, [3]domain.FighterRef{f4, f5, f6})

	target, err := repo.CreateStage(ctx, "n1", 0, "Плейофф", domain.StageTypeBracket,
		domain.BracketConfig{Size: 4}, domain.GroupsConfig{}, domain.SeedingRule{})
	if err != nil {
		t.Fatalf("seed target: %v", err)
	}
	rule := groupPlacesRule(sourceID, 1, 2)
	if err := repo.SetSeedingRule(ctx, target.ID, rule, 1); err != nil {
		t.Fatalf("seed rule: %v", err)
	}

	preview, err := svc.PreviewStageBuild(ctx, target.ID, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(preview.Entries) != 4 {
		t.Fatalf("expected 4 entries (top-2 of each pool), got %d: %+v", len(preview.Entries), preview.Entries)
	}
	if preview.Capacity != 4 {
		t.Fatalf("expected capacity 4, got %d", preview.Capacity)
	}
	if len(preview.Unselected) != 2 {
		t.Fatalf("expected 2 unselected (3rd place of each pool), got %d: %+v", len(preview.Unselected), preview.Unselected)
	}
	if len(preview.Seeds) != 4 {
		t.Fatalf("expected 4 seed plans, got %d: %+v", len(preview.Seeds), preview.Seeds)
	}
	slots := map[int]bool{}
	seedIDs := map[string]bool{}
	for _, sp := range preview.Seeds {
		if sp.Slot < 1 || sp.Slot > 4 || slots[sp.Slot] {
			t.Fatalf("unexpected/duplicate target slot in seed plan %+v", sp)
		}
		slots[sp.Slot] = true
		seedIDs[sp.FighterID] = true
	}
	selectedIDs := map[string]bool{}
	for _, e := range preview.Entries {
		selectedIDs[e.Fighter.ID] = true
		if e.OriginLabel == "" {
			t.Fatalf("expected non-empty origin label for %+v", e)
		}
		if !seedIDs[e.Fighter.ID] {
			t.Fatalf("entry %+v has no matching seed plan", e)
		}
	}
	for _, id := range []string{"f1", "f2", "f4", "f5"} {
		if !selectedIDs[id] {
			t.Fatalf("expected %s to be selected, got %+v", id, preview.Entries)
		}
	}
	if preview.SourceUnfinishedBouts != 0 {
		t.Fatalf("expected 0 unfinished bouts (source fully played), got %d", preview.SourceUnfinishedBouts)
	}
	if len(preview.Ties) != 0 || len(preview.Overlaps) != 0 {
		t.Fatalf("expected no ties/overlaps, got ties=%+v overlaps=%+v", preview.Ties, preview.Overlaps)
	}
}

func TestPreviewStageBuild_T10_SourceUnfinishedBoutsWarning(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, bouts, _ := newService()

	f1, f2, f3 := fref("f1"), fref("f2"), fref("f3")
	fighters.Set("n1", f1, f2, f3)

	sourceID := stageIDFor(t, repo, "n1")
	poolID := repo.SeedPoolInStage(sourceID, 1, f1.ID, f2.ID, f3.ID)
	bouts.SeedBout(poolID, finished(poolID, f1, f2, 5, 2))
	bouts.SeedBout(poolID, domain.BoutRef{ID: poolID + "-f1-f3", FighterA: f1, FighterB: f3, State: domain.BoutStateNotStarted})
	bouts.SeedBout(poolID, domain.BoutRef{ID: poolID + "-f2-f3", FighterA: f2, FighterB: f3, State: domain.BoutStateNotStarted})

	target, err := repo.CreateStage(ctx, "n1", 0, "Плейофф", domain.StageTypeBracket,
		domain.BracketConfig{Size: 4}, domain.GroupsConfig{}, groupPlacesRule(sourceID, 1, 2))
	if err != nil {
		t.Fatalf("seed target: %v", err)
	}

	preview, err := svc.PreviewStageBuild(ctx, target.ID, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if preview.SourceUnfinishedBouts != 2 {
		t.Fatalf("expected 2 unfinished bouts (FR-14), got %d", preview.SourceUnfinishedBouts)
	}
}

func TestPreviewStageBuild_T10_TieAtBoundary_ResolvedByOrganizer(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, bouts, _ := newService()

	f1, f2, f3 := fref("f1"), fref("f2"), fref("f3")
	fighters.Set("n1", f1, f2, f3)

	sourceID := stageIDFor(t, repo, "n1")
	poolID := repo.SeedPoolInStage(sourceID, 1, f1.ID, f2.ID, f3.ID)
	// f1 обыгрывает обоих; f2 и f3 между собой не встречались (или ничья
	// невозможна в группах — используем неполный круг, где f2/f3 не сыграли,
	// чтобы получить полное равенство 0-0-0 между ними: делят 2-е место).
	bouts.SeedBout(poolID, finished(poolID, f1, f2, 5, 1))
	bouts.SeedBout(poolID, finished(poolID, f1, f3, 5, 1))

	target, err := repo.CreateStage(ctx, "n1", 0, "Плейофф", domain.StageTypeBracket,
		domain.BracketConfig{Size: 4}, domain.GroupsConfig{}, groupPlacesRule(sourceID, 1, 2))
	if err != nil {
		t.Fatalf("seed target: %v", err)
	}

	preview, err := svc.PreviewStageBuild(ctx, target.ID, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(preview.Ties) != 1 {
		t.Fatalf("expected 1 tie at the boundary (f2/f3 share 2nd place), got %+v", preview.Ties)
	}
	tie := preview.Ties[0]
	if tie.SlotsLeft != 1 {
		t.Fatalf("expected 1 slot left in the tie, got %d", tie.SlotsLeft)
	}

	resolved := domain.TieResolution{SourcePoolID: tie.SourcePoolID, Place: tie.Place, FighterIDs: []string{"f2", "f3"}}
	preview2, err := svc.PreviewStageBuild(ctx, target.ID, []domain.TieResolution{resolved})
	if err != nil {
		t.Fatalf("unexpected error after resolution: %v", err)
	}
	if len(preview2.Ties) != 0 {
		t.Fatalf("expected tie resolved, got %+v", preview2.Ties)
	}
	if len(preview2.Entries) != 2 {
		t.Fatalf("expected 2 entries (f1 + f2), got %+v", preview2.Entries)
	}
}

func TestPreviewStageBuild_T10_Overlap(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, bouts, _ := newService()

	f1, f2, f3 := fref("f1"), fref("f2"), fref("f3")
	fighters.Set("n1", f1, f2, f3)

	sourceID := stageIDFor(t, repo, "n1")
	seedGroupOfThree(repo, bouts, sourceID, 1, [3]domain.FighterRef{f1, f2, f3})

	// Обе ветки отбирают «места 1-2» — пересекаются целиком (FR-11, AC-3).
	branchA, err := repo.CreateStage(ctx, "n1", 1, "Сильные", domain.StageTypeBracket,
		domain.BracketConfig{Size: 4}, domain.GroupsConfig{}, groupPlacesRule(sourceID, 1, 2))
	if err != nil {
		t.Fatalf("seed branch A: %v", err)
	}
	branchB, err := repo.CreateStage(ctx, "n1", 1, "Тоже сильные", domain.StageTypeBracket,
		domain.BracketConfig{Size: 4}, domain.GroupsConfig{}, groupPlacesRule(sourceID, 1, 2))
	if err != nil {
		t.Fatalf("seed branch B: %v", err)
	}

	preview, err := svc.PreviewStageBuild(ctx, branchA.ID, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(preview.Overlaps) != 2 {
		t.Fatalf("expected 2 overlapping fighters (f1,f2), got %+v", preview.Overlaps)
	}
	_ = branchB
}

// ---------------------------------------------------------------------
// T11: BuildStage.
// ---------------------------------------------------------------------

func TestBuildStage_T11_BracketHappyPath(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, bouts, _ := newService()

	f1, f2, f3 := fref("f1"), fref("f2"), fref("f3")
	f4, f5, f6 := fref("f4"), fref("f5"), fref("f6")
	fighters.Set("n1", f1, f2, f3, f4, f5, f6)

	sourceID := stageIDFor(t, repo, "n1")
	seedGroupOfThree(repo, bouts, sourceID, 1, [3]domain.FighterRef{f1, f2, f3})
	seedGroupOfThree(repo, bouts, sourceID, 2, [3]domain.FighterRef{f4, f5, f6})

	// Через svc.CreateStage — а не repo.CreateStage напрямую: только он
	// создаёт два контейнера первого круга (0018), необходимых
	// ApplyStageBuild для посева.
	target, _, err := svc.CreateStage(ctx, "n1", domain.StageTypeBracket, "Плейофф",
		domain.BracketConfig{Size: 4}, domain.GroupsConfig{}, groupPlacesRule(sourceID, 1, 2))
	if err != nil {
		t.Fatalf("seed target: %v", err)
	}

	layout, bracket, err := svc.BuildStage(ctx, target.ID, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if layout.Stage.ID != "" {
		t.Fatalf("expected empty Layout for bracket target, got %+v", layout)
	}
	if bracket.Stage.ID != target.ID {
		t.Fatalf("expected Bracket for target stage, got %+v", bracket.Stage)
	}
	seededCount := 0
	for _, r := range bracket.Rounds {
		for _, h := range r.Halves {
			for _, p := range h.Pairs {
				if p.A.State == domain.SlotFilled {
					seededCount++
				}
				if p.B.State == domain.SlotFilled {
					seededCount++
				}
			}
		}
	}
	if r0 := bracket.Rounds; len(r0) == 0 {
		t.Fatalf("expected at least one round in bracket view")
	}
	if seededCount != 4 {
		t.Fatalf("expected 4 seeded slots in round 1, got %d", seededCount)
	}

	// Повторное формирование поверх непустого состава отклоняется (FR-18).
	if _, _, err := svc.BuildStage(ctx, target.ID, nil); !errors.Is(err, domain.ErrStageNotEmpty) {
		t.Fatalf("expected ErrStageNotEmpty on rebuild, got %v", err)
	}

	// Откат формирования (FR-21): Undo возвращает состав к пустому.
	if _, err := svc.Undo(ctx, target.ID); err != nil {
		t.Fatalf("unexpected error on Undo: %v", err)
	}
	afterUndo, err := svc.GetBracket(ctx, target.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, r := range afterUndo.Rounds {
		for _, h := range r.Halves {
			for _, p := range h.Pairs {
				if p.A.State == domain.SlotFilled || p.B.State == domain.SlotFilled {
					t.Fatalf("expected empty bracket after undo, got %+v", afterUndo)
				}
			}
		}
	}
}

func TestBuildStage_T11_GroupsHappyPath_DoubleGroups(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, bouts, _ := newService()

	f1, f2, f3 := fref("f1"), fref("f2"), fref("f3")
	f4, f5, f6 := fref("f4"), fref("f5"), fref("f6")
	fighters.Set("n1", f1, f2, f3, f4, f5, f6)

	sourceID := stageIDFor(t, repo, "n1")
	seedGroupOfThree(repo, bouts, sourceID, 1, [3]domain.FighterRef{f1, f2, f3})
	seedGroupOfThree(repo, bouts, sourceID, 2, [3]domain.FighterRef{f4, f5, f6})

	strong, err := repo.CreateStage(ctx, "n1", 1, "Сильные", domain.StageTypeGroups,
		domain.BracketConfig{}, domain.GroupsConfig{GroupCount: 1}, groupPlacesRule(sourceID, 1, 1))
	if err != nil {
		t.Fatalf("seed strong: %v", err)
	}
	weak, err := repo.CreateStage(ctx, "n1", 1, "Слабые", domain.StageTypeGroups,
		domain.BracketConfig{}, domain.GroupsConfig{GroupCount: 1}, groupPlacesRule(sourceID, 2, 0))
	if err != nil {
		t.Fatalf("seed weak: %v", err)
	}

	strongLayout, _, err := svc.BuildStage(ctx, strong.ID, nil)
	if err != nil {
		t.Fatalf("unexpected error building strong: %v", err)
	}
	if len(strongLayout.Pools) != 1 || len(strongLayout.Pools[0].Members) != 2 {
		t.Fatalf("expected 1 pool with 2 members (winners of each group), got %+v", strongLayout.Pools)
	}

	weakLayout, _, err := svc.BuildStage(ctx, weak.ID, nil)
	if err != nil {
		t.Fatalf("unexpected error building weak: %v", err)
	}
	if len(weakLayout.Pools) != 1 || len(weakLayout.Pools[0].Members) != 4 {
		t.Fatalf("expected 1 pool with 4 members (2nd+3rd of each group), got %+v", weakLayout.Pools)
	}

	strongIDs := map[string]bool{}
	for _, m := range strongLayout.Pools[0].Members {
		strongIDs[m.ID] = true
	}
	for _, m := range weakLayout.Pools[0].Members {
		if strongIDs[m.ID] {
			t.Fatalf("fighter %s present in both branches — selectors should not overlap", m.ID)
		}
	}
}

func TestBuildStage_T11_ErrTieUnresolved(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, bouts, _ := newService()

	f1, f2, f3 := fref("f1"), fref("f2"), fref("f3")
	fighters.Set("n1", f1, f2, f3)

	sourceID := stageIDFor(t, repo, "n1")
	poolID := repo.SeedPoolInStage(sourceID, 1, f1.ID, f2.ID, f3.ID)
	bouts.SeedBout(poolID, finished(poolID, f1, f2, 5, 1))
	bouts.SeedBout(poolID, finished(poolID, f1, f3, 5, 1))

	target, err := repo.CreateStage(ctx, "n1", 0, "Плейофф", domain.StageTypeBracket,
		domain.BracketConfig{Size: 4}, domain.GroupsConfig{}, groupPlacesRule(sourceID, 1, 2))
	if err != nil {
		t.Fatalf("seed target: %v", err)
	}

	if _, _, err := svc.BuildStage(ctx, target.ID, nil); !errors.Is(err, domain.ErrTieUnresolved) {
		t.Fatalf("expected ErrTieUnresolved, got %v", err)
	}
}

func TestBuildStage_T11_ErrSelectorOverlap(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, bouts, _ := newService()

	f1, f2, f3 := fref("f1"), fref("f2"), fref("f3")
	fighters.Set("n1", f1, f2, f3)

	sourceID := stageIDFor(t, repo, "n1")
	seedGroupOfThree(repo, bouts, sourceID, 1, [3]domain.FighterRef{f1, f2, f3})

	if _, err := repo.CreateStage(ctx, "n1", 1, "Сильные", domain.StageTypeBracket,
		domain.BracketConfig{Size: 4}, domain.GroupsConfig{}, groupPlacesRule(sourceID, 1, 2)); err != nil {
		t.Fatalf("seed branch A: %v", err)
	}
	branchB, err := repo.CreateStage(ctx, "n1", 1, "Тоже сильные", domain.StageTypeBracket,
		domain.BracketConfig{Size: 4}, domain.GroupsConfig{}, groupPlacesRule(sourceID, 1, 2))
	if err != nil {
		t.Fatalf("seed branch B: %v", err)
	}

	if _, _, err := svc.BuildStage(ctx, branchB.ID, nil); !errors.Is(err, domain.ErrSelectorOverlap) {
		t.Fatalf("expected ErrSelectorOverlap, got %v", err)
	}
}

func TestBuildStage_T11_ErrCapacityExceeded(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, bouts, _ := newService()

	f1, f2, f3 := fref("f1"), fref("f2"), fref("f3")
	f4, f5, f6 := fref("f4"), fref("f5"), fref("f6")
	fighters.Set("n1", f1, f2, f3, f4, f5, f6)

	sourceID := stageIDFor(t, repo, "n1")
	seedGroupOfThree(repo, bouts, sourceID, 1, [3]domain.FighterRef{f1, f2, f3})
	seedGroupOfThree(repo, bouts, sourceID, 2, [3]domain.FighterRef{f4, f5, f6})

	// Селектор ALL от источника-этапа отбирает всех шестерых — вдвое больше
	// вместимости сетки на 4 (FR-19, AC-11).
	rule := domain.SeedingRule{
		SourceKind: domain.SourceKindStage, SourceStageID: sourceID,
		Selector: domain.SelectorKindAll, Method: domain.LayoutMethodSeeded,
	}
	target, err := repo.CreateStage(ctx, "n1", 0, "Плейофф", domain.StageTypeBracket,
		domain.BracketConfig{Size: 4}, domain.GroupsConfig{}, rule)
	if err != nil {
		t.Fatalf("seed target: %v", err)
	}

	preview, err := svc.PreviewStageBuild(ctx, target.ID, nil)
	if err != nil {
		t.Fatalf("unexpected error on preview: %v", err)
	}
	if len(preview.Entries) != 6 || preview.Capacity != 4 {
		t.Fatalf("expected 6 entries over capacity 4, got %d entries, capacity %d", len(preview.Entries), preview.Capacity)
	}

	if _, _, err := svc.BuildStage(ctx, target.ID, nil); !errors.Is(err, domain.ErrCapacityExceeded) {
		t.Fatalf("expected ErrCapacityExceeded, got %v", err)
	}
}

func TestBuildStage_T11_ErrStageNotEmpty_NoRule(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, _ := newService()
	fighters.Set("n1")

	stageID := stageIDFor(t, repo, "n1")
	if _, _, err := svc.BuildStage(ctx, stageID, nil); !errors.Is(err, domain.ErrNoSeedingRule) {
		t.Fatalf("expected ErrNoSeedingRule, got %v", err)
	}
}
