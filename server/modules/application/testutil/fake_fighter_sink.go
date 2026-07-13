package testutil

import (
	"context"
	"sync"

	"github.com/hema/server/modules/application/domain"
)

// FakeFighterSink — in-memory domain.FighterRegistrationSink для тестов.
// Записывает каждый вызов OnRegistered для последующей проверки (спека 0007).
type FakeFighterSink struct {
	mu    sync.Mutex
	calls []domain.RegisteredFighter
	err   error
}

// NewFakeFighterSink создаёт пустой fake-sink.
func NewFakeFighterSink() *FakeFighterSink {
	return &FakeFighterSink{}
}

var _ domain.FighterRegistrationSink = (*FakeFighterSink)(nil)

// SetError заставляет OnRegistered возвращать заданную ошибку (test helper).
func (s *FakeFighterSink) SetError(err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.err = err
}

// OnRegistered записывает вызов и возвращает настроенную ошибку (если есть).
func (s *FakeFighterSink) OnRegistered(_ context.Context, in domain.RegisteredFighter) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.err != nil {
		return s.err
	}
	s.calls = append(s.calls, in)
	return nil
}

// Calls возвращает все зафиксированные вызовы (test helper).
func (s *FakeFighterSink) Calls() []domain.RegisteredFighter {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]domain.RegisteredFighter, len(s.calls))
	copy(out, s.calls)
	return out
}
