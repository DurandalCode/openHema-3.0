package domain_test

import (
	"testing"

	"github.com/hema/server/modules/stage/domain"
)

// TestComputePoolStatus — спека 0011/0013, FR-1/FR-10/FR-12: статус
// отдельного пула вычисляется из статуса раскладки номинации, факта
// постановки на арену и прогресса боёв пула (started/finished/total).
// Порядок правил (план, «Модуль pool», решение 4):
//  1. layout draft -> not_ready (независимо от прогресса/арены);
//  2. total>0 && finished==total -> finished (независимо от arenaID — снятие
//     сохраняет результат, FR-11);
//  3. started>0 (и не все finished) -> active;
//  4. arenaID задан (и started==0) -> preparing;
//  5. иначе -> ready.
func TestComputePoolStatus(t *testing.T) {
	cases := []struct {
		name                     string
		layout                   domain.LayoutStatus
		arenaID                  string
		started, finished, total int
		want                     domain.PoolStatus
	}{
		{"draft, no arena, no bouts -> not_ready", domain.LayoutDraft, "", 0, 0, 0, domain.PoolStatusNotReady},
		{"draft, seated, progress -> not_ready (draft always wins)", domain.LayoutDraft, "arena-1", 1, 0, 3, domain.PoolStatusNotReady},
		{"ready, no arena, no bouts -> ready", domain.LayoutReady, "", 0, 0, 0, domain.PoolStatusReady},
		{"ready, blank arena id (whitespace), no bouts -> ready", domain.LayoutReady, "   ", 0, 0, 0, domain.PoolStatusReady},
		{"ready, seated, 0 bouts -> preparing (nothing to conduct)", domain.LayoutReady, "arena-1", 0, 0, 0, domain.PoolStatusPreparing},
		{"ready, seated, no bout started -> preparing", domain.LayoutReady, "arena-1", 0, 0, 3, domain.PoolStatusPreparing},
		{"ready, seated, one started -> active", domain.LayoutReady, "arena-1", 1, 0, 3, domain.PoolStatusActive},
		{"ready, seated, some finished not all -> active", domain.LayoutReady, "arena-1", 2, 1, 3, domain.PoolStatusActive},
		{"ready, seated, all finished -> finished", domain.LayoutReady, "arena-1", 3, 3, 3, domain.PoolStatusFinished},
		{"ready, unseated, all finished -> finished (unseat preserves results, FR-11)", domain.LayoutReady, "", 3, 3, 3, domain.PoolStatusFinished},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := domain.ComputePoolStatus(c.layout, c.arenaID, c.started, c.finished, c.total)
			if got != c.want {
				t.Errorf("ComputePoolStatus(%q, %q, %d, %d, %d) = %q, want %q", c.layout, c.arenaID, c.started, c.finished, c.total, got, c.want)
			}
		})
	}
}
