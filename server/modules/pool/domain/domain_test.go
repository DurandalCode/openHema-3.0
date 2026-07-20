package domain_test

import (
	"testing"

	"github.com/hema/server/modules/pool/domain"
)

// TestComputePoolStatus — спека 0011, FR-1/FR-12: статус отдельного пула
// вычисляется из статуса раскладки номинации + факта постановки на арену.
// «Готовится к запуску» (preparing) ⟺ arenaID непуст, независимо от статуса
// раскладки; иначе not_ready/ready синхронны со статусом раскладки.
func TestComputePoolStatus(t *testing.T) {
	cases := []struct {
		name    string
		layout  domain.LayoutStatus
		arenaID string
		want    domain.PoolStatus
	}{
		{"draft, no arena -> not_ready", domain.LayoutDraft, "", domain.PoolStatusNotReady},
		{"ready, no arena -> ready", domain.LayoutReady, "", domain.PoolStatusReady},
		{"ready, seated -> preparing", domain.LayoutReady, "arena-1", domain.PoolStatusPreparing},
		{"draft, seated -> preparing (defensive: should not happen in practice)", domain.LayoutDraft, "arena-1", domain.PoolStatusPreparing},
		{"ready, blank arena id (whitespace) -> ready", domain.LayoutReady, "   ", domain.PoolStatusReady},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := domain.ComputePoolStatus(c.layout, c.arenaID); got != c.want {
				t.Errorf("ComputePoolStatus(%q, %q) = %q, want %q", c.layout, c.arenaID, got, c.want)
			}
		})
	}
}
