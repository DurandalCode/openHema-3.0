package domain_test

import (
	"fmt"
	"reflect"
	"sort"
	"testing"

	"github.com/hema/server/modules/bout/domain"
)

// fightersN строит N бойцов с детерминированными различными ID (лексика
// asc: "f00", "f01", ...) — важно для проверки сортировки по ID (FR-7).
func fightersN(n int) []domain.FighterRef {
	out := make([]domain.FighterRef, n)
	for i := 0; i < n; i++ {
		out[i] = domain.FighterRef{ID: fmt.Sprintf("f%02d", i), Name: fmt.Sprintf("Fighter %d", i)}
	}
	return out
}

// pairKey — неупорядоченный ключ пары бойцов для проверки уникальности.
func pairKey(a, b domain.FighterRef) string {
	if a.ID < b.ID {
		return a.ID + "|" + b.ID
	}
	return b.ID + "|" + a.ID
}

// TestGenerateRoundRobin_Invariants проверяет программно по диапазону
// N = 0..10 инварианты spec (AC-9, FR-3, FR-7) — не хардкодит ручные пары
// (риск ошибки зафиксирован в plan.md «Риски»).
func TestGenerateRoundRobin_Invariants(t *testing.T) {
	for n := 0; n <= 10; n++ {
		n := n
		t.Run(fmt.Sprintf("N=%d", n), func(t *testing.T) {
			fighters := fightersN(n)
			pairings := domain.GenerateRoundRobin(fighters)

			if n < 2 {
				if len(pairings) != 0 {
					t.Fatalf("N=%d: expected 0 pairings, got %d", n, len(pairings))
				}
				return
			}

			wantPairs := n * (n - 1) / 2
			if len(pairings) != wantPairs {
				t.Fatalf("N=%d: expected %d pairings (C(n,2)), got %d", n, wantPairs, len(pairings))
			}

			// Ни одной пары бойца самого с собой; каждая уникальная пара —
			// ровно один раз.
			seen := make(map[string]bool, wantPairs)
			for _, p := range pairings {
				if p.A.ID == p.B.ID {
					t.Fatalf("N=%d: fighter paired with self: %q", n, p.A.ID)
				}
				k := pairKey(p.A, p.B)
				if seen[k] {
					t.Fatalf("N=%d: duplicate pair %q", n, k)
				}
				seen[k] = true
			}
			// Все C(n,2) уникальных пар присутствуют.
			for i := 0; i < n; i++ {
				for j := i + 1; j < n; j++ {
					k := pairKey(fighters[i], fighters[j])
					if !seen[k] {
						t.Fatalf("N=%d: missing pair %q", n, k)
					}
				}
			}

			// AC-9: внутри одного RoundNumber боец встречается не более
			// раза — жёсткий инвариант для любого N.
			byRound := make(map[int][]domain.Pairing)
			for _, p := range pairings {
				byRound[p.RoundNumber] = append(byRound[p.RoundNumber], p)
			}
			for round, ps := range byRound {
				fighterCount := make(map[string]int)
				for _, p := range ps {
					fighterCount[p.A.ID]++
					fighterCount[p.B.ID]++
				}
				for fid, cnt := range fighterCount {
					if cnt > 1 {
						t.Fatalf("N=%d round=%d: fighter %q appears %d times, want <= 1", n, round, fid, cnt)
					}
				}
			}

			// SequenceNumber — уникальная последовательность 1..len(pairings).
			seqs := make([]int, len(pairings))
			for i, p := range pairings {
				seqs[i] = p.SequenceNumber
			}
			sort.Ints(seqs)
			for i, s := range seqs {
				if s != i+1 {
					t.Fatalf("N=%d: sequence numbers not a contiguous 1..N permutation: %v", n, seqs)
				}
			}

			// FR-7: детерминированность — повторный вызов даёт идентичный
			// результат (порядок и состав).
			again := domain.GenerateRoundRobin(fighters)
			if !reflect.DeepEqual(pairings, again) {
				t.Fatalf("N=%d: not deterministic:\n%v\nvs\n%v", n, pairings, again)
			}
		})
	}
}

// badSeams считает число «плохих» стыков — соседних по SequenceNumber боёв
// (на границе туров) с общим бойцом.
func badSeams(pairings []domain.Pairing) int {
	sorted := make([]domain.Pairing, len(pairings))
	copy(sorted, pairings)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].SequenceNumber < sorted[j].SequenceNumber })

	bad := 0
	for i := 1; i < len(sorted); i++ {
		prev, cur := sorted[i-1], sorted[i]
		if prev.RoundNumber == cur.RoundNumber {
			continue // не стык между турами
		}
		if shareFighter(prev, cur) {
			bad++
		}
	}
	return bad
}

func shareFighter(a, b domain.Pairing) bool {
	return a.A.ID == b.A.ID || a.A.ID == b.B.ID || a.B.ID == b.A.ID || a.B.ID == b.B.ID
}

// TestGenerateRoundRobin_AC10_SmallPoolSeamsAllBad — N=3 и N=4: доказанный
// математически минимум — ВСЕ стыки между турами плохие (см. plan.md
// «Server» → domain, доказательство для N=3/4). Эвристика ничего не может
// улучшить — это честный пол, не недоработка (spec AC-10).
func TestGenerateRoundRobin_AC10_SmallPoolSeamsAllBad(t *testing.T) {
	for _, n := range []int{3, 4} {
		fighters := fightersN(n)
		pairings := domain.GenerateRoundRobin(fighters)

		rounds := make(map[int]bool)
		for _, p := range pairings {
			rounds[p.RoundNumber] = true
		}
		numSeams := len(rounds) - 1
		if numSeams < 1 {
			t.Fatalf("N=%d: expected multiple rounds, got %d", n, len(rounds))
		}

		got := badSeams(pairings)
		if got != numSeams {
			t.Fatalf("N=%d: expected all %d seams bad (proven minimum), got %d bad", n, numSeams, got)
		}
	}
}

// TestGenerateRoundRobin_AC11_SixFightersZeroBadSeams — N=6: эвристика
// обязана убрать все стыки-пересечения (доказано в plan.md, spec AC-11).
func TestGenerateRoundRobin_AC11_SixFightersZeroBadSeams(t *testing.T) {
	pairings := domain.GenerateRoundRobin(fightersN(6))
	if got := badSeams(pairings); got != 0 {
		t.Fatalf("N=6: expected 0 bad seams, got %d", got)
	}
}
