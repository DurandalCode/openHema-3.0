package domain_test

import (
	"reflect"
	"testing"

	"github.com/hema/server/modules/stage/domain"
)

// ---------------------------------------------------------------------
// T3 — SpecFromStages, ValidateFormatSpec (FR-11, FR-15, FR-16).
// ---------------------------------------------------------------------

func groupsStage(id string, position int, title string) domain.Stage {
	return domain.Stage{
		ID:       id,
		Position: position,
		Title:    title,
		Type:     domain.StageTypeGroups,
		Groups:   domain.GroupsConfig{GroupCount: 2},
	}
}

func bracketStage(id string, position int, title string) domain.Stage {
	return domain.Stage{
		ID:       id,
		Position: position,
		Title:    title,
		Type:     domain.StageTypeBracket,
		Bracket:  domain.BracketConfig{Size: 8},
	}
}

func withGroupPlacesRule(s domain.Stage, sourceID string, from, to int) domain.Stage {
	s.Rule = domain.SeedingRule{
		SourceKind:    domain.SourceKindStage,
		SourceStageID: sourceID,
		Selector:      domain.SelectorKindGroupPlaces,
		PlaceFrom:     from,
		PlaceTo:       to,
		Method:        seededOrSnake(s),
	}
	return s
}

func seededOrSnake(s domain.Stage) domain.LayoutMethod {
	if s.Type == domain.StageTypeBracket {
		return domain.LayoutMethodSeeded
	}
	return domain.LayoutMethodSnake
}

func TestSpecFromStages_SourceUUIDsBecomeIndices(t *testing.T) {
	a := groupsStage("a", 0, "Группы")
	b := bracketStage("b", 1, "Сетка")
	b = withGroupPlacesRule(b, "a", 1, 2)

	spec := domain.SpecFromStages([]domain.Stage{a, b})
	if len(spec.Stages) != 2 {
		t.Fatalf("expected 2 stages, got %d: %+v", len(spec.Stages), spec.Stages)
	}
	if spec.Stages[1].SourceKind != domain.SourceKindStage {
		t.Fatalf("expected stage source kind, got %+v", spec.Stages[1])
	}
	if spec.Stages[1].SourceIndex != 0 {
		t.Fatalf("expected source index 0 (points to a), got %d", spec.Stages[1].SourceIndex)
	}
}

func TestSpecFromStages_OrderByPositionThenTitle(t *testing.T) {
	// Две ветки на одинаковой позиции (параллельны) — порядок между ними
	// определяется названием.
	a := groupsStage("a", 0, "Группы")
	c := bracketStage("c", 1, "Сетка Б")
	b := bracketStage("b", 1, "Сетка А")
	c = withGroupPlacesRule(c, "a", 1, 2)
	b = withGroupPlacesRule(b, "a", 3, 4)

	spec := domain.SpecFromStages([]domain.Stage{c, a, b})
	if len(spec.Stages) != 3 {
		t.Fatalf("expected 3 stages, got %d", len(spec.Stages))
	}
	got := []string{spec.Stages[0].Title, spec.Stages[1].Title, spec.Stages[2].Title}
	want := []string{"Группы", "Сетка А", "Сетка Б"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected order %v, got %v", want, got)
	}
}

func TestSpecFromStages_TwoBranchesFromSameSource(t *testing.T) {
	a := groupsStage("a", 0, "Группы")
	b1 := withGroupPlacesRule(bracketStage("b1", 1, "Сетка 1"), "a", 1, 2)
	b2 := withGroupPlacesRule(bracketStage("b2", 1, "Сетка 2"), "a", 3, 4)

	spec := domain.SpecFromStages([]domain.Stage{a, b1, b2})
	if spec.Stages[1].SourceIndex != 0 || spec.Stages[2].SourceIndex != 0 {
		t.Fatalf("expected both branches to reference index 0, got %+v", spec.Stages)
	}
}

func TestSpecFromStages_StageWithoutRule(t *testing.T) {
	a := groupsStage("a", 0, "Группы")
	// Финал вручную — без правила (0019, FR-28).
	final := groupsStage("final", 1, "Финал")

	spec := domain.SpecFromStages([]domain.Stage{a, final})
	got := spec.Stages[1]
	if got.SourceKind != "" || got.SourceIndex != -1 {
		t.Fatalf("expected no rule (SourceKind empty, SourceIndex -1), got %+v", got)
	}
}

func TestSpecFromStages_OrphanedSourceLosesRule(t *testing.T) {
	// b ссылается на этап "a", которого нет в переданном наборе —
	// осиротевшая ссылка, правило теряется, а не переносится сломанным
	// индексом.
	b := withGroupPlacesRule(bracketStage("b", 1, "Сетка"), "a", 1, 2)

	spec := domain.SpecFromStages([]domain.Stage{b})
	got := spec.Stages[0]
	if got.SourceKind != "" || got.SourceIndex != -1 {
		t.Fatalf("expected rule to be dropped for orphaned source, got %+v", got)
	}
}

func TestSpecFromStages_RosterSource(t *testing.T) {
	a := groupsStage("a", 0, "Группы")
	a.Rule = domain.SeedingRule{
		SourceKind: domain.SourceKindRoster,
		Selector:   domain.SelectorKindAll,
		Method:     domain.LayoutMethodSnake,
	}

	spec := domain.SpecFromStages([]domain.Stage{a})
	got := spec.Stages[0]
	if got.SourceKind != domain.SourceKindRoster || got.SourceIndex != -1 {
		t.Fatalf("expected roster source with index -1, got %+v", got)
	}
}

func validSpec() domain.FormatSpec {
	return domain.FormatSpec{Stages: []domain.FormatStageSpec{
		{
			Title:  "Группы",
			Type:   domain.StageTypeGroups,
			Groups: domain.GroupsConfig{GroupCount: 2},
		},
		{
			Title:       "Сетка",
			Type:        domain.StageTypeBracket,
			Bracket:     domain.BracketConfig{Size: 8},
			SourceKind:  domain.SourceKindStage,
			SourceIndex: 0,
			Selector:    domain.SelectorKindGroupPlaces,
			PlaceFrom:   1,
			PlaceTo:     2,
			Method:      domain.LayoutMethodSeeded,
		},
	}}
}

func TestValidateFormatSpec(t *testing.T) {
	tests := []struct {
		name    string
		spec    domain.FormatSpec
		wantErr bool
	}{
		{"valid spec", validSpec(), false},
		{"empty spec", domain.FormatSpec{}, true},
		{"source index out of bounds", func() domain.FormatSpec {
			s := validSpec()
			s.Stages[1].SourceIndex = 99
			return s
		}(), true},
		{"source index points forward (self)", func() domain.FormatSpec {
			s := validSpec()
			s.Stages[1].SourceIndex = 1
			return s
		}(), true},
		{"groups stage with rule but no group count", func() domain.FormatSpec {
			s := domain.FormatSpec{Stages: []domain.FormatStageSpec{
				{
					Title: "Группы источник",
					Type:  domain.StageTypeGroups,
					Groups: domain.GroupsConfig{
						GroupCount: 2,
					},
				},
				{
					Title:       "Финал",
					Type:        domain.StageTypeGroups,
					Groups:      domain.GroupsConfig{GroupCount: 0},
					SourceKind:  domain.SourceKindStage,
					SourceIndex: 0,
					Selector:    domain.SelectorKindOverallPlaces,
					PlaceFrom:   1,
					PlaceTo:     3,
					Method:      domain.LayoutMethodSnake,
				},
			}}
			return s
		}(), true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := domain.ValidateFormatSpec(tt.spec)
			if tt.wantErr && err == nil {
				t.Fatalf("expected error, got nil")
			}
			if !tt.wantErr && err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

// ---------------------------------------------------------------------
// T4 — ResolveStagePositions, DetectSourceCycle (FR-3, FR-4).
// ---------------------------------------------------------------------

func rosterSourced(s domain.Stage) domain.Stage {
	s.Rule = domain.SeedingRule{
		SourceKind: domain.SourceKindRoster,
		Selector:   domain.SelectorKindAll,
		Method:     seededOrSnake(s),
	}
	return s
}

func TestResolveStagePositions_Chain(t *testing.T) {
	a := rosterSourced(groupsStage("a", 0, "A"))
	b := withGroupPlacesRule(bracketStage("b", 1, "B"), "a", 1, 2)
	c := withGroupPlacesRule(groupsStage("c", 2, "C"), "b", 1, 2)

	got, err := domain.ResolveStagePositions([]domain.Stage{a, b, c})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got["a"] != 0 || got["b"] != 1 || got["c"] != 2 {
		t.Fatalf("unexpected positions: %+v", got)
	}
}

func TestResolveStagePositions_TwoBranchesSameSource_EqualPositions(t *testing.T) {
	a := rosterSourced(groupsStage("a", 0, "A"))
	b1 := withGroupPlacesRule(bracketStage("b1", 1, "B1"), "a", 1, 2)
	b2 := withGroupPlacesRule(bracketStage("b2", 1, "B2"), "a", 3, 4)

	got, err := domain.ResolveStagePositions([]domain.Stage{a, b1, b2})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got["b1"] != got["b2"] || got["b1"] != 1 {
		t.Fatalf("expected both branches at position 1, got %+v", got)
	}
}

// TestResolveStagePositions_StageWithoutRuleKeepsItsPosition — регресс-тест
// на AC-18 спеки 0019: этап без правила (например, «финал трёх» из
// победителей сеток, FR-8a) сохраняет свою текущую позицию, а не
// пересчитывается — иначе он вернулся бы в начало схемы вместо того, чтобы
// стоять последним уровнем.
func TestResolveStagePositions_StageWithoutRuleKeepsItsPosition(t *testing.T) {
	a := rosterSourced(groupsStage("a", 0, "A"))
	b := withGroupPlacesRule(bracketStage("b", 1, "B"), "a", 1, 2)
	// final — без правила, набирается руками; его текущая позиция (2) уже
	// стоит за всеми размещёнными этапами (0019, FR-28).
	final := groupsStage("final", 2, "Финал")

	got, err := domain.ResolveStagePositions([]domain.Stage{a, b, final})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got["final"] != 2 {
		t.Fatalf("expected stage without a rule to keep its position (2), got %d", got["final"])
	}
}

func TestResolveStagePositions_SourceSwitchInMiddleOfChain(t *testing.T) {
	a := rosterSourced(groupsStage("a", 0, "A"))
	d := rosterSourced(groupsStage("d", 0, "D"))
	b := withGroupPlacesRule(bracketStage("b", 1, "B"), "a", 1, 2)
	c := withGroupPlacesRule(groupsStage("c", 2, "C"), "b", 1, 2)

	// Меняем источник b с a на d — тот же уровень (оба источника-ростера
	// стоят на позиции 0), но c, зависящий от b, обязан пересчитаться вместе
	// с ним, если b сдвинется.
	b.Rule.SourceStageID = "d"

	got, err := domain.ResolveStagePositions([]domain.Stage{a, d, b, c})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got["b"] != 1 {
		t.Fatalf("expected b at position 1 (source d is at 0), got %d", got["b"])
	}
	if got["c"] != 2 {
		t.Fatalf("expected c cascaded to position 2, got %d", got["c"])
	}
}

func TestResolveStagePositions_RosterSourceIsPositionZero(t *testing.T) {
	a := rosterSourced(groupsStage("a", 5, "A"))

	got, err := domain.ResolveStagePositions([]domain.Stage{a})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got["a"] != 0 {
		t.Fatalf("expected roster-sourced stage at position 0, got %d", got["a"])
	}
}

func TestResolveStagePositions_Cycle_ReturnsErrSourceCycle(t *testing.T) {
	a := withGroupPlacesRule(groupsStage("a", 0, "A"), "b", 1, 2)
	b := withGroupPlacesRule(groupsStage("b", 1, "B"), "a", 1, 2)

	_, err := domain.ResolveStagePositions([]domain.Stage{a, b})
	if err != domain.ErrSourceCycle {
		t.Fatalf("expected ErrSourceCycle, got %v", err)
	}
}

func TestDetectSourceCycle_DirectSelfReference(t *testing.T) {
	stages := []domain.Stage{groupsStage("a", 0, "A")}
	if !domain.DetectSourceCycle(stages, "a", "a") {
		t.Fatalf("expected direct self-reference to be detected as a cycle")
	}
}

func TestDetectSourceCycle_ChainOfThree(t *testing.T) {
	// Текущая схема: b источник — a; a источник — c (C ← A ← B). Если c
	// назначить источником b — цикл замкнётся: c -> b -> a -> c.
	c := groupsStage("c", 0, "C")
	a := withGroupPlacesRule(groupsStage("a", 1, "A"), "c", 1, 2)
	b := withGroupPlacesRule(groupsStage("b", 2, "B"), "a", 1, 2)

	if !domain.DetectSourceCycle([]domain.Stage{a, b, c}, "c", "b") {
		t.Fatalf("expected a length-3 cycle to be detected")
	}
}

func TestDetectSourceCycle_NoCycle(t *testing.T) {
	a := groupsStage("a", 0, "A")
	b := withGroupPlacesRule(groupsStage("b", 1, "B"), "a", 1, 2)
	c := groupsStage("c", 2, "C")

	if domain.DetectSourceCycle([]domain.Stage{a, b, c}, "c", "b") {
		t.Fatalf("expected no cycle")
	}
}
