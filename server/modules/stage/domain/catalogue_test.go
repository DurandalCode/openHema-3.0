// Тесты каталога встроенных пресетов (спека 0047, FR-2/FR-3/FR-4, NFR-1).
package domain_test

import (
	"strings"
	"testing"

	"github.com/hema/server/modules/stage/domain"
)

func TestBuiltinPresets_T2_TenEntries(t *testing.T) {
	presets := domain.BuiltinPresets()
	if len(presets) != 10 {
		t.Fatalf("expected 10 builtin presets, got %d", len(presets))
	}
}

func TestBuiltinPresets_T2_UniqueKeysAndNames(t *testing.T) {
	presets := domain.BuiltinPresets()
	keys := make(map[string]bool, len(presets))
	names := make(map[string]bool, len(presets))
	for _, p := range presets {
		if p.Key == "" {
			t.Fatalf("preset %q has empty key", p.Name)
		}
		if p.Name == "" {
			t.Fatalf("preset key %q has empty name", p.Key)
		}
		if keys[p.Key] {
			t.Fatalf("duplicate key %q", p.Key)
		}
		keys[p.Key] = true
		if names[p.Name] {
			t.Fatalf("duplicate name %q", p.Name)
		}
		names[p.Name] = true
	}
}

// NFR-1: каждая запись каталога исполнима структурно — та же проверка, что
// проходит пользовательский пресет при сохранении/применении (0020, FR-11).
func TestBuiltinPresets_T2_AllValidateStructurally(t *testing.T) {
	for _, p := range domain.BuiltinPresets() {
		if err := domain.ValidateFormatSpec(p.Spec); err != nil {
			t.Fatalf("preset %q (%s): ValidateFormatSpec failed: %v", p.Name, p.Key, err)
		}
	}
}

// FR-4: имя пресета самодостаточно — схема и вариант масштаба видны без
// обращения к спецификации. Три из четырёх схем поставляются в вариантах.
func TestBuiltinPresets_T2_NamesCarryScaleVariant(t *testing.T) {
	wantSubstrings := []string{"(до 8)", "(до 16)", "(до 32)"}
	for _, want := range wantSubstrings {
		found := false
		for _, p := range domain.BuiltinPresets() {
			if strings.Contains(p.Name, want) {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("expected some preset name to contain %q", want)
		}
	}
}

// AC-2/AC-3: целевая схема — групповой этап + две сетки от него, отбор
// точно заполняет сетку (2 × groupCount == bracketSize), окна веток не
// пересекаются (1–2 против 3 и ниже).
func TestBuiltinPresets_T2_TargetSchemaShape(t *testing.T) {
	preset := findBuiltinPreset(t, "groups-double-playoff-16")

	if len(preset.Spec.Stages) != 3 {
		t.Fatalf("expected 3 stages, got %d", len(preset.Spec.Stages))
	}
	groups := preset.Spec.Stages[0]
	main := preset.Spec.Stages[1]
	consolation := preset.Spec.Stages[2]

	if groups.Type != domain.StageTypeGroups {
		t.Fatalf("expected stage 0 to be groups, got %v", groups.Type)
	}
	if groups.Groups.GroupCount != 4 {
		t.Fatalf("expected 4 groups, got %d", groups.Groups.GroupCount)
	}
	if groups.SourceKind != domain.SourceKindRoster {
		t.Fatalf("expected groups stage sourced from roster, got %v", groups.SourceKind)
	}

	for _, bracket := range []domain.FormatStageSpec{main, consolation} {
		if bracket.Type != domain.StageTypeBracket {
			t.Fatalf("expected bracket stage, got %v", bracket.Type)
		}
		if bracket.SourceKind != domain.SourceKindStage || bracket.SourceIndex != 0 {
			t.Fatalf("expected bracket sourced from stage 0, got kind=%v index=%d", bracket.SourceKind, bracket.SourceIndex)
		}
		if bracket.Selector != domain.SelectorKindGroupPlaces {
			t.Fatalf("expected GROUP_PLACES selector, got %v", bracket.Selector)
		}
		if bracket.Bracket.Size != 8 {
			t.Fatalf("expected bracket size 8, got %d", bracket.Bracket.Size)
		}
		if !bracket.Bracket.ThirdPlace {
			t.Fatalf("expected third place bout in both brackets (ADR 0014 §1)")
		}
	}

	if main.PlaceFrom != 1 || main.PlaceTo != 2 {
		t.Fatalf("expected main bracket window 1-2, got %d-%d", main.PlaceFrom, main.PlaceTo)
	}
	if consolation.PlaceFrom != 3 || consolation.PlaceTo != 0 {
		t.Fatalf("expected consolation bracket window 3-open, got %d-%d", consolation.PlaceFrom, consolation.PlaceTo)
	}

	// Отбор 2×groupCount заполняет сетку ровно (NFR-1): 2*4 == 8.
	if got, want := 2*groups.Groups.GroupCount, main.Bracket.Size; got != want {
		t.Fatalf("expected selection to exactly fill bracket: 2*groupCount=%d, bracketSize=%d", got, want)
	}
}

func TestBuiltinPresets_T2_RoundRobinIsSingleGroupWithoutVariant(t *testing.T) {
	preset := findBuiltinPreset(t, "round-robin")
	if len(preset.Spec.Stages) != 1 {
		t.Fatalf("expected 1 stage, got %d", len(preset.Spec.Stages))
	}
	stage := preset.Spec.Stages[0]
	if stage.Type != domain.StageTypeGroups || stage.Groups.GroupCount != 1 {
		t.Fatalf("expected single-group groups stage, got type=%v groupCount=%d", stage.Type, stage.Groups.GroupCount)
	}
	for _, suffix := range []string{"(до 8)", "(до 16)", "(до 32)"} {
		if strings.Contains(preset.Name, suffix) {
			t.Fatalf("round-robin preset should not carry a scale variant, got name %q", preset.Name)
		}
	}
}

func findBuiltinPreset(t *testing.T, key string) domain.BuiltinPreset {
	t.Helper()
	for _, p := range domain.BuiltinPresets() {
		if p.Key == key {
			return p
		}
	}
	t.Fatalf("builtin preset with key %q not found", key)
	return domain.BuiltinPreset{}
}
