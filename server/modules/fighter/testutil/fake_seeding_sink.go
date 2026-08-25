package testutil

import (
	"context"
	"sync"

	"github.com/hema/server/modules/fighter/domain"
)

// FakeSeedingSink — fake-реализация domain.SeedingWithdrawalSink для тестов
// сервиса (спека 0040, сценарий 2). Записывает id бойцов, для которых были
// вызваны OnFighterWithdrawn/OnFighterReturned — тесты проверяют факт и
// порядок вызова, а не поведение stage (то покрыто отдельно в трек B).
type FakeSeedingSink struct {
	mu        sync.Mutex
	Withdrawn []string
	Returned  []string
	err       error
}

// NewFakeSeedingSink создаёт пустой fake-sink.
func NewFakeSeedingSink() *FakeSeedingSink {
	return &FakeSeedingSink{}
}

// WithError заставляет оба метода возвращать заданную ошибку (для проверки
// best-effort поведения: сбой синка не должен откатывать уже закоммиченную
// смену статуса бойца, см. plan.md «Риски»).
func (s *FakeSeedingSink) WithError(err error) *FakeSeedingSink {
	s.err = err
	return s
}

var _ domain.SeedingWithdrawalSink = (*FakeSeedingSink)(nil)

// OnFighterWithdrawn записывает fighterID и возвращает сконфигурированную
// ошибку (если задана).
func (s *FakeSeedingSink) OnFighterWithdrawn(_ context.Context, fighterID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Withdrawn = append(s.Withdrawn, fighterID)
	return s.err
}

// OnFighterReturned записывает fighterID и возвращает сконфигурированную
// ошибку (если задана).
func (s *FakeSeedingSink) OnFighterReturned(_ context.Context, fighterID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Returned = append(s.Returned, fighterID)
	return s.err
}
