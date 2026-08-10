package domain_test

import (
	"reflect"
	"sort"
	"strconv"
	"testing"

	"github.com/hema/server/modules/stage/domain"
)

// ---------------------------------------------------------------------
// T3 — ComputeOverallOrder (FR-5).
// ---------------------------------------------------------------------

func standing(f domain.FighterRef, place, wins, scored, conceded int) domain.Standing {
	return domain.Standing{
		Fighter:        f,
		Wins:           wins,
		PointsScored:   scored,
		PointsConceded: conceded,
		Place:          place,
	}
}

func overallByID(t *testing.T, selected []domain.SelectedFighter) map[string]domain.SelectedFighter {
	t.Helper()
	out := make(map[string]domain.SelectedFighter, len(selected))
	for _, sf := range selected {
		out[sf.Fighter.ID] = sf
	}
	return out
}

func TestComputeOverallOrder_AcrossGroups(t *testing.T) {
	a1, a2 := fighter("a1"), fighter("a2")
	b1, b2 := fighter("b1"), fighter("b2")

	groupA := domain.SourceGroup{
		PoolID: "pa",
		Label:  "Группа 1",
		Standings: []domain.Standing{
			standing(a1, 1, 3, 15, 3),
			standing(a2, 2, 1, 7, 11),
		},
	}
	groupB := domain.SourceGroup{
		PoolID: "pb",
		Label:  "Группа 2",
		Standings: []domain.Standing{
			standing(b1, 1, 2, 10, 5),
			standing(b2, 2, 0, 3, 15),
		},
	}

	got := domain.ComputeOverallOrder([]domain.SourceGroup{groupA, groupB})
	if len(got) != 4 {
		t.Fatalf("expected 4 entries, got %d: %+v", len(got), got)
	}

	byID := overallByID(t, got)
	// GroupPlace 1 всегда выше GroupPlace 2 — независимо от wins/points.
	if byID["a1"].OverallPlace != 1 {
		t.Fatalf("a1 (group place 1, more wins) must be overall 1, got %d", byID["a1"].OverallPlace)
	}
	if byID["b1"].OverallPlace != 2 {
		t.Fatalf("b1 (group place 1, fewer wins than a1) must be overall 2, got %d", byID["b1"].OverallPlace)
	}
	if byID["a2"].OverallPlace != 3 {
		t.Fatalf("a2 (group place 2, more wins than b2) must be overall 3, got %d", byID["a2"].OverallPlace)
	}
	if byID["b2"].OverallPlace != 4 {
		t.Fatalf("b2 (group place 2, fewer wins) must be overall 4, got %d", byID["b2"].OverallPlace)
	}
	if byID["a1"].OriginLabel != "Группа 1, место 1" {
		t.Fatalf("unexpected origin label: %q", byID["a1"].OriginLabel)
	}
	if byID["b1"].GroupPlace != 1 || byID["b1"].SourcePoolID != "pb" {
		t.Fatalf("b1 group place/source mismatch: %+v", byID["b1"])
	}
}

func TestComputeOverallOrder_TieSharesOverallPlace(t *testing.T) {
	a, b, c, d := fighter("a"), fighter("b"), fighter("c"), fighter("d")
	groupA := domain.SourceGroup{
		PoolID: "pa",
		Label:  "Группа 1",
		Standings: []domain.Standing{
			standing(a, 1, 3, 10, 2),
			standing(c, 2, 1, 5, 8),
		},
	}
	groupB := domain.SourceGroup{
		PoolID: "pb",
		Label:  "Группа 2",
		Standings: []domain.Standing{
			// b полностью равен a (та же GroupPlace=1, те же wins/scored/conceded) — дележ.
			standing(b, 1, 3, 10, 2),
			standing(d, 2, 0, 2, 12),
		},
	}

	got := domain.ComputeOverallOrder([]domain.SourceGroup{groupA, groupB})
	byID := overallByID(t, got)

	if byID["a"].OverallPlace != 1 || byID["b"].OverallPlace != 1 {
		t.Fatalf("a and b must tie at overall place 1: a=%d b=%d", byID["a"].OverallPlace, byID["b"].OverallPlace)
	}
	// Следующий уникальный уровень получает место со сдвигом на размер
	// дележа (1,1,3 — не 1,1,2).
	if byID["c"].OverallPlace != 3 {
		t.Fatalf("c must be overall place 3 (tie-skip), got %d", byID["c"].OverallPlace)
	}
	if byID["d"].OverallPlace != 4 {
		t.Fatalf("d must be overall place 4, got %d", byID["d"].OverallPlace)
	}
}

// TestComputeOverallOrder_DifferentGroupSizes_NoNormalization — NFR-2:
// группы разного размера сравниваются по абсолютным показателям, без
// нормировки на размер группы. Фиксирует поведение как решение спеки, не баг.
func TestComputeOverallOrder_DifferentGroupSizes_NoNormalization(t *testing.T) {
	small1 := fighter("small1")
	big1 := fighter("big1")

	smallGroup := domain.SourceGroup{
		PoolID:    "small",
		Label:     "Группа A",
		Standings: []domain.Standing{standing(small1, 1, 1, 5, 2)}, // 1 бой, 1 победа
	}
	bigGroup := domain.SourceGroup{
		PoolID:    "big",
		Label:     "Группа B",
		Standings: []domain.Standing{standing(big1, 1, 4, 20, 8)}, // 4 боя, 4 победы
	}

	got := domain.ComputeOverallOrder([]domain.SourceGroup{smallGroup, bigGroup})
	byID := overallByID(t, got)

	// Оба — GroupPlace 1 своей группы; сравнение абсолютное (4 wins > 1 win)
	// — big1 выше, хотя в своей группе он играл больше боёв. Нормировки нет.
	if byID["big1"].OverallPlace != 1 {
		t.Fatalf("big1 (absolute wins 4 > 1) must rank first, got place %d", byID["big1"].OverallPlace)
	}
	if byID["small1"].OverallPlace != 2 {
		t.Fatalf("small1 must rank second, got place %d", byID["small1"].OverallPlace)
	}
}

func TestComputeOverallOrder_EmptyGroupDoesNotBreak(t *testing.T) {
	f1 := fighter("f1")
	groups := []domain.SourceGroup{
		{PoolID: "empty", Label: "Группа пустая", Standings: nil},
		{PoolID: "p1", Label: "Группа 1", Standings: []domain.Standing{standing(f1, 1, 1, 5, 1)}},
	}

	got := domain.ComputeOverallOrder(groups)
	if len(got) != 1 {
		t.Fatalf("expected 1 entry (empty group contributes nothing), got %d: %+v", len(got), got)
	}
	if got[0].Fighter.ID != "f1" {
		t.Fatalf("unexpected fighter: %+v", got[0])
	}
}

func TestComputeOverallOrder_FighterWithoutFinishedBouts(t *testing.T) {
	winner := fighter("winner")
	noBouts := fighter("nobouts")
	group := domain.SourceGroup{
		PoolID: "p1",
		Label:  "Группа 1",
		Standings: []domain.Standing{
			standing(winner, 1, 2, 10, 3),
			// нулевая статистика — как в ComputeStandings (AC-2, спека 0016).
			standing(noBouts, 2, 0, 0, 0),
		},
	}

	got := domain.ComputeOverallOrder([]domain.SourceGroup{group})
	byID := overallByID(t, got)

	if len(got) != 2 {
		t.Fatalf("expected 2 entries, got %d: %+v", len(got), got)
	}
	if byID["winner"].OverallPlace != 1 {
		t.Fatalf("winner must be overall place 1, got %d", byID["winner"].OverallPlace)
	}
	if byID["nobouts"].OverallPlace != 2 {
		t.Fatalf("fighter without finished bouts must be overall place 2, got %d", byID["nobouts"].OverallPlace)
	}
	if byID["nobouts"].GroupPlace != 2 {
		t.Fatalf("fighter without finished bouts must keep its group place: %+v", byID["nobouts"])
	}
}

// ---------------------------------------------------------------------
// T4 — SelectByRule, TieAsk/TieResolution, Overlap, SeedingRule.Validate.
// ---------------------------------------------------------------------

func idsOf(selected []domain.SelectedFighter) []string {
	out := make([]string, len(selected))
	for i, sf := range selected {
		out[i] = sf.Fighter.ID
	}
	sort.Strings(out)
	return out
}

func rosterRule() domain.SeedingRule {
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

func overallPlacesRule(sourceStageID string, from, to int) domain.SeedingRule {
	r := groupPlacesRule(sourceStageID, from, to)
	r.Selector = domain.SelectorKindOverallPlaces
	return r
}

func threeGroupsFixture() []domain.SourceGroup {
	a1, a2, a3 := fighter("a1"), fighter("a2"), fighter("a3")
	b1, b2, b3 := fighter("b1"), fighter("b2"), fighter("b3")
	return []domain.SourceGroup{
		{
			PoolID: "pa",
			Label:  "Группа 1",
			Standings: []domain.Standing{
				standing(a1, 1, 3, 15, 2),
				standing(a2, 2, 2, 10, 5),
				standing(a3, 3, 0, 2, 15),
			},
		},
		{
			PoolID: "pb",
			Label:  "Группа 2",
			Standings: []domain.Standing{
				standing(b1, 1, 3, 14, 3),
				standing(b2, 2, 1, 8, 9),
				standing(b3, 3, 0, 3, 14),
			},
		},
	}
}

func TestSelectByRule_All_Roster(t *testing.T) {
	active := []domain.FighterRef{fighter("x"), fighter("y"), fighter("z")}

	selected, ties, err := domain.SelectByRule(rosterRule(), nil, active, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(ties) != 0 {
		t.Fatalf("roster ALL must not produce ties: %+v", ties)
	}
	if got := idsOf(selected); !reflect.DeepEqual(got, []string{"x", "y", "z"}) {
		t.Fatalf("expected all active fighters selected, got %v", got)
	}
}

func TestSelectByRule_All_Stage_FiltersInactive(t *testing.T) {
	groups := threeGroupsFixture()
	rule := domain.SeedingRule{
		SourceKind:    domain.SourceKindStage,
		SourceStageID: "src",
		Selector:      domain.SelectorKindAll,
		Method:        domain.LayoutMethodSeeded,
	}
	// Активны все, кроме a3.
	active := []domain.FighterRef{
		fighter("a1"), fighter("a2"),
		fighter("b1"), fighter("b2"), fighter("b3"),
	}

	selected, ties, err := domain.SelectByRule(rule, groups, active, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(ties) != 0 {
		t.Fatalf("ALL selector must not produce ties: %+v", ties)
	}
	got := idsOf(selected)
	want := []string{"a1", "a2", "b1", "b2", "b3"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected %v, got %v", want, got)
	}
}

func TestSelectByRule_GroupPlaces_OpenBoundary(t *testing.T) {
	groups := threeGroupsFixture()
	active := allActiveOf(groups)
	rule := groupPlacesRule("src", 1, 0) // открытая граница — все места

	selected, ties, err := domain.SelectByRule(rule, groups, active, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(ties) != 0 {
		t.Fatalf("expected no ties, got %+v", ties)
	}
	if len(selected) != 6 {
		t.Fatalf("expected all 6 fighters selected, got %d: %+v", len(selected), selected)
	}
}

func TestSelectByRule_GroupPlaces_ClosedBoundary(t *testing.T) {
	groups := threeGroupsFixture()
	active := allActiveOf(groups)
	rule := groupPlacesRule("src", 1, 2) // топ-2 каждой группы

	selected, ties, err := domain.SelectByRule(rule, groups, active, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(ties) != 0 {
		t.Fatalf("expected no ties, got %+v", ties)
	}
	got := idsOf(selected)
	want := []string{"a1", "a2", "b1", "b2"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected %v, got %v", want, got)
	}
}

func TestSelectByRule_OverallPlaces_TopN(t *testing.T) {
	groups := threeGroupsFixture()
	active := allActiveOf(groups)
	rule := overallPlacesRule("src", 1, 3) // топ-3 сводного порядка

	selected, ties, err := domain.SelectByRule(rule, groups, active, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(ties) != 0 {
		t.Fatalf("expected no ties, got %+v", ties)
	}
	// Сводный порядок: a1(gp1,w3) > b1(gp1,w3, меньше scored) > a2(gp2,w2) — по критериям 0016.
	overall := domain.ComputeOverallOrder(groups)
	wantIDs := make([]string, 0, 3)
	for _, sf := range overall {
		if sf.OverallPlace <= 3 {
			wantIDs = append(wantIDs, sf.Fighter.ID)
		}
	}
	sort.Strings(wantIDs)
	if got := idsOf(selected); !reflect.DeepEqual(got, wantIDs) {
		t.Fatalf("expected top-3 overall %v, got %v", wantIDs, got)
	}
	if len(selected) != 3 {
		t.Fatalf("expected exactly 3 selected, got %d", len(selected))
	}
}

func allActiveOf(groups []domain.SourceGroup) []domain.FighterRef {
	var out []domain.FighterRef
	for _, g := range groups {
		for _, s := range g.Standings {
			out = append(out, s.Fighter)
		}
	}
	return out
}

// TestSelectByRule_TieAtBoundary_ProducesTieAsk — AC-6: дележ строго на
// границе окна (2-е место разделено, окно 1-2) даёт TieAsk с SlotsLeft=1.
func TestSelectByRule_TieAtBoundary_ProducesTieAsk(t *testing.T) {
	a, b, c := fighter("a"), fighter("b"), fighter("c")
	groups := []domain.SourceGroup{{
		PoolID: "p1",
		Label:  "Группа 1",
		Standings: []domain.Standing{
			standing(a, 1, 3, 10, 1),
			standing(b, 2, 1, 5, 5), // b и c полностью равны — делят место 2
			standing(c, 2, 1, 5, 5),
		},
	}}
	active := allActiveOf(groups)
	rule := groupPlacesRule("src", 1, 2)

	selected, ties, err := domain.SelectByRule(rule, groups, active, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(ties) != 1 {
		t.Fatalf("expected exactly 1 tie ask, got %d: %+v", len(ties), ties)
	}
	ask := ties[0]
	if ask.SourcePoolID != "p1" || ask.Place != 2 || ask.SlotsLeft != 1 {
		t.Fatalf("unexpected tie ask: %+v", ask)
	}
	if len(ask.Contenders) != 2 {
		t.Fatalf("expected 2 contenders, got %+v", ask.Contenders)
	}
	// Место 1 (не спорное) должно быть в selected; b/c не должны быть решены.
	got := idsOf(selected)
	if !reflect.DeepEqual(got, []string{"a"}) {
		t.Fatalf("expected only a selected before tie is resolved, got %v", got)
	}
}

// TestSelectByRule_TieFullyInsideWindow_NoQuestion — дележ, который целиком
// помещается в окно (все делящие проходят), вопросов не порождает.
func TestSelectByRule_TieFullyInsideWindow_NoQuestion(t *testing.T) {
	a, b, c, d := fighter("a"), fighter("b"), fighter("c"), fighter("d")
	groups := []domain.SourceGroup{{
		PoolID: "p1",
		Label:  "Группа 1",
		Standings: []domain.Standing{
			standing(a, 1, 3, 10, 1),
			standing(b, 2, 1, 5, 5), // делят место 2, оба помещаются в окно 1-3
			standing(c, 2, 1, 5, 5),
			standing(d, 4, 0, 1, 10),
		},
	}}
	active := allActiveOf(groups)
	rule := groupPlacesRule("src", 1, 3)

	selected, ties, err := domain.SelectByRule(rule, groups, active, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(ties) != 0 {
		t.Fatalf("expected no ties (tie fully inside window), got %+v", ties)
	}
	got := idsOf(selected)
	want := []string{"a", "b", "c"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected %v, got %v", want, got)
	}
}

// TestSelectByRule_TieFullyOutsideWindow_NoQuestion — дележ целиком за
// пределами окна (не проходит никто из делящих) вопросов не порождает.
func TestSelectByRule_TieFullyOutsideWindow_NoQuestion(t *testing.T) {
	a, b, c := fighter("a"), fighter("b"), fighter("c")
	groups := []domain.SourceGroup{{
		PoolID: "p1",
		Label:  "Группа 1",
		Standings: []domain.Standing{
			standing(a, 1, 3, 10, 1),
			standing(b, 2, 1, 5, 5), // делят место 2, окно — только место 1
			standing(c, 2, 1, 5, 5),
		},
	}}
	active := allActiveOf(groups)
	rule := groupPlacesRule("src", 1, 1)

	selected, ties, err := domain.SelectByRule(rule, groups, active, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(ties) != 0 {
		t.Fatalf("expected no ties (tie fully outside window), got %+v", ties)
	}
	got := idsOf(selected)
	if !reflect.DeepEqual(got, []string{"a"}) {
		t.Fatalf("expected only a selected, got %v", got)
	}
}

func TestSelectByRule_TieResolution_Applied(t *testing.T) {
	a, b, c := fighter("a"), fighter("b"), fighter("c")
	groups := []domain.SourceGroup{{
		PoolID: "p1",
		Label:  "Группа 1",
		Standings: []domain.Standing{
			standing(a, 1, 3, 10, 1),
			standing(b, 2, 1, 5, 5),
			standing(c, 2, 1, 5, 5),
		},
	}}
	active := allActiveOf(groups)
	rule := groupPlacesRule("src", 1, 2)
	res := []domain.TieResolution{{SourcePoolID: "p1", Place: 2, FighterIDs: []string{"c"}}}

	selected, ties, err := domain.SelectByRule(rule, groups, active, res)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(ties) != 0 {
		t.Fatalf("resolved tie must not be returned as a question, got %+v", ties)
	}
	got := idsOf(selected)
	want := []string{"a", "c"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected %v, got %v", want, got)
	}
}

// TestSelectByRule_TieResolution_PartialOrInvalid — неполный/содержащий
// неизвестный id ответ: неизвестные id игнорируются, известные учитываются
// по порядку; если валидных меньше, чем SlotsLeft — проходит меньше (не
// ошибка).
func TestSelectByRule_TieResolution_PartialOrInvalid(t *testing.T) {
	a, b, c := fighter("a"), fighter("b"), fighter("c")
	groups := []domain.SourceGroup{{
		PoolID: "p1",
		Label:  "Группа 1",
		Standings: []domain.Standing{
			standing(a, 1, 3, 10, 1),
			standing(b, 2, 1, 5, 5),
			standing(c, 2, 1, 5, 5),
		},
	}}
	active := allActiveOf(groups)
	rule := groupPlacesRule("src", 1, 2)
	// "unknown" не входит в делящих — игнорируется; валидный id "b" проходит.
	res := []domain.TieResolution{{SourcePoolID: "p1", Place: 2, FighterIDs: []string{"unknown", "b"}}}

	selected, ties, err := domain.SelectByRule(rule, groups, active, res)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(ties) != 0 {
		t.Fatalf("expected resolution to close the question, got %+v", ties)
	}
	got := idsOf(selected)
	want := []string{"a", "b"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected %v, got %v", want, got)
	}
}

// TestSelectByRule_FR20_InactiveBackfill — AC-13: выведенный боец на границе
// окна не занимает место, окно добирается следующим по таблице; места
// остальных не пересчитываются.
func TestSelectByRule_FR20_InactiveBackfill(t *testing.T) {
	a, b, c, d := fighter("a"), fighter("b"), fighter("c"), fighter("d")
	groups := []domain.SourceGroup{{
		PoolID: "p1",
		Label:  "Группа 1",
		Standings: []domain.Standing{
			standing(a, 1, 3, 10, 1),
			standing(b, 2, 2, 8, 3), // выведен — не участвует в отборе
			standing(c, 3, 1, 5, 6),
			standing(d, 4, 0, 1, 10),
		},
	}}
	// b выведен с турнира — не входит в active.
	active := []domain.FighterRef{a, c, d}
	rule := groupPlacesRule("src", 1, 2)

	selected, ties, err := domain.SelectByRule(rule, groups, active, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(ties) != 0 {
		t.Fatalf("expected no ties, got %+v", ties)
	}
	got := idsOf(selected)
	want := []string{"a", "c"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected %v (c backfilled instead of withdrawn b), got %v", want, got)
	}
	byID := overallByID(t, selected)
	if byID["c"].GroupPlace != 3 {
		t.Fatalf("c must keep its original table place (3), got %d", byID["c"].GroupPlace)
	}
}

func TestOverlap_Intersecting(t *testing.T) {
	a := []domain.SelectedFighter{{Fighter: fighter("x")}, {Fighter: fighter("y")}}
	b := []domain.SelectedFighter{{Fighter: fighter("y")}, {Fighter: fighter("z")}}

	got := domain.Overlap(a, b)
	if len(got) != 1 || got[0].ID != "y" {
		t.Fatalf("expected overlap [y], got %+v", got)
	}
}

func TestOverlap_Disjoint(t *testing.T) {
	a := []domain.SelectedFighter{{Fighter: fighter("x")}}
	b := []domain.SelectedFighter{{Fighter: fighter("z")}}

	got := domain.Overlap(a, b)
	if len(got) != 0 {
		t.Fatalf("expected no overlap, got %+v", got)
	}
}

func TestSeedingRule_Validate(t *testing.T) {
	baseBracket := domain.SeedingRule{
		SourceKind:    domain.SourceKindStage,
		SourceStageID: "src",
		Selector:      domain.SelectorKindGroupPlaces,
		PlaceFrom:     1,
		PlaceTo:       2,
		Method:        domain.LayoutMethodSeeded,
	}

	tests := []struct {
		name            string
		rule            domain.SeedingRule
		targetIsBracket bool
		wantErr         bool
	}{
		{"zero rule always valid", domain.SeedingRule{}, true, false},
		{"valid bracket rule", baseBracket, true, false},
		{"valid groups rule", func() domain.SeedingRule {
			r := baseBracket
			r.Method = domain.LayoutMethodSnake
			return r
		}(), false, false},
		{"invalid source kind", func() domain.SeedingRule {
			r := baseBracket
			r.SourceKind = "bogus"
			return r
		}(), true, true},
		{"invalid selector", func() domain.SeedingRule {
			r := baseBracket
			r.Selector = "bogus"
			return r
		}(), true, true},
		{"invalid method", func() domain.SeedingRule {
			r := baseBracket
			r.Method = "bogus"
			return r
		}(), true, true},
		{"method mismatch vs bracket target", func() domain.SeedingRule {
			r := baseBracket
			r.Method = domain.LayoutMethodSnake
			return r
		}(), true, true},
		{"method mismatch vs groups target", baseBracket, false, true},
		{"roster with non-all selector", domain.SeedingRule{
			SourceKind: domain.SourceKindRoster,
			Selector:   domain.SelectorKindGroupPlaces,
			Method:     domain.LayoutMethodSnake,
		}, false, true},
		{"roster with source stage id set", domain.SeedingRule{
			SourceKind:    domain.SourceKindRoster,
			SourceStageID: "src",
			Selector:      domain.SelectorKindAll,
			Method:        domain.LayoutMethodSnake,
		}, false, true},
		{"stage source without source stage id", domain.SeedingRule{
			SourceKind: domain.SourceKindStage,
			Selector:   domain.SelectorKindAll,
			Method:     domain.LayoutMethodSeeded,
		}, true, true},
		{"place_to below place_from", func() domain.SeedingRule {
			r := baseBracket
			r.PlaceFrom = 3
			r.PlaceTo = 2
			return r
		}(), true, true},
		{"all selector with non-zero places", domain.SeedingRule{
			SourceKind:    domain.SourceKindStage,
			SourceStageID: "src",
			Selector:      domain.SelectorKindAll,
			PlaceFrom:     1,
			Method:        domain.LayoutMethodSeeded,
		}, true, true},
		{"windowed selector with place_from zero", func() domain.SeedingRule {
			r := baseBracket
			r.PlaceFrom = 0
			return r
		}(), true, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.rule.Validate(tt.targetIsBracket)
			if tt.wantErr && err == nil {
				t.Fatalf("expected error, got nil")
			}
			if !tt.wantErr && err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

// Клиент не присылает method (FR-4) — сервис обязан вывести его сам из типа
// целевого этапа до Validate. Регресс на баг: без этого клиентский запрос
// без method всегда получал ErrInvalidRule независимо от прочих полей.
func TestResolveMethod(t *testing.T) {
	if got := domain.ResolveMethod(true); got != domain.LayoutMethodSeeded {
		t.Fatalf("ResolveMethod(bracket) = %q, want seeded", got)
	}
	if got := domain.ResolveMethod(false); got != domain.LayoutMethodSnake {
		t.Fatalf("ResolveMethod(groups) = %q, want snake", got)
	}
}

// ---------------------------------------------------------------------
// T5 — BracketSeedOrder, PlanBracketSeeds, PlanGroupAssignments.
// ---------------------------------------------------------------------

func indexOfSeed(order []int, seed int) int {
	for i, v := range order {
		if v == seed {
			return i
		}
	}
	return -1
}

// roundOfFirstMeeting — первый круг (1-based), в котором посевные seedA и
// seedB попадают в одну пару — по блокам 2^r над индексами их слотов.
func roundOfFirstMeeting(order []int, seedA, seedB int) int {
	posA, posB := indexOfSeed(order, seedA), indexOfSeed(order, seedB)
	for r := 1; ; r++ {
		block := 1 << uint(r)
		if posA/block == posB/block {
			return r
		}
	}
}

func TestBracketSeedOrder(t *testing.T) {
	for _, size := range []int{4, 8, 16, 32} {
		t.Run(strconv.Itoa(size), func(t *testing.T) {
			order := domain.BracketSeedOrder(size)
			if len(order) != size {
				t.Fatalf("expected %d entries, got %d: %v", size, len(order), order)
			}

			sorted := append([]int(nil), order...)
			sort.Ints(sorted)
			for i, v := range sorted {
				if v != i+1 {
					t.Fatalf("order is not a full permutation of 1..%d: %v", size, order)
				}
			}

			final := domain.RoundCount(size)
			semifinal := final - 1

			if got := roundOfFirstMeeting(order, 1, 2); got != final {
				t.Fatalf("seeds 1 and 2 must meet only at the final (round %d), got round %d", final, got)
			}
			if got := roundOfFirstMeeting(order, 1, 4); got < semifinal {
				t.Fatalf("seeds 1 and 4 must not meet earlier than the semifinal (round %d), got round %d", semifinal, got)
			}
		})
	}
}

func TestPlanBracketSeeds_FullSet(t *testing.T) {
	cfg := domain.BracketConfig{Size: 4}
	selected := []domain.SelectedFighter{
		{Fighter: fighter("s1")}, {Fighter: fighter("s2")},
		{Fighter: fighter("s3")}, {Fighter: fighter("s4")},
	}

	plans, err := domain.PlanBracketSeeds(selected, cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(plans) != 4 {
		t.Fatalf("expected 4 plans, got %d: %+v", len(plans), plans)
	}
	order := domain.BracketSeedOrder(cfg.Size)
	for i, p := range plans {
		if p.Slot != order[i] {
			t.Fatalf("plan %d: expected slot %d, got %d", i, order[i], p.Slot)
		}
	}
}

func TestPlanBracketSeeds_Undersupply(t *testing.T) {
	cfg := domain.BracketConfig{Size: 8}
	selected := []domain.SelectedFighter{{Fighter: fighter("s1")}, {Fighter: fighter("s2")}}

	plans, err := domain.PlanBracketSeeds(selected, cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(plans) != 2 {
		t.Fatalf("expected 2 plans (undersupply is legal), got %d: %+v", len(plans), plans)
	}
	order := domain.BracketSeedOrder(cfg.Size)
	if plans[0].Slot != order[0] || plans[1].Slot != order[1] {
		t.Fatalf("unexpected slots: %+v (order=%v)", plans, order)
	}
}

func TestPlanBracketSeeds_Overflow(t *testing.T) {
	cfg := domain.BracketConfig{Size: 4}
	selected := make([]domain.SelectedFighter, 5)
	for i := range selected {
		selected[i] = domain.SelectedFighter{Fighter: fighter(strconv.Itoa(i))}
	}

	plans, err := domain.PlanBracketSeeds(selected, cfg)
	if err == nil {
		t.Fatalf("expected ErrCapacityExceeded, got plans %+v", plans)
	}
	if err != domain.ErrCapacityExceeded {
		t.Fatalf("expected ErrCapacityExceeded, got %v", err)
	}
	if plans != nil {
		t.Fatalf("expected nil plans on error, got %+v", plans)
	}
}

func TestPlanGroupAssignments(t *testing.T) {
	selected := make([]domain.SelectedFighter, 6)
	for i := range selected {
		selected[i] = domain.SelectedFighter{Fighter: fighter("f" + strconv.Itoa(i))}
	}

	groups := domain.PlanGroupAssignments(selected, 3)
	if len(groups) != 3 {
		t.Fatalf("expected 3 groups, got %d: %+v", len(groups), groups)
	}

	seen := make(map[string]bool)
	total := 0
	for i, g := range groups {
		if g.Number != i+1 {
			t.Fatalf("group %d: expected number %d, got %d", i, i+1, g.Number)
		}
		for _, id := range g.FighterIDs {
			if seen[id] {
				t.Fatalf("fighter %s assigned to more than one group", id)
			}
			seen[id] = true
			total++
		}
	}
	if total != 6 {
		t.Fatalf("expected all 6 fighters distributed, got %d", total)
	}
}

func TestPlanGroupAssignments_ZeroGroupCount(t *testing.T) {
	selected := []domain.SelectedFighter{{Fighter: fighter("f1")}}
	got := domain.PlanGroupAssignments(selected, 0)
	if got != nil {
		t.Fatalf("expected nil for zero group count, got %+v", got)
	}
}
