package domain_test

import (
	"testing"

	"github.com/hema/server/modules/stage/domain"
)

// ---------------------------------------------------------------------
// ComputeStageStatus (спека 0021, FR-2/FR-3).
// ---------------------------------------------------------------------

func TestComputeStageStatus_Draft(t *testing.T) {
	// Layout не ready — статус draft независимо от контейнеров, даже если
	// контейнеры формально выглядят как завершённые.
	containers := []domain.StageContainer{{Status: domain.PoolStatusFinished, Total: 5}}
	if got := domain.ComputeStageStatus(domain.LayoutDraft, containers); got != domain.StageStatusDraft {
		t.Errorf("ComputeStageStatus(draft, ...) = %v, want %v", got, domain.StageStatusDraft)
	}
}

func TestComputeStageStatus_ReadyWithoutBouts(t *testing.T) {
	// Зафиксирован, но контейнеров боёв вовсе нет — доигрывать нечего, но
	// результата тоже нет (FR-2).
	if got := domain.ComputeStageStatus(domain.LayoutReady, nil); got != domain.StageStatusReady {
		t.Errorf("ComputeStageStatus(ready, nil) = %v, want %v", got, domain.StageStatusReady)
	}
}

func TestComputeStageStatus_ReadyWithOnlyEmptyContainers(t *testing.T) {
	// Контейнеры есть, но у всех Total == 0 (пустые пулы/половины без пар) —
	// отбрасываются целиком, остаётся ready.
	containers := []domain.StageContainer{
		{Status: domain.PoolStatusNotReady, Total: 0},
		{Status: domain.PoolStatusReady, Total: 0},
	}
	if got := domain.ComputeStageStatus(domain.LayoutReady, containers); got != domain.StageStatusReady {
		t.Errorf("ComputeStageStatus(ready, all-empty) = %v, want %v", got, domain.StageStatusReady)
	}
}

func TestComputeStageStatus_Active(t *testing.T) {
	containers := []domain.StageContainer{
		{Status: domain.PoolStatusActive, Total: 5},
		{Status: domain.PoolStatusReady, Total: 4},
	}
	if got := domain.ComputeStageStatus(domain.LayoutReady, containers); got != domain.StageStatusActive {
		t.Errorf("ComputeStageStatus(ready, active-mix) = %v, want %v", got, domain.StageStatusActive)
	}
}

func TestComputeStageStatus_Finished(t *testing.T) {
	containers := []domain.StageContainer{
		{Status: domain.PoolStatusFinished, Total: 5},
		{Status: domain.PoolStatusFinished, Total: 3},
	}
	if got := domain.ComputeStageStatus(domain.LayoutReady, containers); got != domain.StageStatusFinished {
		t.Errorf("ComputeStageStatus(ready, all-finished) = %v, want %v", got, domain.StageStatusFinished)
	}
}

func TestComputeStageStatus_FinishedWithEmptyContainer(t *testing.T) {
	// AC-16: пустой пул (Total == 0) среди завершённых не мешает завершению
	// этапа — отбрасывается, а не считается «незавершённым».
	containers := []domain.StageContainer{
		{Status: domain.PoolStatusFinished, Total: 5},
		{Status: domain.PoolStatusNotReady, Total: 0},
	}
	if got := domain.ComputeStageStatus(domain.LayoutReady, containers); got != domain.StageStatusFinished {
		t.Errorf("ComputeStageStatus(ready, finished+empty) = %v, want %v", got, domain.StageStatusFinished)
	}
}

func TestComputeStageStatus_ActiveNotFinishedBoundary(t *testing.T) {
	// Один контейнер ещё active среди finished — этап active, не finished:
	// правило 4 (все finished) не срабатывает, срабатывает правило 5.
	containers := []domain.StageContainer{
		{Status: domain.PoolStatusFinished, Total: 5},
		{Status: domain.PoolStatusActive, Total: 3},
	}
	if got := domain.ComputeStageStatus(domain.LayoutReady, containers); got != domain.StageStatusActive {
		t.Errorf("ComputeStageStatus(ready, finished+active) = %v, want %v", got, domain.StageStatusActive)
	}
}

func TestComputeStageStatus_BracketContainerFinishedByByes(t *testing.T) {
	// Контейнер сетки, завершённый одними баями: Total — число разрешаемых
	// пар (не боёв), у контейнера полностью решённого баями finished==total
	// без единого материализованного боя.
	containers := []domain.StageContainer{
		{Status: domain.PoolStatusFinished, Total: 2},
	}
	if got := domain.ComputeStageStatus(domain.LayoutReady, containers); got != domain.StageStatusFinished {
		t.Errorf("ComputeStageStatus(ready, bye-finished) = %v, want %v", got, domain.StageStatusFinished)
	}
}

// ---------------------------------------------------------------------
// ComputeNominationExecution (спека 0021, FR-4).
// ---------------------------------------------------------------------

func TestComputeNominationExecution_Empty(t *testing.T) {
	if got := domain.ComputeNominationExecution(nil); got != domain.ExecutionNone {
		t.Errorf("ComputeNominationExecution(nil) = %v, want %v", got, domain.ExecutionNone)
	}
}

func TestComputeNominationExecution_AllFinished(t *testing.T) {
	statuses := []domain.StageStatus{domain.StageStatusFinished, domain.StageStatusFinished}
	if got := domain.ComputeNominationExecution(statuses); got != domain.ExecutionFinished {
		t.Errorf("ComputeNominationExecution(all-finished) = %v, want %v", got, domain.ExecutionFinished)
	}
}

func TestComputeNominationExecution_MixDraftActive(t *testing.T) {
	statuses := []domain.StageStatus{domain.StageStatusDraft, domain.StageStatusActive}
	if got := domain.ComputeNominationExecution(statuses); got != domain.ExecutionActive {
		t.Errorf("ComputeNominationExecution(draft+active) = %v, want %v", got, domain.ExecutionActive)
	}
}

func TestComputeNominationExecution_MixReadyFinished(t *testing.T) {
	// Ready-этап рядом с finished — ещё не «всё завершено» (ready !=
	// finished), но уже «что-то идёт» (finished этап есть) -> active, не
	// none и не finished.
	statuses := []domain.StageStatus{domain.StageStatusReady, domain.StageStatusFinished}
	if got := domain.ComputeNominationExecution(statuses); got != domain.ExecutionActive {
		t.Errorf("ComputeNominationExecution(ready+finished) = %v, want %v", got, domain.ExecutionActive)
	}
}

func TestComputeNominationExecution_AllDraftOrReady(t *testing.T) {
	// Ни одного активного/завершённого этапа — ни один бой не начат -> none.
	statuses := []domain.StageStatus{domain.StageStatusDraft, domain.StageStatusReady}
	if got := domain.ComputeNominationExecution(statuses); got != domain.ExecutionNone {
		t.Errorf("ComputeNominationExecution(draft+ready) = %v, want %v", got, domain.ExecutionNone)
	}
}

// ---------------------------------------------------------------------
// TerminalStages (спека 0021, FR-9).
// ---------------------------------------------------------------------

func TestTerminalStages_LinearChain(t *testing.T) {
	a := domain.Stage{ID: "a"}
	b := domain.Stage{ID: "b", Rule: domain.SeedingRule{SourceStageID: "a"}}
	c := domain.Stage{ID: "c", Rule: domain.SeedingRule{SourceStageID: "b"}}

	got := domain.TerminalStages([]domain.Stage{a, b, c})
	if len(got) != 1 || got[0].ID != "c" {
		t.Fatalf("TerminalStages(linear) = %v, want only [c]", stageIDs(got))
	}
}

func TestTerminalStages_ParallelBranchesFromSameSource(t *testing.T) {
	// AC-9: две параллельные ветки (основная и утешительная сетка),
	// питающиеся от одного группового этапа — обе терминальны, ни одна не
	// служит источником другой.
	a := domain.Stage{ID: "a"}
	b1 := domain.Stage{ID: "b1", Rule: domain.SeedingRule{SourceStageID: "a"}}
	b2 := domain.Stage{ID: "b2", Rule: domain.SeedingRule{SourceStageID: "a"}}

	got := domain.TerminalStages([]domain.Stage{a, b1, b2})
	ids := stageIDs(got)
	if len(ids) != 2 || !containsID(ids, "b1") || !containsID(ids, "b2") {
		t.Fatalf("TerminalStages(parallel) = %v, want [b1 b2]", ids)
	}
}

func TestTerminalStages_AsymmetricBranches(t *testing.T) {
	// Одна ветка продолжается (b1 -> c1), другая заканчивается на групповом
	// этапе (b2) — обе терминальные листья: c1 и b2.
	a := domain.Stage{ID: "a"}
	b1 := domain.Stage{ID: "b1", Rule: domain.SeedingRule{SourceStageID: "a"}}
	c1 := domain.Stage{ID: "c1", Rule: domain.SeedingRule{SourceStageID: "b1"}}
	b2 := domain.Stage{ID: "b2", Rule: domain.SeedingRule{SourceStageID: "a"}}

	got := domain.TerminalStages([]domain.Stage{a, b1, c1, b2})
	ids := stageIDs(got)
	if len(ids) != 2 || !containsID(ids, "c1") || !containsID(ids, "b2") {
		t.Fatalf("TerminalStages(asymmetric) = %v, want [c1 b2]", ids)
	}
}

func stageIDs(stages []domain.Stage) []string {
	out := make([]string, len(stages))
	for i, s := range stages {
		out[i] = s.ID
	}
	return out
}

func containsID(ids []string, id string) bool {
	for _, v := range ids {
		if v == id {
			return true
		}
	}
	return false
}

// ---------------------------------------------------------------------
// ComputeBracketPlaces (спека 0021, FR-11a). Использует помощники из
// bracket_test.go: fr, fullSeed, finishedBracketBout.
// ---------------------------------------------------------------------

func placeRangesFor(t *testing.T, entries []domain.ResultEntry, fighterID string) (int, int) {
	t.Helper()
	for _, e := range entries {
		if e.Fighter.ID == fighterID {
			return e.PlaceFrom, e.PlaceTo
		}
	}
	t.Fatalf("no result entry for fighter %q in %v", fighterID, entries)
	return 0, 0
}

func TestComputeBracketPlaces_Size8FullWithThirdPlace(t *testing.T) {
	cfg := domain.BracketConfig{Size: 8, ThirdPlace: true}
	seeds := fullSeed(8)

	bouts := []domain.BracketBout{
		finishedBracketBout(1, 1, fr("f1"), fr("f2"), 5, 1), // f1 beats f2
		finishedBracketBout(1, 2, fr("f3"), fr("f4"), 5, 1), // f3 beats f4
		finishedBracketBout(1, 3, fr("f5"), fr("f6"), 5, 1), // f5 beats f6
		finishedBracketBout(1, 4, fr("f7"), fr("f8"), 5, 1), // f7 beats f8
		finishedBracketBout(2, 1, fr("f1"), fr("f3"), 5, 1), // f1 beats f3
		finishedBracketBout(2, 2, fr("f5"), fr("f7"), 5, 1), // f5 beats f7
		finishedBracketBout(3, 1, fr("f1"), fr("f5"), 5, 1), // f1 beats f5 (final)
		finishedBracketBout(4, 1, fr("f3"), fr("f7"), 5, 1), // f3 beats f7 (3rd place)
	}

	view := domain.ResolveBracket(cfg, seeds, bouts)
	entries := domain.ComputeBracketPlaces(view)

	if len(entries) != 8 {
		t.Fatalf("len(entries) = %d, want 8; entries=%v", len(entries), entries)
	}

	assertPlace := func(id string, from, to int) {
		gotFrom, gotTo := placeRangesFor(t, entries, id)
		if gotFrom != from || gotTo != to {
			t.Errorf("fighter %s: place = %d-%d, want %d-%d", id, gotFrom, gotTo, from, to)
		}
	}
	assertPlace("f1", 1, 1)
	assertPlace("f5", 2, 2)
	assertPlace("f3", 3, 3)
	assertPlace("f7", 4, 4)
	for _, id := range []string{"f2", "f4", "f6", "f8"} {
		assertPlace(id, 5, 8)
	}
}

func TestComputeBracketPlaces_Size8WithoutThirdPlace(t *testing.T) {
	cfg := domain.BracketConfig{Size: 8, ThirdPlace: false}
	seeds := fullSeed(8)

	bouts := []domain.BracketBout{
		finishedBracketBout(1, 1, fr("f1"), fr("f2"), 5, 1),
		finishedBracketBout(1, 2, fr("f3"), fr("f4"), 5, 1),
		finishedBracketBout(1, 3, fr("f5"), fr("f6"), 5, 1),
		finishedBracketBout(1, 4, fr("f7"), fr("f8"), 5, 1),
		finishedBracketBout(2, 1, fr("f1"), fr("f3"), 5, 1),
		finishedBracketBout(2, 2, fr("f5"), fr("f7"), 5, 1),
		finishedBracketBout(3, 1, fr("f1"), fr("f5"), 5, 1),
	}

	view := domain.ResolveBracket(cfg, seeds, bouts)
	entries := domain.ComputeBracketPlaces(view)

	if len(entries) != 8 {
		t.Fatalf("len(entries) = %d, want 8; entries=%v", len(entries), entries)
	}

	// Ни одной строки с местом 3 или 4 по отдельности (FR-14): оба
	// проигравших полуфинала делят диапазон 3-4.
	for _, id := range []string{"f3", "f7"} {
		from, to := placeRangesFor(t, entries, id)
		if from != 3 || to != 4 {
			t.Errorf("fighter %s: place = %d-%d, want 3-4", id, from, to)
		}
	}
	for _, id := range []string{"f2", "f4", "f6", "f8"} {
		from, to := placeRangesFor(t, entries, id)
		if from != 5 || to != 8 {
			t.Errorf("fighter %s: place = %d-%d, want 5-8", id, from, to)
		}
	}
}

func TestComputeBracketPlaces_Size8SixSeeded(t *testing.T) {
	// AC-8: сетка на 8, посеяно шесть бойцов (два бая) — выбывшие в первом
	// круге всё равно получают 5-8, хотя их только двое, не четверо.
	cfg := domain.BracketConfig{Size: 8, ThirdPlace: false}
	seeds := []domain.Seed{
		{Slot: 1, Fighter: fr("f1")}, // bye
		{Slot: 3, Fighter: fr("f2")},
		{Slot: 4, Fighter: fr("f3")},
		{Slot: 5, Fighter: fr("f4")}, // bye
		{Slot: 7, Fighter: fr("f5")},
		{Slot: 8, Fighter: fr("f6")},
	}

	bouts := []domain.BracketBout{
		finishedBracketBout(1, 2, fr("f2"), fr("f3"), 5, 1), // f2 beats f3
		finishedBracketBout(1, 4, fr("f5"), fr("f6"), 5, 1), // f5 beats f6
		finishedBracketBout(2, 1, fr("f1"), fr("f2"), 5, 1), // f1 beats f2
		finishedBracketBout(2, 2, fr("f4"), fr("f5"), 5, 1), // f4 beats f5
		finishedBracketBout(3, 1, fr("f1"), fr("f4"), 5, 1), // f1 beats f4 (final)
	}

	view := domain.ResolveBracket(cfg, seeds, bouts)
	entries := domain.ComputeBracketPlaces(view)

	if len(entries) != 6 {
		t.Fatalf("len(entries) = %d, want 6; entries=%v", len(entries), entries)
	}

	assertPlace := func(id string, from, to int) {
		gotFrom, gotTo := placeRangesFor(t, entries, id)
		if gotFrom != from || gotTo != to {
			t.Errorf("fighter %s: place = %d-%d, want %d-%d", id, gotFrom, gotTo, from, to)
		}
	}
	assertPlace("f1", 1, 1)
	assertPlace("f4", 2, 2)
	assertPlace("f2", 3, 4)
	assertPlace("f5", 3, 4)
	// Только двое реально выбыли в первом круге — но диапазон всё равно
	// 5-8, а не 5-6 (FR-11a): диапазон свойство круга, не числа выбывших.
	assertPlace("f3", 5, 8)
	assertPlace("f6", 5, 8)
}

func TestComputeBracketPlaces_Size4(t *testing.T) {
	cfg := domain.BracketConfig{Size: 4, ThirdPlace: false}
	seeds := fullSeed(4)

	bouts := []domain.BracketBout{
		finishedBracketBout(1, 1, fr("f1"), fr("f2"), 5, 1),
		finishedBracketBout(1, 2, fr("f3"), fr("f4"), 5, 1),
		finishedBracketBout(2, 1, fr("f1"), fr("f3"), 5, 1),
	}

	view := domain.ResolveBracket(cfg, seeds, bouts)
	entries := domain.ComputeBracketPlaces(view)

	if len(entries) != 4 {
		t.Fatalf("len(entries) = %d, want 4; entries=%v", len(entries), entries)
	}
	assertPlace := func(id string, from, to int) {
		gotFrom, gotTo := placeRangesFor(t, entries, id)
		if gotFrom != from || gotTo != to {
			t.Errorf("fighter %s: place = %d-%d, want %d-%d", id, gotFrom, gotTo, from, to)
		}
	}
	assertPlace("f1", 1, 1)
	assertPlace("f3", 2, 2)
	assertPlace("f2", 3, 4)
	assertPlace("f4", 3, 4)
}

func TestComputeBracketPlaces_UnfinishedDoesNotPanic(t *testing.T) {
	cfg := domain.BracketConfig{Size: 4, ThirdPlace: false}
	seeds := fullSeed(4)

	// Только первый круг доигран — финал не начат, champion не определён.
	bouts := []domain.BracketBout{
		finishedBracketBout(1, 1, fr("f1"), fr("f2"), 5, 1),
		finishedBracketBout(1, 2, fr("f3"), fr("f4"), 5, 1),
	}

	view := domain.ResolveBracket(cfg, seeds, bouts)

	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("ComputeBracketPlaces panicked on unfinished bracket: %v", r)
		}
	}()
	entries := domain.ComputeBracketPlaces(view)

	for _, e := range entries {
		if e.PlaceFrom == 1 {
			t.Errorf("unresolved final should not produce a champion entry, got %v", e)
		}
	}
}

// ---------------------------------------------------------------------
// ComputeGroupPlaces (спека 0021, FR-12).
// ---------------------------------------------------------------------

func TestComputeGroupPlaces_SingleGroupWithTie(t *testing.T) {
	// AC-10: одна группа, двое полностью равны на 2-м месте -> 1, 2-3, 2-3, 4.
	group := domain.SourceGroup{
		PoolID: "pool-1",
		Label:  "Группа 1",
		Standings: []domain.Standing{
			{Fighter: fr("f1"), Wins: 3, PointsScored: 15, PointsConceded: 3, Place: 1},
			{Fighter: fr("f2"), Wins: 2, PointsScored: 10, PointsConceded: 6, Place: 2},
			{Fighter: fr("f3"), Wins: 2, PointsScored: 10, PointsConceded: 6, Place: 2},
			{Fighter: fr("f4"), Wins: 0, PointsScored: 2, PointsConceded: 12, Place: 4},
		},
	}

	entries := domain.ComputeGroupPlaces([]domain.SourceGroup{group})
	if len(entries) != 4 {
		t.Fatalf("len(entries) = %d, want 4; entries=%v", len(entries), entries)
	}

	assertPlace := func(id string, from, to int) {
		gotFrom, gotTo := placeRangesFor(t, entries, id)
		if gotFrom != from || gotTo != to {
			t.Errorf("fighter %s: place = %d-%d, want %d-%d", id, gotFrom, gotTo, from, to)
		}
	}
	assertPlace("f1", 1, 1)
	assertPlace("f2", 2, 3)
	assertPlace("f3", 2, 3)
	assertPlace("f4", 4, 4)
}

func TestComputeGroupPlaces_MultipleGroups(t *testing.T) {
	// AC-11: несколько групп — места из сводного порядка этапа, развёрнутого
	// в диапазоны; не паникует и не путает границы при разных размерах групп.
	groupA := domain.SourceGroup{
		PoolID: "pool-a",
		Label:  "Группа 1",
		Standings: []domain.Standing{
			{Fighter: fr("a1"), Wins: 3, PointsScored: 15, PointsConceded: 3, Place: 1},
			{Fighter: fr("a2"), Wins: 1, PointsScored: 8, PointsConceded: 10, Place: 2},
			{Fighter: fr("a3"), Wins: 0, PointsScored: 4, PointsConceded: 14, Place: 3},
		},
	}
	groupB := domain.SourceGroup{
		PoolID: "pool-b",
		Label:  "Группа 2",
		Standings: []domain.Standing{
			{Fighter: fr("b1"), Wins: 2, PointsScored: 12, PointsConceded: 6, Place: 1},
			{Fighter: fr("b2"), Wins: 1, PointsScored: 7, PointsConceded: 9, Place: 2},
		},
	}

	entries := domain.ComputeGroupPlaces([]domain.SourceGroup{groupA, groupB})
	if len(entries) != 5 {
		t.Fatalf("len(entries) = %d, want 5; entries=%v", len(entries), entries)
	}

	// Оба групповых первых места равны по GroupPlace(1) — дальше решает
	// критерий Wins/очков (0016): a1 (3 побед) впереди b1 (2 победы).
	assertPlace := func(id string, from, to int) {
		gotFrom, gotTo := placeRangesFor(t, entries, id)
		if gotFrom != from || gotTo != to {
			t.Errorf("fighter %s: place = %d-%d, want %d-%d", id, gotFrom, gotTo, from, to)
		}
	}
	assertPlace("a1", 1, 1)
	assertPlace("b1", 2, 2)

	// Диапазоны не перекрываются и суммарно покрывают 1..5 без дырок/дублей.
	seen := make(map[int]bool)
	for _, e := range entries {
		for p := e.PlaceFrom; p <= e.PlaceTo; p++ {
			seen[p] = true
		}
	}
	for p := 1; p <= 5; p++ {
		if !seen[p] {
			t.Errorf("place %d not covered by any entry", p)
		}
	}
}
