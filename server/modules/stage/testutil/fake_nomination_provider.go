package testutil

import (
	"context"
	"sync"

	"github.com/hema/server/modules/stage/domain"
)

// FakeNominationProvider — in-memory реализация domain.NominationProvider
// для тестов. NominationsByIDs возвращает карты только для id, заданных
// через Set; отсутствующие id просто не встречаются в ответе (контракт порта
// разрешает это службе — она оставляет NominationName пустым).
type FakeNominationProvider struct {
	mu          sync.Mutex
	nominations map[string]domain.NominationRef
	// synced — последнее значение hasDistributedFighters, полученное
	// SyncNominationState по каждой номинации (спека 0012, T9). Ключ
	// отсутствует, если SyncNominationState для этой номинации ещё не
	// вызывался — отличается от значения false (LastSynced).
	synced map[string]bool
	// execution — последнее значение исполнительной оси, полученное
	// SyncNominationState по каждой номинации (спека 0021). Ключ отсутствует,
	// если для номинации ещё не вызывался.
	execution map[string]domain.NominationExecution
}

// NewFakeNominationProvider создаёт пустой fake-провайдер номинаций.
func NewFakeNominationProvider() *FakeNominationProvider {
	return &FakeNominationProvider{
		nominations: make(map[string]domain.NominationRef),
		synced:      make(map[string]bool),
		execution:   make(map[string]domain.NominationExecution),
	}
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

// SyncNominationState записывает последнее значение hasDistributedFighters и
// исполнительной оси для номинации (спека 0012 FR-10, спека 0021 FR-4/FR-5)
// — спай для юнит-тестов service.
func (p *FakeNominationProvider) SyncNominationState(_ context.Context, nominationID string, hasDistributedFighters bool, execution domain.NominationExecution) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.synced[nominationID] = hasDistributedFighters
	p.execution[nominationID] = execution
	return nil
}

// LastSynced возвращает последнее значение hasDistributedFighters, переданное
// SyncNominationState для номинации (value), и вызывался ли он вообще для
// неё (called) — позволяет тестам различить «не вызывался» от «вызывался с
// false».
func (p *FakeNominationProvider) LastSynced(nominationID string) (value bool, called bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	value, called = p.synced[nominationID]
	return value, called
}

// LastExecution возвращает последнее значение исполнительной оси, переданное
// SyncNominationState для номинации (спека 0021), и вызывался ли он вообще
// для неё.
func (p *FakeNominationProvider) LastExecution(nominationID string) (value domain.NominationExecution, called bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	value, called = p.execution[nominationID]
	return value, called
}