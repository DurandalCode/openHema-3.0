package testutil

import (
	"context"
	"sync"

	"github.com/hema/server/modules/pool/domain"
)

// FakeArenaProvider — in-memory реализация domain.ArenaProvider для тестов
// (спека 0011). ArenaByID возвращает domain.ErrArenaNotAvailable для id, не
// заданных через Set (площадка не найдена).
type FakeArenaProvider struct {
	mu     sync.Mutex
	arenas map[string]domain.ArenaRef
}

// NewFakeArenaProvider создаёт пустой fake-провайдер площадок.
func NewFakeArenaProvider() *FakeArenaProvider {
	return &FakeArenaProvider{arenas: make(map[string]domain.ArenaRef)}
}

var _ domain.ArenaProvider = (*FakeArenaProvider)(nil)

// Set задаёт (или переопределяет) площадку.
func (p *FakeArenaProvider) Set(ref domain.ArenaRef) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.arenas[ref.ID] = ref
}

// ArenaByID возвращает заданную площадку. Отсутствие — domain.ErrArenaNotAvailable
// (нарочно доменная, а не generic ошибка — service должен сам решать, как
// мапить любые ошибки провайдера в ErrArenaNotAvailable; здесь чтобы тесты
// могли использовать errors.Is напрямую при желании).
func (p *FakeArenaProvider) ArenaByID(_ context.Context, id string) (domain.ArenaRef, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	ref, ok := p.arenas[id]
	if !ok {
		return domain.ArenaRef{}, domain.ErrArenaNotAvailable
	}
	return ref, nil
}

// ArenasByIDs — батч-резолв: отсутствующие id просто не попадают в карту.
func (p *FakeArenaProvider) ArenasByIDs(_ context.Context, ids []string) (map[string]domain.ArenaRef, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	out := make(map[string]domain.ArenaRef, len(ids))
	for _, id := range ids {
		if ref, ok := p.arenas[id]; ok {
			out[id] = ref
		}
	}
	return out, nil
}
