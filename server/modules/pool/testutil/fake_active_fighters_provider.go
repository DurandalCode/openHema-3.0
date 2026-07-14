package testutil

import (
	"context"
	"sync"

	"github.com/hema/server/modules/pool/domain"
)

// FakeActiveFightersProvider — in-memory реализация
// domain.ActiveFightersProvider для тестов.
type FakeActiveFightersProvider struct {
	mu    sync.Mutex
	byNom map[string][]domain.FighterRef
}

// NewFakeActiveFightersProvider создаёт пустой fake-провайдер.
func NewFakeActiveFightersProvider() *FakeActiveFightersProvider {
	return &FakeActiveFightersProvider{byNom: make(map[string][]domain.FighterRef)}
}

var _ domain.ActiveFightersProvider = (*FakeActiveFightersProvider)(nil)

// Set задаёт активный ростер номинации.
func (p *FakeActiveFightersProvider) Set(nominationID string, fighters ...domain.FighterRef) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.byNom[nominationID] = fighters
}

// ActiveFightersByNomination возвращает заданный ростер номинации.
func (p *FakeActiveFightersProvider) ActiveFightersByNomination(_ context.Context, nominationID string) ([]domain.FighterRef, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	return append([]domain.FighterRef{}, p.byNom[nominationID]...), nil
}
