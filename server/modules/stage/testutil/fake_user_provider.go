package testutil

import (
	"context"
	"sync"
)

// FakeUserProvider — in-memory domain.UserProvider для тестов (спека 0033,
// приём 0025 — копия modules/application/testutil/fake_user_provider.go).
// Пользователь без зарегистрированного имени просто отсутствует в
// результате (graceful — не ошибка), как и настоящий UserProvider поверх
// auth.
type FakeUserProvider struct {
	mu    sync.Mutex
	names map[string]string
	// calls — зафиксированные аргументы каждого вызова DisplayNames (спека
	// 0033, T14: проверка дедупликации ActorID в батче — CallsWithIDs даёт
	// доступ к тому, что реально ушло в порт).
	calls [][]string
}

// NewFakeUserProvider создаёт пустой fake-провайдер.
func NewFakeUserProvider() *FakeUserProvider {
	return &FakeUserProvider{names: make(map[string]string)}
}

// Set регистрирует отображаемое имя пользователя (test helper).
func (p *FakeUserProvider) Set(userID, displayName string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.names[userID] = displayName
}

// DisplayNames возвращает батч отображаемых имён по списку id.
func (p *FakeUserProvider) DisplayNames(_ context.Context, ids []string) (map[string]string, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.calls = append(p.calls, append([]string{}, ids...))

	out := make(map[string]string, len(ids))
	for _, id := range ids {
		if name, ok := p.names[id]; ok {
			out[id] = name
		}
	}
	return out, nil
}

// CallsWithIDs возвращает список аргументов всех вызовов DisplayNames — test
// helper для проверки дедупликации ActorID в батче (спека 0033, T14).
func (p *FakeUserProvider) CallsWithIDs() [][]string {
	p.mu.Lock()
	defer p.mu.Unlock()
	out := make([][]string, len(p.calls))
	copy(out, p.calls)
	return out
}
