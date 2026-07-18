package testutil

import (
	"context"
	"sync"

	"github.com/hema/server/modules/pool/domain"
)

// FakeNominationProvider — in-memory реализация domain.NominationProvider
// для тестов. NominationsByIDs возвращает карты только для id, заданных
// через Set; отсутствующие id просто не встречаются в ответе (контракт порта
// разрешает это службе — она оставляет NominationName пустым).
type FakeNominationProvider struct {
	mu          sync.Mutex
	nominations map[string]domain.NominationRef
}

// NewFakeNominationProvider создаёт пустой fake-провайдер номинаций.
func NewFakeNominationProvider() *FakeNominationProvider {
	return &FakeNominationProvider{nominations: make(map[string]domain.NominationRef)}
}

var _ domain.NominationProvider = (*FakeNominationProvider)(nil)

// Set задаёт (или переопределяет) проекцию номинации.
func (p *FakeNominationProvider) Set(ref domain.NominationRef) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.nominations[ref.ID] = ref
}

// NominationsByIDs — батч-резолв: отсутствующие id просто не попадают в карту.
func (p *FakeNominationProvider) NominationsByIDs(_ context.Context, ids []string) (map[string]domain.NominationRef, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	out := make(map[string]domain.NominationRef, len(ids))
	for _, id := range ids {
		if ref, ok := p.nominations[id]; ok {
			out[id] = ref
		}
	}
	return out, nil
}