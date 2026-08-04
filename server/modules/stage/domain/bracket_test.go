package domain_test

import (
	"fmt"
	"testing"

	"github.com/hema/server/modules/stage/domain"
)

// fr — короткий конструктор FighterRef по id, для тестов сетки.
func fr(id string) domain.FighterRef {
	return domain.FighterRef{ID: id, Name: id}
}

// fullSeed засевает все size слотов первого круга бойцами f1..fN — для
// тестов, которым нужен полный посев без байев.
func fullSeed(size int) []domain.Seed {
	seeds := make([]domain.Seed, size)
	for i := 0; i < size; i++ {
		seeds[i] = domain.Seed{Slot: i + 1, Fighter: fr(fmt.Sprintf("f%d", i+1))}
	}
	return seeds
}

func finishedBracketBout(round, pair int, a, b domain.FighterRef, scoreA, scoreB int) domain.BracketBout {
	return domain.BracketBout{
		Round: round, Pair: pair, ID: fmt.Sprintf("bout-%d-%d", round, pair),
		A: a, B: b, State: domain.BoutStateFinished, ScoreA: scoreA, ScoreB: scoreB,
	}
}

// allResolved — «половина завершена» (FR-17): все её пары Resolved.
func allResolved(pairs []domain.Pair) bool {
	for _, p := range pairs {
		if !p.Resolved {
			return false
		}
	}
	return true
}

// TestValidBracketSize — FR-1: допустимый размер сетки — степень двойки в
// [4..32].
func TestValidBracketSize(t *testing.T) {
	cases := []struct {
		size int
		want bool
	}{
		{4, true}, {8, true}, {16, true}, {32, true},
		{2, false}, {1, false}, {0, false}, {3, false}, {5, false}, {6, false}, {7, false}, {64, false}, {-1, false},
	}
	for _, c := range cases {
		if got := domain.ValidBracketSize(c.size); got != c.want {
			t.Errorf("ValidBracketSize(%d) = %v, want %v", c.size, got, c.want)
		}
	}
}

// TestRoundTitle — FR-5: название круга по числу его слотов.
func TestRoundTitle(t *testing.T) {
	cases := []struct {
		slots int
		want  string
	}{
		{2, "Финал"},
		{4, "Полуфинал"},
		{8, "1/4 финала"},
		{16, "1/8 финала"},
		{32, "1/16 финала"},
	}
	for _, c := range cases {
		if got := domain.RoundTitle(c.slots); got != c.want {
			t.Errorf("RoundTitle(%d) = %q, want %q", c.slots, got, c.want)
		}
	}
}

// TestRoundCountAndStructure — размеры 4/8/16/32: число кругов, слотов и пар
// каждого круга при полном посеве без боёв (план, «Тестирование»).
func TestRoundCountAndStructure(t *testing.T) {
	cases := []struct {
		size       int
		wantRounds int
		wantTitles []string
		wantSlots  []int // слотов в круге (2 * пар)
		wantHalves []int // число половин в круге
	}{
		{4, 2, []string{"Полуфинал", "Финал"}, []int{4, 2}, []int{2, 1}},
		{8, 3, []string{"1/4 финала", "Полуфинал", "Финал"}, []int{8, 4, 2}, []int{2, 2, 1}},
		{16, 4, []string{"1/8 финала", "1/4 финала", "Полуфинал", "Финал"}, []int{16, 8, 4, 2}, []int{2, 2, 2, 1}},
		{32, 5, []string{"1/16 финала", "1/8 финала", "1/4 финала", "Полуфинал", "Финал"}, []int{32, 16, 8, 4, 2}, []int{2, 2, 2, 2, 1}},
	}
	for _, c := range cases {
		t.Run(fmt.Sprintf("size=%d", c.size), func(t *testing.T) {
			if got := domain.RoundCount(c.size); got != c.wantRounds {
				t.Fatalf("RoundCount(%d) = %d, want %d", c.size, got, c.wantRounds)
			}
			cfg := domain.BracketConfig{Size: c.size}
			view := domain.ResolveBracket(cfg, fullSeed(c.size), nil)
			if len(view.Rounds) != c.wantRounds {
				t.Fatalf("len(Rounds) = %d, want %d", len(view.Rounds), c.wantRounds)
			}
			for i, round := range view.Rounds {
				if round.Number != i+1 {
					t.Errorf("Rounds[%d].Number = %d, want %d", i, round.Number, i+1)
				}
				if round.Title != c.wantTitles[i] {
					t.Errorf("Rounds[%d].Title = %q, want %q", i, round.Title, c.wantTitles[i])
				}
				if round.ThirdPlace {
					t.Errorf("Rounds[%d].ThirdPlace = true, want false (no bronze in this config)", i)
				}
				if len(round.Halves) != c.wantHalves[i] {
					t.Errorf("Rounds[%d]: %d halves, want %d", i, len(round.Halves), c.wantHalves[i])
				}
				slots := 0
				for _, h := range round.Halves {
					slots += 2 * len(h.Pairs)
				}
				if slots != c.wantSlots[i] {
					t.Errorf("Rounds[%d]: %d slots (2*pairs), want %d", i, slots, c.wantSlots[i])
				}
			}
		})
	}
}

// TestResolveBracketFullSeedNoByes — полный посев без байев (план,
// «Тестирование»): круг 1 — все пары Expected, круги дальше — pending со
// своей меткой источника.
func TestResolveBracketFullSeedNoByes(t *testing.T) {
	cfg := domain.BracketConfig{Size: 8}
	view := domain.ResolveBracket(cfg, fullSeed(8), nil)

	qf := view.Rounds[0]
	for hi, h := range qf.Halves {
		for pi, p := range h.Pairs {
			if !p.Expected {
				t.Errorf("QF half %d pair %d: Expected = false, want true", hi, pi)
			}
			if p.Resolved {
				t.Errorf("QF half %d pair %d: Resolved = true, want false (no bout yet)", hi, pi)
			}
			if p.A.State != domain.SlotFilled || p.B.State != domain.SlotFilled {
				t.Errorf("QF half %d pair %d: slots not both filled: %v/%v", hi, pi, p.A.State, p.B.State)
			}
		}
	}

	sf := view.Rounds[1]
	gotSlot := sf.Halves[0].Pairs[0].A
	if gotSlot.State != domain.SlotPending {
		t.Fatalf("SF pair1.A.State = %v, want pending", gotSlot.State)
	}
	wantLabel := "Победитель пары 1, 1/4 финала"
	if gotSlot.SourceLabel != wantLabel {
		t.Errorf("SF pair1.A.SourceLabel = %q, want %q", gotSlot.SourceLabel, wantLabel)
	}

	if (view.Champion != domain.FighterRef{}) {
		t.Errorf("Champion = %+v, want zero value (final not resolved)", view.Champion)
	}
}

// TestResolveBracketShortfallBye — AC-3: недобор посева (6 из 8) — пары с
// одним посаженным бойцом дают бай в следующий круг без боя.
func TestResolveBracketShortfallBye(t *testing.T) {
	cfg := domain.BracketConfig{Size: 8}
	seeds := []domain.Seed{
		{Slot: 1, Fighter: fr("f1")}, {Slot: 2, Fighter: fr("f2")},
		{Slot: 3, Fighter: fr("f3")}, {Slot: 4, Fighter: fr("f4")},
		{Slot: 5, Fighter: fr("f5")}, // slot 6 пуст
		{Slot: 7, Fighter: fr("f7")}, // slot 8 пуст
	}
	view := domain.ResolveBracket(cfg, seeds, nil)
	qf := view.Rounds[0]

	pair3 := qf.Halves[1].Pairs[0] // слоты 5,6
	if !pair3.Resolved || pair3.Expected {
		t.Errorf("QF pair3 (bye): Resolved=%v Expected=%v, want Resolved=true Expected=false", pair3.Resolved, pair3.Expected)
	}
	pair4 := qf.Halves[1].Pairs[1] // слоты 7,8
	if !pair4.Resolved || pair4.Expected {
		t.Errorf("QF pair4 (bye): Resolved=%v Expected=%v, want Resolved=true Expected=false", pair4.Resolved, pair4.Expected)
	}

	sf := view.Rounds[1]
	sfPair2 := sf.Halves[1].Pairs[0] // получает бай-победителей пар 3 и 4
	if sfPair2.A.State != domain.SlotFilled || sfPair2.A.Fighter != fr("f5") {
		t.Errorf("SF pair2.A = %+v, want filled f5", sfPair2.A)
	}
	if sfPair2.B.State != domain.SlotFilled || sfPair2.B.Fighter != fr("f7") {
		t.Errorf("SF pair2.B = %+v, want filled f7", sfPair2.B)
	}
	if !sfPair2.Expected || sfPair2.Resolved {
		t.Errorf("SF pair2: Expected=%v Resolved=%v, want Expected=true Resolved=false (bout needed, not played yet)", sfPair2.Expected, sfPair2.Resolved)
	}
}

// TestResolveBracketCascadeBye — каскад бая: пара из двух пустых слотов
// оставляет слот следующего круга пустым, и это распространяется дальше на
// следующий круг тоже.
func TestResolveBracketCascadeBye(t *testing.T) {
	cfg := domain.BracketConfig{Size: 8}
	seeds := []domain.Seed{
		{Slot: 1, Fighter: fr("f1")}, {Slot: 2, Fighter: fr("f2")},
		// слоты 3..8 не посеяны вовсе: пары 2, 3, 4 — обе стороны пусты
	}
	view := domain.ResolveBracket(cfg, seeds, nil)

	qf := view.Rounds[0]
	pair2 := qf.Halves[0].Pairs[1] // слоты 3,4 — оба пусты
	if !pair2.Resolved || pair2.A.State != domain.SlotEmpty || pair2.B.State != domain.SlotEmpty {
		t.Fatalf("QF pair2 = %+v, want both empty & resolved", pair2)
	}
	pair3 := qf.Halves[1].Pairs[0] // слоты 5,6
	pair4 := qf.Halves[1].Pairs[1] // слоты 7,8
	if !pair3.Resolved || !pair4.Resolved {
		t.Fatalf("QF pair3/pair4 not resolved: %+v / %+v", pair3, pair4)
	}

	sf := view.Rounds[1]
	sfPair1 := sf.Halves[0].Pairs[0] // слоты из QF pair1 (реальная игра) + QF pair2 (empty)
	if sfPair1.B.State != domain.SlotEmpty {
		t.Errorf("SF pair1.B.State = %v, want empty (cascaded from QF pair2 double-empty)", sfPair1.B.State)
	}
	sfPair2 := sf.Halves[1].Pairs[0] // из QF pair3 (empty) + QF pair4 (empty) — каскад на 2 уровня
	if !sfPair2.Resolved || sfPair2.A.State != domain.SlotEmpty || sfPair2.B.State != domain.SlotEmpty {
		t.Fatalf("SF pair2 = %+v, want both empty & resolved (cascaded two rounds deep)", sfPair2)
	}

	final := view.Rounds[2]
	if final.Halves[0].Pairs[0].B.State != domain.SlotEmpty {
		t.Errorf("Final pair.B.State = %v, want empty (cascade reached the final)", final.Halves[0].Pairs[0].B.State)
	}
}

// TestResolveBracketAdvanceWinner — AC-7: завершённый бой пары p продвигает
// победителя в слот p следующего круга; вторая сторона остаётся pending со
// своей меткой SourceLabel, пока её пара не сыграна.
func TestResolveBracketAdvanceWinner(t *testing.T) {
	cfg := domain.BracketConfig{Size: 8}
	bouts := []domain.BracketBout{
		finishedBracketBout(1, 1, fr("f1"), fr("f2"), 5, 3), // QF pair1 завершён, f1 выиграл
		// QF pair2 (слоты 3,4) ещё не сыгран
	}
	view := domain.ResolveBracket(cfg, fullSeed(8), bouts)

	qfPair1 := view.Rounds[0].Halves[0].Pairs[0]
	if !qfPair1.Resolved || qfPair1.Bout == nil || qfPair1.Bout.ID != "bout-1-1" {
		t.Fatalf("QF pair1 = %+v, want resolved with bout-1-1", qfPair1)
	}

	sfPair1 := view.Rounds[1].Halves[0].Pairs[0]
	if sfPair1.A.State != domain.SlotFilled || sfPair1.A.Fighter != fr("f1") {
		t.Errorf("SF pair1.A = %+v, want filled f1 (advanced winner)", sfPair1.A)
	}
	if sfPair1.B.State != domain.SlotPending {
		t.Fatalf("SF pair1.B.State = %v, want pending (QF pair2 not played)", sfPair1.B.State)
	}
	wantLabel := "Победитель пары 2, 1/4 финала"
	if sfPair1.B.SourceLabel != wantLabel {
		t.Errorf("SF pair1.B.SourceLabel = %q, want %q", sfPair1.B.SourceLabel, wantLabel)
	}
}

// TestResolveBracketChampion — чемпион появляется только после завершения
// финала.
func TestResolveBracketChampion(t *testing.T) {
	cfg := domain.BracketConfig{Size: 4}
	bouts := []domain.BracketBout{
		finishedBracketBout(1, 1, fr("f1"), fr("f2"), 5, 1),
		finishedBracketBout(1, 2, fr("f3"), fr("f4"), 2, 5), // f4 выигрывает
		finishedBracketBout(2, 1, fr("f1"), fr("f4"), 5, 4),
	}
	view := domain.ResolveBracket(cfg, fullSeed(4), bouts)
	if view.Champion != fr("f1") {
		t.Errorf("Champion = %+v, want f1", view.Champion)
	}
}

// TestResolveBracketThirdPlace — AC-10/AC-11: проигравшие полуфиналов
// встают в отдельный круг бронзы; победитель виден как таковой.
func TestResolveBracketThirdPlace(t *testing.T) {
	cfg := domain.BracketConfig{Size: 8, ThirdPlace: true}
	bouts := []domain.BracketBout{
		finishedBracketBout(1, 1, fr("f1"), fr("f2"), 5, 3), // QF1: f1 выиграл
		finishedBracketBout(1, 2, fr("f3"), fr("f4"), 1, 5), // QF2: f4 выиграл
		finishedBracketBout(1, 3, fr("f5"), fr("f6"), 5, 2), // QF3: f5 выиграл
		finishedBracketBout(1, 4, fr("f7"), fr("f8"), 5, 0), // QF4: f7 выиграл
		finishedBracketBout(2, 1, fr("f1"), fr("f4"), 5, 2), // SF1: f1 выиграл, f4 проиграл
		finishedBracketBout(2, 2, fr("f5"), fr("f7"), 1, 5), // SF2: f7 выиграл, f5 проиграл
		finishedBracketBout(3, 1, fr("f1"), fr("f7"), 5, 3), // Финал: f1 чемпион
		finishedBracketBout(4, 1, fr("f4"), fr("f5"), 5, 2), // Бронза: f4 выиграл
	}
	view := domain.ResolveBracket(cfg, fullSeed(8), bouts)

	if len(view.Rounds) != 4 {
		t.Fatalf("len(Rounds) = %d, want 4 (QF, SF, Final, Third place)", len(view.Rounds))
	}
	third := view.Rounds[3]
	if !third.ThirdPlace || third.Title != "Бой за 3-е место" {
		t.Fatalf("Rounds[3] = %+v, want ThirdPlace round titled 'Бой за 3-е место'", third)
	}
	pair := third.Halves[0].Pairs[0]
	if pair.A.Fighter != fr("f4") || pair.B.Fighter != fr("f5") {
		t.Errorf("third place pair = %+v, want f4 vs f5 (semifinal losers)", pair)
	}
	if view.Champion != fr("f1") {
		t.Errorf("Champion = %+v, want f1", view.Champion)
	}
	if view.ThirdPlaceWinner != fr("f4") {
		t.Errorf("ThirdPlaceWinner = %+v, want f4", view.ThirdPlaceWinner)
	}
}

// TestResolveBracketThirdPlaceSemifinalBye — полуфинал, разрешённый баем, не
// даёт проигравшего: слот бронзы остаётся пустым, и второй финалист бронзы
// проходит без боя.
func TestResolveBracketThirdPlaceSemifinalBye(t *testing.T) {
	cfg := domain.BracketConfig{Size: 4, ThirdPlace: true}
	seeds := []domain.Seed{
		{Slot: 1, Fighter: fr("f1")}, // slot 2 пуст -> пара1 = бай
		{Slot: 3, Fighter: fr("f3")}, {Slot: 4, Fighter: fr("f4")},
	}
	bouts := []domain.BracketBout{
		finishedBracketBout(1, 2, fr("f3"), fr("f4"), 5, 1), // пара2: f3 выиграл, f4 проиграл
		finishedBracketBout(2, 1, fr("f1"), fr("f3"), 5, 2),
	}
	view := domain.ResolveBracket(cfg, seeds, bouts)

	third := view.Rounds[2]
	pair := third.Halves[0].Pairs[0]
	if pair.A.State != domain.SlotEmpty {
		t.Errorf("third place slot A = %v, want empty (semifinal pair1 was a bye, no loser)", pair.A.State)
	}
	if pair.B.State != domain.SlotFilled || pair.B.Fighter != fr("f4") {
		t.Errorf("third place slot B = %+v, want filled f4", pair.B)
	}
	if !pair.Resolved || pair.Expected {
		t.Errorf("third place pair: Resolved=%v Expected=%v, want Resolved=true Expected=false (bye, no bout)", pair.Resolved, pair.Expected)
	}
	if view.ThirdPlaceWinner != fr("f4") {
		t.Errorf("ThirdPlaceWinner = %+v, want f4 (advances without a bout)", view.ThirdPlaceWinner)
	}
}

// TestResolveBracketThirdPlaceNotContested — оба полуфинала разрешены баем:
// бронза не разыгрывается вовсе (оба слота пусты).
func TestResolveBracketThirdPlaceNotContested(t *testing.T) {
	cfg := domain.BracketConfig{Size: 4, ThirdPlace: true}
	seeds := []domain.Seed{
		{Slot: 1, Fighter: fr("f1")}, // slot 2 пуст
		{Slot: 3, Fighter: fr("f2")}, // slot 4 пуст
	}
	bouts := []domain.BracketBout{
		finishedBracketBout(2, 1, fr("f1"), fr("f2"), 5, 2),
	}
	view := domain.ResolveBracket(cfg, seeds, bouts)

	third := view.Rounds[2]
	pair := third.Halves[0].Pairs[0]
	if pair.A.State != domain.SlotEmpty || pair.B.State != domain.SlotEmpty {
		t.Fatalf("third place pair = %+v, want both slots empty", pair)
	}
	if !pair.Resolved {
		t.Errorf("third place pair.Resolved = false, want true (double bye cascades to nothing)")
	}
	if (view.ThirdPlaceWinner != domain.FighterRef{}) {
		t.Errorf("ThirdPlaceWinner = %+v, want zero value (not contested)", view.ThirdPlaceWinner)
	}
}

// TestResolveBracketHalfFinished — FR-17: половина круга завершена <=> все
// её пары Resolved (в т.ч. разрешённые баем); половина с хотя бы одной
// неразрешённой парой — не завершена.
func TestResolveBracketHalfFinished(t *testing.T) {
	cfg := domain.BracketConfig{Size: 8}
	seeds := []domain.Seed{
		{Slot: 1, Fighter: fr("f1")}, {Slot: 2, Fighter: fr("f2")},
		{Slot: 3, Fighter: fr("f3")}, {Slot: 4, Fighter: fr("f4")},
		{Slot: 5, Fighter: fr("f5")}, // slot 6 пуст -> pair3 bye
		{Slot: 7, Fighter: fr("f7")}, // slot 8 пуст -> pair4 bye
	}
	bouts := []domain.BracketBout{
		finishedBracketBout(1, 1, fr("f1"), fr("f2"), 5, 1), // pair1 завершена
		// pair2 (слоты 3,4) ещё не сыграна
	}
	view := domain.ResolveBracket(cfg, seeds, bouts)
	qf := view.Rounds[0]

	if allResolved(qf.Halves[0].Pairs) {
		t.Errorf("upper half (pairs 1,2) allResolved = true, want false (pair2 not played)")
	}
	if !allResolved(qf.Halves[1].Pairs) {
		t.Errorf("lower half (pairs 3,4, both byes) allResolved = false, want true")
	}
}

// TestContainerNumberOfAndCoordsInvertible — координаты контейнеров
// (план, «Тестирование»): ContainerNumberOf/ContainerCoords взаимно
// обратны на всех размерах, с бронзой и без.
func TestContainerNumberOfAndCoordsInvertible(t *testing.T) {
	for _, size := range []int{4, 8, 16, 32} {
		for _, thirdPlace := range []bool{false, true} {
			cfg := domain.BracketConfig{Size: size, ThirdPlace: thirdPlace}
			maxRound := domain.RoundCount(size)
			if thirdPlace {
				maxRound++
			}
			total := 0
			for r := 1; r <= maxRound; r++ {
				total += domain.HalvesInRound(cfg, r)
			}
			for n := 1; n <= total; n++ {
				round, half, ok := domain.ContainerCoords(cfg, n)
				if !ok {
					t.Fatalf("size=%d third=%v: ContainerCoords(%d) not ok", size, thirdPlace, n)
				}
				if got := domain.ContainerNumberOf(cfg, round, half); got != n {
					t.Errorf("size=%d third=%v: ContainerNumberOf(round=%d,half=%d) = %d, want %d", size, thirdPlace, round, half, got, n)
				}
			}
			// вне диапазона -> ok=false.
			if _, _, ok := domain.ContainerCoords(cfg, total+1); ok {
				t.Errorf("size=%d third=%v: ContainerCoords(%d) ok=true, want false (out of range)", size, thirdPlace, total+1)
			}
			if _, _, ok := domain.ContainerCoords(cfg, 0); ok {
				t.Errorf("size=%d third=%v: ContainerCoords(0) ok=true, want false", size, thirdPlace)
			}
		}
	}
}

// TestContainerNumberOfExplicit — конкретная раскладка на size=8,
// third_place=true (план: «круг 1 верх=1, круг1 низ=2, круг2 верх=3, …,
// финал — последний из боевых кругов, бронза — следующий»).
func TestContainerNumberOfExplicit(t *testing.T) {
	cfg := domain.BracketConfig{Size: 8, ThirdPlace: true}
	cases := []struct {
		round, half int
		want        int
	}{
		{1, 1, 1}, {1, 2, 2}, // 1/4 финала верх/низ
		{2, 1, 3}, {2, 2, 4}, // полуфинал верх/низ (по паре каждая)
		{3, 1, 5}, // финал — один контейнер
		{4, 1, 6}, // бронза — один контейнер
	}
	for _, c := range cases {
		if got := domain.ContainerNumberOf(cfg, c.round, c.half); got != c.want {
			t.Errorf("ContainerNumberOf(round=%d,half=%d) = %d, want %d", c.round, c.half, got, c.want)
		}
	}
}

// TestPairOfBout — глобальный номер пары по половине и порядковому номеру
// боя внутри контейнера (FR-6a).
func TestPairOfBout(t *testing.T) {
	cfg := domain.BracketConfig{Size: 8}
	cases := []struct {
		round, half, sequence int
		want                  int
	}{
		{1, 1, 1, 1}, {1, 1, 2, 2}, // 1/4 финала, верхняя половина: пары 1,2
		{1, 2, 1, 3}, {1, 2, 2, 4}, // 1/4 финала, нижняя половина: пары 3,4
		{2, 1, 1, 1}, {2, 2, 1, 2}, // полуфинал: верх=пара1, низ=пара2
		{3, 1, 1, 1}, // финал: один контейнер, одна пара
	}
	for _, c := range cases {
		if got := domain.PairOfBout(cfg, c.round, c.half, c.sequence); got != c.want {
			t.Errorf("PairOfBout(round=%d,half=%d,seq=%d) = %d, want %d", c.round, c.half, c.sequence, got, c.want)
		}
	}
}

// TestHalfOfSlot — FR-6a: слоты 1..size/2 первого круга — верхняя половина,
// остальные — нижняя.
func TestHalfOfSlot(t *testing.T) {
	cfg := domain.BracketConfig{Size: 8}
	cases := map[int]int{1: 1, 2: 1, 3: 1, 4: 1, 5: 2, 6: 2, 7: 2, 8: 2}
	for slot, want := range cases {
		if got := domain.HalfOfSlot(cfg, slot); got != want {
			t.Errorf("HalfOfSlot(%d) = %d, want %d", slot, got, want)
		}
	}
}

// TestContainerTitle — FR-19a: подпись контейнера сетки.
func TestContainerTitle(t *testing.T) {
	cfg := domain.BracketConfig{Size: 8, ThirdPlace: true}
	cases := []struct {
		number int
		want   string
	}{
		{1, "1/4 финала, верхняя половина"},
		{2, "1/4 финала, нижняя половина"},
		{3, "Полуфинал, верхняя половина"},
		{4, "Полуфинал, нижняя половина"},
		{5, "Финал"},
		{6, "Бой за 3-е место"},
		{7, ""}, // вне диапазона
	}
	for _, c := range cases {
		if got := domain.ContainerTitle(cfg, c.number); got != c.want {
			t.Errorf("ContainerTitle(%d) = %q, want %q", c.number, got, c.want)
		}
	}
}

// TestSourceLabel — FR-13: подпись пары-источника ссылается на пару
// предыдущего круга, а не на номер боя.
func TestSourceLabel(t *testing.T) {
	cfg := domain.BracketConfig{Size: 8}
	cases := []struct {
		round, pair int
		want        string
	}{
		{1, 3, "Победитель пары 3, 1/4 финала"},
		{2, 1, "Победитель пары 1, Полуфинал"},
		{3, 1, "Победитель пары 1, Финал"},
	}
	for _, c := range cases {
		if got := domain.SourceLabel(cfg, c.round, c.pair); got != c.want {
			t.Errorf("SourceLabel(round=%d,pair=%d) = %q, want %q", c.round, c.pair, got, c.want)
		}
	}
}
