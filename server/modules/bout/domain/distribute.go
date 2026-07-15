package domain

import "sort"

// Pairing — один бой в туровом порядке, ещё без ID/PoolID (их добавляет
// service при сборке domain.Bout). RoundNumber — тур (внутри тура боец
// участвует не более раза, FR-3a/AC-9). SequenceNumber — итоговый порядок
// исполнения в пуле, 1..N (FR-3a/FR-3b).
type Pairing struct {
	RoundNumber    int
	SequenceNumber int
	A, B           FighterRef
}

// pair — рабочая пара внутри одного тура (без номеров — их присваивает
// GenerateRoundRobin после построения всех туров).
type pair struct {
	a, b FighterRef
}

// GenerateRoundRobin строит пары «каждый с каждым» для бойцов одного пула
// (FR-3, round-robin): круговой метод (circle method) — стандартный
// алгоритм построения туров с жёстким инвариантом «внутри тура боец не
// более раза» (FR-3a/AC-9, выполняется по построению для любого N), плюс
// эвристика минимизации стыков между турами (FR-3b, см. plan.md «Server» →
// domain). Пул < 2 бойцов — пусто (FR-4). Канонический порядок входа —
// сортировка по ID (детерминизм, FR-7).
func GenerateRoundRobin(fighters []FighterRef) []Pairing {
	if len(fighters) < 2 {
		return nil
	}

	sorted := make([]FighterRef, len(fighters))
	copy(sorted, fighters)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].ID < sorted[j].ID })

	rounds := circleMethodRounds(sorted)
	rounds = minimizeSeams(rounds)

	out := make([]Pairing, 0, len(sorted)*(len(sorted)-1)/2)
	seq := 1
	for r, round := range rounds {
		for _, p := range round {
			out = append(out, Pairing{RoundNumber: r + 1, SequenceNumber: seq, A: p.a, B: p.b})
			seq++
		}
	}
	return out
}

// circleMethodRounds строит туры круговым методом: фиксируем первого
// участника (индекс 0), вращаем остальных по кругу на каждом шаге.
// Нечётное число участников — добавляем виртуального «бай»-участника
// (индекс -1), бои с ним не эмитятся (стандартный приём circle method).
// Базовый порядок пар внутри тура — по наименьшему ID участника пары
// (детерминизм, план «Server» → domain, п.4).
func circleMethodRounds(sorted []FighterRef) [][]pair {
	n := len(sorted)
	hasBye := n%2 != 0

	arr := make([]int, 0, n+1) // индексы в sorted; -1 — виртуальный bye
	for i := 0; i < n; i++ {
		arr = append(arr, i)
	}
	if hasBye {
		arr = append(arr, -1)
	}
	m := len(arr) // теперь чётное
	numRounds := m - 1
	half := m / 2

	rounds := make([][]pair, 0, numRounds)
	for round := 0; round < numRounds; round++ {
		roundPairs := make([]pair, 0, half)
		for i := 0; i < half; i++ {
			ai, bi := arr[i], arr[m-1-i]
			if ai == -1 || bi == -1 {
				continue // бай — бой не эмитится
			}
			roundPairs = append(roundPairs, pair{a: sorted[ai], b: sorted[bi]})
		}
		sort.Slice(roundPairs, func(i, j int) bool {
			return minPairID(roundPairs[i]) < minPairID(roundPairs[j])
		})
		rounds = append(rounds, roundPairs)

		// Вращение: arr[0] фиксирован, остальные сдвигаются по кругу на
		// один шаг (последний становится arr[1]).
		last := arr[m-1]
		for i := m - 1; i > 1; i-- {
			arr[i] = arr[i-1]
		}
		arr[1] = last
	}
	return rounds
}

// minimizeSeams переставляет пары внутри каждого тура, начиная со второго,
// так, чтобы первым в туре по возможности шёл бой, не пересекающийся по
// бойцам с последним боем предыдущего тура (FR-3b). Если такого боя в туре
// нет (доказано математически для N=3/4 — AC-10: там его нет никогда), тур
// остаётся в базовом порядке. Для N≥6 такой бой гарантированно есть на
// каждом стыке (AC-11) — эвристика обязана его найти.
func minimizeSeams(rounds [][]pair) [][]pair {
	for r := 1; r < len(rounds); r++ {
		prev := rounds[r-1]
		if len(prev) == 0 {
			continue
		}
		last := prev[len(prev)-1]
		cur := rounds[r]
		for i, p := range cur {
			if !pairsShareFighter(p, last) {
				reordered := make([]pair, 0, len(cur))
				reordered = append(reordered, p)
				reordered = append(reordered, cur[:i]...)
				reordered = append(reordered, cur[i+1:]...)
				rounds[r] = reordered
				break
			}
		}
	}
	return rounds
}

func minPairID(p pair) string {
	if p.a.ID < p.b.ID {
		return p.a.ID
	}
	return p.b.ID
}

func pairsShareFighter(p, q pair) bool {
	return p.a.ID == q.a.ID || p.a.ID == q.b.ID || p.b.ID == q.a.ID || p.b.ID == q.b.ID
}
