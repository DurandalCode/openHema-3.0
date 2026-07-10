package testutil

import (
	"context"
	"sync"

	"github.com/hema/server/modules/application/domain"
)

// FakeNominationProvider — in-memory domain.NominationProvider для тестов.
type FakeNominationProvider struct {
	mu          sync.Mutex
	nominations map[string]domain.NominationInfo
}

// NewFakeNominationProvider создаёт пустой fake-провайдер.
func NewFakeNominationProvider() *FakeNominationProvider {
	return &FakeNominationProvider{nominations: make(map[string]domain.NominationInfo)}
}

var _ domain.NominationProvider = (*FakeNominationProvider)(nil)

// Set регистрирует номинацию для последующего резолва (test helper).
func (p *FakeNominationProvider) Set(nominationID string, info domain.NominationInfo) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.nominations[nominationID] = info
}

// Nomination возвращает сведения о номинации либо ErrNominationNotFound.
func (p *FakeNominationProvider) Nomination(_ context.Context, nominationID string) (domain.NominationInfo, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	info, ok := p.nominations[nominationID]
	if !ok {
		return domain.NominationInfo{}, domain.ErrNominationNotFound
	}
	return info, nil
}
