// Спека 0018: этап-сетка с ручным посевом (ADR 0014 §1a/§3/§4). Дерево
// слотов не хранится — оно вычисляется чистой функцией ResolveBracket из
// посева первого круга и уже материализованных боёв (план, решение 2), по
// образцу ComputeStandings/ComputePoolStatus (0016/0011).
package domain

import "fmt"

// BracketConfig — параметры этапа-сетки (FR-1): размер (число слотов первого
// круга, степень двойки 4..32) и признак боя за 3-е место. Задаётся при
// создании этапа и не редактируется (FR-4).
type BracketConfig struct {
	Size       int
	ThirdPlace bool
}

// Seed — посев одного слота первого круга (строка pool_members со slot,
// FR-7).
type Seed struct {
	Slot    int
	Fighter FighterRef
}

// BracketBout — уже материализованный бой круга (вход резолва). Round/Pair —
// координаты пары, к которой принадлежит бой: восстанавливаются вызывающим
// (service) из координат контейнера (номер круга + половина) и
// sequence_number боя внутри контейнера через PairOfBout — сам ResolveBracket
// координатами контейнеров не занимается.
type BracketBout struct {
	Round, Pair    int
	ID             string
	A, B           FighterRef
	State          BoutState
	ScoreA, ScoreB int
}

// SlotState — состояние слота круга сетки (FR-9/FR-13).
type SlotState string

const (
	// SlotFilled — слот занят конкретным бойцом (посев круга 1 либо
	// продвинувшийся победитель/бай последующего круга).
	SlotFilled SlotState = "filled"
	// SlotEmpty — слот законно пуст (недобор посева либо каскад бая, FR-9):
	// соперник проходит дальше без боя.
	SlotEmpty SlotState = "empty"
	// SlotPending — слот ждёт победителя ещё не сыгранной пары
	// предыдущего круга (FR-13).
	SlotPending SlotState = "pending"
)

// Slot — один слот круга.
type Slot struct {
	// Number — номер слота внутри круга, 1-based (proto: slot).
	Number      int
	State       SlotState
	Fighter     FighterRef
	SourceLabel string // заполнен только у SlotPending (FR-13)
}

// Pair — пара круга: слоты 2i-1 и 2i (FR-6).
type Pair struct {
	Index int
	A, B  Slot
	// Expected — требуется бой: обе стороны filled (правило 5).
	Expected bool
	// Resolved — пара разрешена: бой завершён, либо разрешение не
	// требовало боя (бай, пустая пара) — из этого складывается «половина
	// завершена» (FR-17).
	Resolved bool
	// Bout — материализованный бой пары, если он есть среди входных
	// bouts (в т.ч. ещё не завершённый — не только у Resolved пар).
	Bout *BracketBout
}

// Half — половина круга: контейнер боёв (FR-12/FR-12a). Number — 1 (верхняя)
// или 2 (нижняя); у неделимого круга (финал, бой за 3-е место) ровно один
// элемент с Number = 1 и пустым Title.
type Half struct {
	Number int
	Title  string // «Верхняя половина» / «Нижняя половина» / «»
	// ContainerNumber — pools.number контейнера-владельца этой половины
	// (ContainerNumberOf).
	ContainerNumber int
	Pairs           []Pair
}

// Round — круг сетки. Number: 1 — первый круг, R — финал, R+1 — бой за
// 3-е место (не входит в RoundCount).
type Round struct {
	Number     int
	Title      string // «1/4 финала», «Полуфинал», «Финал», «Бой за 3-е место»
	ThirdPlace bool
	Halves     []Half // 1 или 2 (FR-6a)
}

// BracketView — сетка целиком, результат ResolveBracket. Champion/
// ThirdPlaceWinner — отображение, выведенное из завершённых боёв (FR-20), не
// доменный факт.
type BracketView struct {
	Config           BracketConfig
	Rounds           []Round
	Champion         FighterRef
	ThirdPlaceWinner FighterRef
}

// roundPairKey индексирует BracketBout по координатам пары для O(1)
// поиска во время резолва.
type roundPairKey struct {
	round, pair int
}

func indexBracketBouts(bouts []BracketBout) map[roundPairKey]BracketBout {
	idx := make(map[roundPairKey]BracketBout, len(bouts))
	for _, b := range bouts {
		idx[roundPairKey{b.Round, b.Pair}] = b
	}
	return idx
}

// ResolveBracket — чистая функция (FR-6/FR-9/FR-13/FR-14/FR-17): посев +
// материализованные бои → полное дерево слотов. Правила (план, «Правила
// ResolveBracket»):
//  1. Круг r имеет size/2^(r-1) слотов и вдвое меньше пар; слоты пары p —
//     2p-1 и 2p (FR-6). Пары делятся поровну между верхней и нижней
//     половиной круга (FR-6a); круг из одной пары половин не имеет.
//  2. Круг 1 заполняется посевом: слот занят -> filled, иначе -> empty.
//  3. Слот p круга r+1 — разрешение пары p круга r: обе стороны filled и бой
//     завершён -> победитель (filled); обе стороны filled, бой не завершён
//     -> pending с меткой SourceLabel(cfg, r, p) (FR-13); ровно одна сторона
//     filled -> этот боец без боя (бай, FR-9), пара Resolved; обе стороны
//     empty -> empty, пара Resolved (бай каскадится дальше); иначе (хотя бы
//     одна сторона ещё pending) -> pending с той же меткой — пара ещё не
//     может быть решена.
//  4. Бой за 3-е место (если включён) — круг R+1 на 2 слота: слот 1 —
//     проигравший пары 1 полуфинала, слот 2 — пары 2. Полуфинал, разрешённый
//     баем (или полностью пустой), проигравшего не даёт -> слот empty.
//  5. Expected = обе стороны filled — ровно те пары, у которых должен
//     существовать бой.
//  6. Половина круга завершена <=> все её пары Resolved; круг завершён <=>
//     завершены обе половины (FR-17) — вычисляется вызывающим по Pairs, тип
//     Half/Round отдельного флага не хранит.
//  7. Champion — победитель финала, ThirdPlaceWinner — победитель круга R+1
//     (FR-20); при бае — тот, кто прошёл без боя.
func ResolveBracket(cfg BracketConfig, seeds []Seed, bouts []BracketBout) BracketView {
	r := RoundCount(cfg.Size)
	boutIdx := indexBracketBouts(bouts)

	seedBySlot := make(map[int]FighterRef, len(seeds))
	for _, s := range seeds {
		seedBySlot[s.Slot] = s.Fighter
	}
	current := make([]Slot, cfg.Size)
	for i := range current {
		num := i + 1
		if f, ok := seedBySlot[num]; ok {
			current[i] = Slot{Number: num, State: SlotFilled, Fighter: f}
		} else {
			current[i] = Slot{Number: num, State: SlotEmpty}
		}
	}

	rounds := make([]Round, 0, r+1)
	var champion FighterRef
	var thirdSlots [2]Slot
	hasThirdSlots := false

	for round := 1; round <= r; round++ {
		pairsCount := len(current) / 2
		next := make([]Slot, pairsCount)
		losers := make([]Slot, pairsCount)
		pairs := make([]Pair, pairsCount)

		for p := 1; p <= pairsCount; p++ {
			a, b := current[2*p-2], current[2*p-1]
			bout, hasBout := boutIdx[roundPairKey{round, p}]
			var boutPtr *BracketBout
			if hasBout {
				boutPtr = &bout
			}
			pairs[p-1], next[p-1], losers[p-1] = resolvePair(cfg, round, p, a, b, boutPtr)
		}

		rounds = append(rounds, Round{
			Number:     round,
			Title:      RoundTitle(len(current)),
			ThirdPlace: false,
			Halves:     buildHalves(cfg, round, pairs),
		})

		if round == r && next[0].State == SlotFilled {
			champion = next[0].Fighter
		}
		if cfg.ThirdPlace && round == r-1 {
			thirdSlots[0], thirdSlots[1] = losers[0], losers[1]
			hasThirdSlots = true
		}

		current = next
	}

	var thirdWinner FighterRef
	if cfg.ThirdPlace && hasThirdSlots {
		bout, hasBout := boutIdx[roundPairKey{r + 1, 1}]
		var boutPtr *BracketBout
		if hasBout {
			boutPtr = &bout
		}
		pair, winnerSlot, _ := resolvePair(cfg, r+1, 1, thirdSlots[0], thirdSlots[1], boutPtr)
		rounds = append(rounds, Round{
			Number:     r + 1,
			Title:      "Бой за 3-е место",
			ThirdPlace: true,
			Halves: []Half{{
				Number:          1,
				Title:           "",
				ContainerNumber: ContainerNumberOf(cfg, r+1, 1),
				Pairs:           []Pair{pair},
			}},
		})
		if winnerSlot.State == SlotFilled {
			thirdWinner = winnerSlot.Fighter
		}
	}

	return BracketView{Config: cfg, Rounds: rounds, Champion: champion, ThirdPlaceWinner: thirdWinner}
}

// resolvePair резолвит одну пару (round, index) из её двух слотов текущего
// круга (правило 3): возвращает саму пару (для отображения этого круга),
// слот-победитель (для следующего круга/бронзы) и слот-проигравшего (для
// круга бронзы, значим только у полуфинала). Index — глобальный номер пары
// внутри круга (совпадает с Pair.Index и с номером слота, который эта пара
// производит в следующем круге).
func resolvePair(cfg BracketConfig, round, index int, a, b Slot, bout *BracketBout) (pair Pair, winner, loser Slot) {
	pair = Pair{Index: index, A: a, B: b}
	winner = Slot{Number: index}
	loser = Slot{Number: index}

	switch {
	case a.State == SlotFilled && b.State == SlotFilled:
		pair.Expected = true
		pair.Bout = bout
		if bout != nil && bout.State == BoutStateFinished {
			pair.Resolved = true
			if bout.ScoreA > bout.ScoreB {
				winner.State, winner.Fighter = SlotFilled, a.Fighter
				loser.State, loser.Fighter = SlotFilled, b.Fighter
			} else {
				winner.State, winner.Fighter = SlotFilled, b.Fighter
				loser.State, loser.Fighter = SlotFilled, a.Fighter
			}
			return pair, winner, loser
		}
		winner.State, winner.SourceLabel = SlotPending, SourceLabel(cfg, round, index)
		loser.State = SlotPending
		return pair, winner, loser

	case a.State == SlotFilled && b.State == SlotEmpty:
		pair.Resolved = true
		winner.State, winner.Fighter = SlotFilled, a.Fighter
		loser.State = SlotEmpty
		return pair, winner, loser

	case b.State == SlotFilled && a.State == SlotEmpty:
		pair.Resolved = true
		winner.State, winner.Fighter = SlotFilled, b.Fighter
		loser.State = SlotEmpty
		return pair, winner, loser

	case a.State == SlotEmpty && b.State == SlotEmpty:
		pair.Resolved = true
		winner.State = SlotEmpty
		loser.State = SlotEmpty
		return pair, winner, loser

	default:
		// Хотя бы одна сторона ещё pending (её пара предыдущего круга не
		// разрешена) — эта пара тоже не может быть решена.
		winner.State, winner.SourceLabel = SlotPending, SourceLabel(cfg, round, index)
		loser.State = SlotPending
		return pair, winner, loser
	}
}

// buildHalves делит пары круга на половины (FR-6a): первая половина списка
// пар — верхняя, вторая — нижняя; круг из одной пары половин не имеет.
func buildHalves(cfg BracketConfig, round int, pairs []Pair) []Half {
	if HalvesInRound(cfg, round) == 1 {
		return []Half{{
			Number:          1,
			Title:           "",
			ContainerNumber: ContainerNumberOf(cfg, round, 1),
			Pairs:           pairs,
		}}
	}
	mid := len(pairs) / 2
	return []Half{
		{
			Number:          1,
			Title:           "Верхняя половина",
			ContainerNumber: ContainerNumberOf(cfg, round, 1),
			Pairs:           pairs[:mid],
		},
		{
			Number:          2,
			Title:           "Нижняя половина",
			ContainerNumber: ContainerNumberOf(cfg, round, 2),
			Pairs:           pairs[mid:],
		},
	}
}

// pow2 — 2^n для неотрицательного n.
func pow2(n int) int {
	return 1 << uint(n)
}

// ValidBracketSize — размер допустим (степень двойки в [4..32], FR-1).
func ValidBracketSize(size int) bool {
	switch size {
	case 4, 8, 16, 32:
		return true
	default:
		return false
	}
}

// RoundCount возвращает число боевых кругов (log2(size)); бой за 3-е место
// живёт кругом R+1 и в это число не входит.
func RoundCount(size int) int {
	n := 0
	for s := size; s > 1; s /= 2 {
		n++
	}
	return n
}

// RoundTitle — название круга по числу его слотов (FR-5): «Финал» (2),
// «Полуфинал» (4), «1/4 финала» (8), «1/8 финала» (16), «1/16 финала» (32).
func RoundTitle(slotCount int) string {
	switch slotCount {
	case 2:
		return "Финал"
	case 4:
		return "Полуфинал"
	case 8:
		return "1/4 финала"
	case 16:
		return "1/8 финала"
	case 32:
		return "1/16 финала"
	default:
		return fmt.Sprintf("Круг на %d", slotCount)
	}
}

// pairsInRound — число пар круга round: size/2^round для боевых кругов
// (1..RoundCount(size)); для круга бронзы (round = RoundCount(size)+1) и
// любого круга за пределами дерева — 1 (единственная пара бронзы).
func pairsInRound(cfg BracketConfig, round int) int {
	if round > RoundCount(cfg.Size) {
		return 1
	}
	return cfg.Size / pow2(round)
}

// HalvesInRound — сколько контейнеров у круга: 2, если пар >= 2, иначе 1
// (FR-6a). Круг бронзы (одна пара) всегда даёт 1.
func HalvesInRound(cfg BracketConfig, round int) int {
	if pairsInRound(cfg, round) >= 2 {
		return 2
	}
	return 1
}

// ContainerNumberOf — pools.number контейнера (round, half): сквозная
// нумерация в порядке круг -> половина (круг 1 верх = 1, круг 1 низ = 2,
// круг 2 верх = 3, ...); финал — последний из боевых кругов, бой за 3-е
// место (если включён) — следующий за ним.
func ContainerNumberOf(cfg BracketConfig, round, half int) int {
	n := 0
	for i := 1; i < round; i++ {
		n += HalvesInRound(cfg, i)
	}
	return n + half
}

// ContainerCoords — обратное отображение: pools.number -> (round, half).
// ok=false, если containerNumber вне диапазона контейнеров этого конфига
// (учитывает ThirdPlace).
func ContainerCoords(cfg BracketConfig, containerNumber int) (round, half int, ok bool) {
	if containerNumber < 1 {
		return 0, 0, false
	}
	maxRound := RoundCount(cfg.Size)
	if cfg.ThirdPlace {
		maxRound++
	}
	n := 0
	for r := 1; r <= maxRound; r++ {
		h := HalvesInRound(cfg, r)
		if containerNumber <= n+h {
			return r, containerNumber - n, true
		}
		n += h
	}
	return 0, 0, false
}

// PairOfBout — глобальный номер пары в круге по половине и порядковому
// номеру боя внутри контейнера: (half-1)*парВПоловине + sequence.
func PairOfBout(cfg BracketConfig, round, half, sequence int) int {
	total := pairsInRound(cfg, round)
	perHalf := total
	if HalvesInRound(cfg, round) == 2 {
		perHalf = total / 2
	}
	return (half-1)*perHalf + sequence
}

// HalfOfSlot — половина первого круга, которой принадлежит слот посева
// (слоты 1..size/2 — верхняя, остальные — нижняя): по ней SeedSlot выбирает
// контейнер-владельца членства.
func HalfOfSlot(cfg BracketConfig, slot int) int {
	if slot <= cfg.Size/2 {
		return 1
	}
	return 2
}

// ContainerTitle — подпись контейнера (FR-19a): «1/4 финала, верхняя
// половина», «Финал», «Бой за 3-е место». Ложится в Pool.Name — там, где у
// группы стоит «Пул N»; строку формирует сервер, клиент её не собирает.
// Пустая строка — containerNumber вне диапазона конфига.
func ContainerTitle(cfg BracketConfig, containerNumber int) string {
	round, half, ok := ContainerCoords(cfg, containerNumber)
	if !ok {
		return ""
	}
	if round == RoundCount(cfg.Size)+1 {
		return "Бой за 3-е место"
	}
	slotCount := cfg.Size / pow2(round-1)
	base := RoundTitle(slotCount)
	if HalvesInRound(cfg, round) == 1 {
		return base
	}
	if half == 1 {
		return base + ", верхняя половина"
	}
	return base + ", нижняя половина"
}

// SourceLabel — подпись пары-источника для нерешённого слота (FR-13):
// «Победитель пары 3, 1/4 финала». Ссылается на пару предыдущего круга, а не
// на «бой N»: нумерация боёв внутри контейнера своя у каждой половины.
func SourceLabel(cfg BracketConfig, round, pair int) string {
	slotCount := cfg.Size / pow2(round-1)
	return fmt.Sprintf("Победитель пары %d, %s", pair, RoundTitle(slotCount))
}
