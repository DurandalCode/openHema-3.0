package domain_test

import (
	"reflect"
	"testing"

	"github.com/hema/server/modules/stage/domain"
)

// ---------------------------------------------------------------------
// T5 — DiagnoseSchema (FR-8, FR-8a, FR-9, NFR-2).
// ---------------------------------------------------------------------

// diagGroups — групповой этап-источник с заданным числом групп, без
// собственного правила (первый этап схемы).
func diagGroups(id string, position int, groupCount int) domain.Stage {
	return domain.Stage{
		ID:       id,
		Position: position,
		Title:    "Групповой этап " + id,
		Type:     domain.StageTypeGroups,
		Groups:   domain.GroupsConfig{GroupCount: groupCount},
	}
}

// diagBracket — этап-сетка данного размера, питающийся правилом
// group_places [from..to] от sourceID (to == 0 — открытая граница).
func diagBracket(id string, position int, size int, sourceID string, from, to int) domain.Stage {
	return domain.Stage{
		ID:       id,
		Position: position,
		Title:    "Сетка " + id,
		Type:     domain.StageTypeBracket,
		Bracket:  domain.BracketConfig{Size: size},
		Rule: domain.SeedingRule{
			SourceKind:    domain.SourceKindStage,
			SourceStageID: sourceID,
			Selector:      domain.SelectorKindGroupPlaces,
			PlaceFrom:     from,
			PlaceTo:       to,
			Method:        domain.LayoutMethodSeeded,
		},
	}
}

// diagBracketOverall — как diagBracket, но селектор overall_places.
func diagBracketOverall(id string, position int, size int, sourceID string, from, to int) domain.Stage {
	s := diagBracket(id, position, size, sourceID, from, to)
	s.Rule.Selector = domain.SelectorKindOverallPlaces
	return s
}

// diagFinalOverall — «финал трёх» (групповой этап на 1 группу),
// питающийся правилом overall_places [from..to] от sourceID (FR-8a).
func diagFinalOverall(id string, position int, sourceID string, from, to int) domain.Stage {
	return domain.Stage{
		ID:       id,
		Position: position,
		Title:    "Финал " + id,
		Type:     domain.StageTypeGroups,
		Groups:   domain.GroupsConfig{GroupCount: 1},
		Rule: domain.SeedingRule{
			SourceKind:    domain.SourceKindStage,
			SourceStageID: sourceID,
			Selector:      domain.SelectorKindOverallPlaces,
			PlaceFrom:     from,
			PlaceTo:       to,
			Method:        domain.LayoutMethodSnake,
		},
	}
}

func filterByCode(issues []domain.SchemaIssue, code domain.SchemaIssueCode) []domain.SchemaIssue {
	var out []domain.SchemaIssue
	for _, iss := range issues {
		if iss.Code == code {
			out = append(out, iss)
		}
	}
	return out
}

// stripMessages — Message формирует сервер человекочитаемым текстом;
// сравнивать его дословно в тестах незачем (хрупко к правкам формулировок).
// Тесты сравнивают срез целиком по Severity/Code/StageIDs.
func stripMessages(issues []domain.SchemaIssue) []domain.SchemaIssue {
	out := make([]domain.SchemaIssue, len(issues))
	for i, iss := range issues {
		out[i] = domain.SchemaIssue{Severity: iss.Severity, Code: iss.Code, StageIDs: iss.StageIDs}
	}
	return out
}

// TestDiagnoseSchema_ValidSchema_Empty — непротиворечивая схема с открытой
// верхней границей отбора (вместимость не оценивается, хвост считается
// покрытым, FR-8/NFR-2) даёт пустой срез.
func TestDiagnoseSchema_ValidSchema_Empty(t *testing.T) {
	a := diagGroups("a", 0, 4)
	b := diagBracket("b", 1, 8, "a", 1, 0) // «1 и ниже» — вся выборка целиком

	got := domain.DiagnoseSchema([]domain.Stage{a, b})
	if len(got) != 0 {
		t.Fatalf("expected no issues for a consistent schema, got %+v", got)
	}
}

// TestDiagnoseSchema_NoGroupCount — групповой этап с правилом отбора, но
// без заданного числа групп (FR-7/FR-9a).
func TestDiagnoseSchema_NoGroupCount(t *testing.T) {
	a := diagGroups("a", 0, 4)
	target := diagFinalOverall("final", 1, "a", 1, 0) // открытая граница — без побочных tail/gap
	target.Groups.GroupCount = 0

	got := domain.DiagnoseSchema([]domain.Stage{a, target})
	if len(got) != 1 {
		t.Fatalf("expected exactly 1 issue, got %+v", got)
	}
	if got[0].Severity != domain.SchemaIssueSeverityError || got[0].Code != domain.SchemaIssueCodeNoGroupCount {
		t.Fatalf("unexpected issue: %+v", got[0])
	}
	if !reflect.DeepEqual(got[0].StageIDs, []string{"final"}) {
		t.Fatalf("unexpected stage ids: %+v", got[0].StageIDs)
	}
}

// TestDiagnoseSchema_BadSource — источник правила не групповой этап
// (0019, FR-2).
func TestDiagnoseSchema_BadSource(t *testing.T) {
	src := domain.Stage{ID: "src", Position: 0, Title: "Сетка-источник", Type: domain.StageTypeBracket, Bracket: domain.BracketConfig{Size: 8}}
	target := diagBracket("target", 1, 4, "src", 1, 0) // открытая граница — без побочных tail/gap

	got := domain.DiagnoseSchema([]domain.Stage{src, target})
	if len(got) != 1 {
		t.Fatalf("expected exactly 1 issue, got %+v", got)
	}
	if got[0].Severity != domain.SchemaIssueSeverityError || got[0].Code != domain.SchemaIssueCodeBadSource {
		t.Fatalf("unexpected issue: %+v", got[0])
	}
	if !reflect.DeepEqual(got[0].StageIDs, []string{"target"}) {
		t.Fatalf("unexpected stage ids: %+v", got[0].StageIDs)
	}
}

// TestDiagnoseSchema_SourceCycle — FR-4: этап косвенно питается от самого
// себя. По конструкции 2-цикла хотя бы одна сторона также не «строго раньше»
// по позиции (BadSource сопутствует) — тест проверяет именно SourceCycle,
// не полный список.
func TestDiagnoseSchema_SourceCycle(t *testing.T) {
	a := domain.Stage{
		ID: "a", Position: 0, Title: "A", Type: domain.StageTypeGroups,
		Groups: domain.GroupsConfig{GroupCount: 2},
		Rule: domain.SeedingRule{
			SourceKind: domain.SourceKindStage, SourceStageID: "b",
			Selector: domain.SelectorKindGroupPlaces, PlaceFrom: 1, PlaceTo: 2,
			Method: domain.LayoutMethodSnake,
		},
	}
	b := domain.Stage{
		ID: "b", Position: 0, Title: "B", Type: domain.StageTypeGroups,
		Groups: domain.GroupsConfig{GroupCount: 2},
		Rule: domain.SeedingRule{
			SourceKind: domain.SourceKindStage, SourceStageID: "a",
			Selector: domain.SelectorKindGroupPlaces, PlaceFrom: 1, PlaceTo: 2,
			Method: domain.LayoutMethodSnake,
		},
	}

	got := domain.DiagnoseSchema([]domain.Stage{a, b})
	cycles := filterByCode(got, domain.SchemaIssueCodeSourceCycle)
	if len(cycles) != 2 {
		t.Fatalf("expected exactly 2 cycle issues (one per stage), got %+v", got)
	}
	for _, iss := range cycles {
		if iss.Severity != domain.SchemaIssueSeverityError {
			t.Fatalf("unexpected severity: %+v", iss)
		}
	}
}

// TestDiagnoseSchema_SelectorOverlap — AC-8: ветки «места 1-2» и «места 2-3»
// пересекаются по месту 2.
func TestDiagnoseSchema_SelectorOverlap(t *testing.T) {
	a := diagGroups("a", 0, 4)
	b1 := diagBracket("b1", 1, 8, "a", 1, 2)
	b2 := diagBracket("b2", 1, 8, "a", 2, 3)

	got := domain.DiagnoseSchema([]domain.Stage{a, b1, b2})
	overlaps := filterByCode(got, domain.SchemaIssueCodeSelectorOverlap)
	if len(overlaps) != 1 {
		t.Fatalf("expected exactly 1 overlap issue, got %+v", got)
	}
	if overlaps[0].Severity != domain.SchemaIssueSeverityError {
		t.Fatalf("expected error severity, got %+v", overlaps[0])
	}
	if !reflect.DeepEqual(overlaps[0].StageIDs, []string{"b1", "b2"}) {
		t.Fatalf("unexpected stage ids: %+v", overlaps[0].StageIDs)
	}
}

// TestDiagnoseSchema_CapacityUnderfill — AC-9: отбор (8) заведомо меньше
// размера сетки (16).
func TestDiagnoseSchema_CapacityUnderfill(t *testing.T) {
	a := diagGroups("a", 0, 4)
	b := diagBracket("b", 1, 16, "a", 1, 2) // 4 группы * 2 места = 8 < 16

	got := domain.DiagnoseSchema([]domain.Stage{a, b})
	underfills := filterByCode(got, domain.SchemaIssueCodeCapacityUnderfill)
	if len(underfills) != 1 {
		t.Fatalf("expected exactly 1 underfill issue, got %+v", got)
	}
	if underfills[0].Severity != domain.SchemaIssueSeverityWarning {
		t.Fatalf("unexpected severity: %+v", underfills[0])
	}
	if !reflect.DeepEqual(underfills[0].StageIDs, []string{"b"}) {
		t.Fatalf("unexpected stage ids: %+v", underfills[0].StageIDs)
	}
}

// TestDiagnoseSchema_CapacityExceeded — AC-10a: отобранных (8) больше, чем
// слотов сетки (4).
func TestDiagnoseSchema_CapacityExceeded(t *testing.T) {
	a := diagGroups("a", 0, 4)
	b := diagBracket("b", 1, 4, "a", 1, 2) // 4 группы * 2 места = 8 > 4

	got := domain.DiagnoseSchema([]domain.Stage{a, b})
	exceeded := filterByCode(got, domain.SchemaIssueCodeCapacityExceeded)
	if len(exceeded) != 1 {
		t.Fatalf("expected exactly 1 exceeded issue, got %+v", got)
	}
	if exceeded[0].Severity != domain.SchemaIssueSeverityError {
		t.Fatalf("unexpected severity: %+v", exceeded[0])
	}
	if !reflect.DeepEqual(exceeded[0].StageIDs, []string{"b"}) {
		t.Fatalf("unexpected stage ids: %+v", exceeded[0].StageIDs)
	}
}

// TestDiagnoseSchema_TailUncovered_And_CoverageGap — AC-10: единственная
// ветка «места 1-2» оставляет хвост непокрытым (info); при ветках «1-2» и
// «4 и ниже» дополнительно разрыв по месту 3 (warning), хвост уже покрыт
// (открытая верхняя граница второй ветки).
func TestDiagnoseSchema_TailUncovered_And_CoverageGap(t *testing.T) {
	a := diagGroups("a", 0, 4)
	b := diagBracket("b", 1, 8, "a", 1, 2)

	got := domain.DiagnoseSchema([]domain.Stage{a, b})
	tails := filterByCode(got, domain.SchemaIssueCodeTailUncovered)
	if len(tails) != 1 {
		t.Fatalf("expected exactly 1 tail-uncovered issue, got %+v", got)
	}
	if tails[0].Severity != domain.SchemaIssueSeverityInfo {
		t.Fatalf("expected info severity, got %+v", tails[0])
	}
	if !reflect.DeepEqual(tails[0].StageIDs, []string{"b"}) {
		t.Fatalf("unexpected stage ids: %+v", tails[0].StageIDs)
	}

	// Добавляем вторую ветку «4 и ниже» (открытая граница) — разрыв по
	// месту 3, хвост теперь покрыт.
	c := diagBracket("c", 1, 8, "a", 4, 0)
	got2 := domain.DiagnoseSchema([]domain.Stage{a, b, c})

	gaps := filterByCode(got2, domain.SchemaIssueCodeCoverageGap)
	if len(gaps) != 1 {
		t.Fatalf("expected exactly 1 coverage-gap issue, got %+v", got2)
	}
	if gaps[0].Severity != domain.SchemaIssueSeverityWarning {
		t.Fatalf("expected warning severity, got %+v", gaps[0])
	}
	if len(filterByCode(got2, domain.SchemaIssueCodeTailUncovered)) != 0 {
		t.Fatalf("expected no tail-uncovered once an open-ended branch exists, got %+v", got2)
	}
}

// TestDiagnoseSchema_OverlapUnknown — окна разных видов (места в группе
// против сводного порядка) от одного источника: пересечение статически не
// выводится.
func TestDiagnoseSchema_OverlapUnknown(t *testing.T) {
	a := diagGroups("a", 0, 4)
	b := diagBracket("b", 1, 8, "a", 1, 2)          // group_places
	c := diagBracketOverall("c", 1, 8, "a", 10, 12) // overall_places, численно не пересекается

	got := domain.DiagnoseSchema([]domain.Stage{a, b, c})
	unknowns := filterByCode(got, domain.SchemaIssueCodeOverlapUnknown)
	if len(unknowns) != 1 {
		t.Fatalf("expected exactly 1 overlap-unknown issue, got %+v", got)
	}
	if unknowns[0].Severity != domain.SchemaIssueSeverityWarning {
		t.Fatalf("expected warning severity, got %+v", unknowns[0])
	}
	if len(filterByCode(got, domain.SchemaIssueCodeSelectorOverlap)) != 0 {
		t.Fatalf("mixed-kind windows must not be reported as a definite overlap: %+v", got)
	}
}

// TestDiagnoseSchema_EstimateImpossible — NFR-2/AC-11: открытая верхняя
// граница, селектор ALL и источник-ростер не дают ни CAPACITY_*, ни
// COVERAGE_GAP/TAIL_UNCOVERED — оценка честно не делается вовсе.
func TestDiagnoseSchema_EstimateImpossible(t *testing.T) {
	a := diagGroups("a", 0, 4)
	openBranch := diagBracket("open", 1, 8, "a", 3, 0) // «3 и ниже»
	got := domain.DiagnoseSchema([]domain.Stage{a, openBranch})
	if len(got) != 0 {
		t.Fatalf("expected no issues for an open-ended selector, got %+v", got)
	}

	allBranch := domain.Stage{
		ID: "all", Position: 1, Title: "Сетка ALL", Type: domain.StageTypeBracket,
		Bracket: domain.BracketConfig{Size: 8},
		Rule: domain.SeedingRule{
			SourceKind:    domain.SourceKindStage,
			SourceStageID: "a",
			Selector:      domain.SelectorKindAll,
			Method:        domain.LayoutMethodSeeded,
		},
	}
	got2 := domain.DiagnoseSchema([]domain.Stage{a, allBranch})
	if len(got2) != 0 {
		t.Fatalf("expected no issues for an ALL selector, got %+v", got2)
	}

	roster := domain.Stage{
		ID: "roster-fed", Position: 0, Title: "Групповой из ростера", Type: domain.StageTypeGroups,
		Groups: domain.GroupsConfig{GroupCount: 2},
		Rule: domain.SeedingRule{
			SourceKind: domain.SourceKindRoster,
			Selector:   domain.SelectorKindAll,
			Method:     domain.LayoutMethodSnake,
		},
	}
	got3 := domain.DiagnoseSchema([]domain.Stage{roster})
	if len(got3) != 0 {
		t.Fatalf("expected no issues for a roster source, got %+v", got3)
	}
}

// TestDiagnoseSchema_ThreeParallelBranches_NoIssues — FR-8a/AC-20: три и
// более параллельные ветки от одного источника с непересекающимися,
// смежными (без разрыва) закрытыми/открытыми окнами — ни ошибок, ни
// предупреждений.
func TestDiagnoseSchema_ThreeParallelBranches_NoIssues(t *testing.T) {
	a := diagGroups("a", 0, 4)
	b1 := diagBracket("b1", 1, 8, "a", 1, 2)
	b2 := diagBracket("b2", 1, 8, "a", 3, 4)
	b3 := diagBracket("b3", 1, 8, "a", 5, 0) // «5 и ниже» — открытая граница

	got := domain.DiagnoseSchema([]domain.Stage{a, b1, b2, b3})
	if len(got) != 0 {
		t.Fatalf("expected no issues for three non-overlapping parallel branches, got %+v", got)
	}
}

// TestDiagnoseSchema_SingleGroupStage_NotAProblem — AC-21: групповой этап на
// одну группу (даже с правилом отбора) не считается проблемой (FR-8a). Сам
// финал — единственная ветка от источника, поэтому непокрытый хвост
// (нормальный исход отбора) остаётся единственной строкой диагностики.
func TestDiagnoseSchema_SingleGroupStage_NotAProblem(t *testing.T) {
	a := diagGroups("a", 0, 3)
	final := diagFinalOverall("final", 1, "a", 1, 3)

	got := domain.DiagnoseSchema([]domain.Stage{a, final})
	if len(got) != 1 {
		t.Fatalf("expected exactly the tail-uncovered info issue, got %+v", got)
	}
	if got[0].Code != domain.SchemaIssueCodeTailUncovered {
		t.Fatalf("expected only tail-uncovered (single-group stage itself is not a problem), got %+v", got)
	}
}

// TestDiagnoseSchema_FinalFromSameSourceAsBracket_Overlap — AC-21a: финал
// (групповой этап на одну группу), питающийся правилом от ТОГО ЖЕ источника,
// что и сетка от этого источника, — оба окна overall_places и физически
// перекрываются местами → SelectorOverlap.
func TestDiagnoseSchema_FinalFromSameSourceAsBracket_Overlap(t *testing.T) {
	a := diagGroups("a", 0, 4)
	bracket := diagBracketOverall("bracket", 1, 8, "a", 1, 2)
	final := diagFinalOverall("final", 1, "a", 1, 3)

	got := domain.DiagnoseSchema([]domain.Stage{a, bracket, final})
	overlaps := filterByCode(got, domain.SchemaIssueCodeSelectorOverlap)
	if len(overlaps) != 1 {
		t.Fatalf("expected exactly 1 overlap issue, got %+v", got)
	}
	if overlaps[0].Severity != domain.SchemaIssueSeverityError {
		t.Fatalf("expected error severity, got %+v", overlaps[0])
	}
	if !reflect.DeepEqual(overlaps[0].StageIDs, []string{"bracket", "final"}) {
		t.Fatalf("unexpected stage ids: %+v", overlaps[0].StageIDs)
	}
}

// TestDiagnoseSchema_DeterministicOrder — несколько проблем разом:
// сортировка сначала по severity (error, warning, info), затем по позиции
// этапа, затем по коду — весь срез сравнивается целиком (без учёта
// человекочитаемого Message) и не зависит от порядка этапов на входе.
func TestDiagnoseSchema_DeterministicOrder(t *testing.T) {
	a := diagGroups("a", 0, 4)
	b1 := diagBracket("b1", 1, 8, "a", 1, 2)
	b2 := diagBracket("b2", 1, 8, "a", 1, 3) // пересекается с b1 (error) и превышает вместимость (error)

	badSrcTarget := diagBracket("bad", 1, 8, "missing-source", 1, 2) // BadSource (error)

	f := diagGroups("f", 0, 2)
	e := diagBracket("e", 1, 32, "f", 1, 2) // 2*2=4 < 32 — CapacityUnderfill (warning) + хвост не покрыт (info)

	stages := []domain.Stage{a, b1, b2, badSrcTarget, f, e}
	got := domain.DiagnoseSchema(stages)

	want := []domain.SchemaIssue{
		{Severity: domain.SchemaIssueSeverityError, Code: domain.SchemaIssueCodeBadSource, StageIDs: []string{"bad"}},
		{Severity: domain.SchemaIssueSeverityError, Code: domain.SchemaIssueCodeCapacityExceeded, StageIDs: []string{"b2"}},
		{Severity: domain.SchemaIssueSeverityError, Code: domain.SchemaIssueCodeSelectorOverlap, StageIDs: []string{"b1", "b2"}},
		{Severity: domain.SchemaIssueSeverityWarning, Code: domain.SchemaIssueCodeCapacityUnderfill, StageIDs: []string{"e"}},
		{Severity: domain.SchemaIssueSeverityInfo, Code: domain.SchemaIssueCodeTailUncovered, StageIDs: []string{"b1", "b2"}},
		{Severity: domain.SchemaIssueSeverityInfo, Code: domain.SchemaIssueCodeTailUncovered, StageIDs: []string{"e"}},
	}
	if !reflect.DeepEqual(stripMessages(got), want) {
		t.Fatalf("unexpected order/content:\n got:  %+v\n want: %+v", stripMessages(got), want)
	}

	// Порядок входных этапов не должен влиять на результат.
	reversed := make([]domain.Stage, len(stages))
	for i, s := range stages {
		reversed[len(stages)-1-i] = s
	}
	got2 := domain.DiagnoseSchema(reversed)
	if !reflect.DeepEqual(got, got2) {
		t.Fatalf("expected the same deterministic order regardless of input order:\n%+v\nvs\n%+v", got, got2)
	}
}
