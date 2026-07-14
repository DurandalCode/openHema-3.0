package domain_test

import (
	"reflect"
	"sort"
	"testing"

	"github.com/hema/server/modules/pool/domain"
)

func TestNormalizeClub(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"Red", "red"},
		{"  Red  ", "red"},
		{"RED", "red"},
		{"", ""},
		{"   ", ""},
	}
	for _, c := range cases {
		if got := domain.NormalizeClub(c.in); got != c.want {
			t.Errorf("NormalizeClub(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestNextPoolNumber(t *testing.T) {
	cases := []struct {
		name     string
		existing []int
		want     int
	}{
		{"empty", nil, 1},
		{"sequential", []int{1, 2}, 3},
		{"gap reused", []int{1, 3}, 2},
		{"deleted first reused", []int{2}, 1},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := domain.NextPoolNumber(c.existing); got != c.want {
				t.Errorf("NextPoolNumber(%v) = %d, want %d", c.existing, got, c.want)
			}
		})
	}
}

// assignedMap строит map[fighterID]poolID из []Assignment для удобства сравнения.
func assignedMap(assignments []domain.Assignment) map[string]string {
	out := make(map[string]string, len(assignments))
	for _, a := range assignments {
		out[a.FighterID] = a.PoolID
	}
	return out
}

func poolSizes(existing []domain.Pool, assignments []domain.Assignment) map[string]int {
	sizes := make(map[string]int)
	for _, p := range existing {
		sizes[p.ID] = len(p.Members)
	}
	for _, a := range assignments {
		sizes[a.PoolID]++
	}
	return sizes
}

// AC-10: 2 пула P(1), Q(2) пустые; 6 нераспределённых: R1,R2,R3 (Red),
// B1,B2 (Blue), X (без клуба). Ожидание: P={B1,R1,R3}, Q={B2,R2,X}.
func TestAutoDistribute_AC10_BasicScenario(t *testing.T) {
	existing := []domain.Pool{
		{ID: "P", Number: 1, Members: nil},
		{ID: "Q", Number: 2, Members: nil},
	}
	unassigned := []domain.FighterRef{
		{ID: "R1", Club: "Red"},
		{ID: "R2", Club: "Red"},
		{ID: "R3", Club: "Red"},
		{ID: "B1", Club: "Blue"},
		{ID: "B2", Club: "Blue"},
		{ID: "X", Club: ""},
	}
	got := assignedMap(domain.AutoDistribute(existing, unassigned))
	want := map[string]string{
		"B1": "P", "R1": "P", "R3": "P",
		"B2": "Q", "R2": "Q", "X": "Q",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("AC-10: got %v, want %v", got, want)
	}
}

// AC-11: пул P(1) уже содержит R1; Q(2) пуст. Нераспределённые: R2,R3 (Red),
// B1,B2 (Blue), X. Ожидание: P (кроме R1) получает B2,R3; Q получает B1,R2,X.
func TestAutoDistribute_AC11_DoesNotTouchAlreadyAssigned(t *testing.T) {
	existing := []domain.Pool{
		{ID: "P", Number: 1, Members: []domain.FighterRef{{ID: "R1", Club: "Red"}}},
		{ID: "Q", Number: 2, Members: nil},
	}
	unassigned := []domain.FighterRef{
		{ID: "R2", Club: "Red"},
		{ID: "R3", Club: "Red"},
		{ID: "B1", Club: "Blue"},
		{ID: "B2", Club: "Blue"},
		{ID: "X", Club: ""},
	}
	got := assignedMap(domain.AutoDistribute(existing, unassigned))
	want := map[string]string{
		"B2": "P", "R3": "P",
		"B1": "Q", "R2": "Q", "X": "Q",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("AC-11: got %v, want %v", got, want)
	}
	// R1 остаётся в P: AutoDistribute не возвращает assignment для уже
	// расставленного бойца (он не в unassigned).
	for _, a := range domain.AutoDistribute(existing, unassigned) {
		if a.FighterID == "R1" {
			t.Fatalf("R1 must not appear in assignments (already placed)")
		}
	}
}

// AC-12: 1 пул, 4 бойца без клуба — пустой клуб не считается общим, все
// попадают в единственный пул (тривиально, но фиксируем поведение).
func TestAutoDistribute_AC12_EmptyClubNotCommon(t *testing.T) {
	existing := []domain.Pool{{ID: "P", Number: 1}}
	unassigned := []domain.FighterRef{
		{ID: "X1", Club: ""},
		{ID: "X2", Club: ""},
		{ID: "X3", Club: ""},
		{ID: "X4", Club: ""},
	}
	got := assignedMap(domain.AutoDistribute(existing, unassigned))
	for _, f := range unassigned {
		if got[f.ID] != "P" {
			t.Fatalf("expected %s in pool P, got %s", f.ID, got[f.ID])
		}
	}
}

// AC-13: детерминированность — повторный запуск с теми же входами даёт тот
// же результат.
func TestAutoDistribute_AC13_Deterministic(t *testing.T) {
	existing := []domain.Pool{
		{ID: "P", Number: 1, Members: []domain.FighterRef{{ID: "R1", Club: "Red"}}},
		{ID: "Q", Number: 2, Members: nil},
	}
	unassigned := []domain.FighterRef{
		{ID: "R2", Club: "Red"},
		{ID: "R3", Club: "Red"},
		{ID: "B1", Club: "Blue"},
		{ID: "B2", Club: "Blue"},
		{ID: "X", Club: ""},
	}
	first := domain.AutoDistribute(existing, unassigned)
	second := domain.AutoDistribute(existing, unassigned)
	sortAssignments := func(a []domain.Assignment) {
		sort.Slice(a, func(i, j int) bool { return a[i].FighterID < a[j].FighterID })
	}
	sortAssignments(first)
	sortAssignments(second)
	if !reflect.DeepEqual(first, second) {
		t.Fatalf("not deterministic: %v vs %v", first, second)
	}
}

// Пик клуба «Red»: при 3 «Red» бойцах распределённых по 2 пулам, ни в одном
// пуле не должно быть более 2 (минимум для 3 в 2 пула — это 2+1).
func TestAutoDistribute_RedPeakIsMinimal(t *testing.T) {
	existing := []domain.Pool{
		{ID: "P", Number: 1},
		{ID: "Q", Number: 2},
	}
	unassigned := []domain.FighterRef{
		{ID: "R1", Club: "Red"},
		{ID: "R2", Club: "Red"},
		{ID: "R3", Club: "Red"},
	}
	sizes := poolSizes(existing, domain.AutoDistribute(existing, unassigned))
	for id, size := range sizes {
		if size > 2 {
			t.Fatalf("pool %s has %d Red fighters, peak should be <= 2", id, size)
		}
	}
}

func TestAutoDistribute_NoPools_ReturnsNoAssignments(t *testing.T) {
	got := domain.AutoDistribute(nil, []domain.FighterRef{{ID: "X"}})
	if len(got) != 0 {
		t.Fatalf("expected no assignments with no pools, got %v", got)
	}
}

