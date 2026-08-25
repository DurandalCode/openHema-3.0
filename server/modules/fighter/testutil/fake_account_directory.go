package testutil

import (
	"context"
	"sync"

	"github.com/hema/server/modules/fighter/domain"
)

// FakeAccountDirectory — in-memory domain.AccountDirectory для тестов
// обогащения ростера привязанной учёткой (спека 0040, FR-8). Отсутствующий
// в карте id просто не попадает в ответ — тот же контракт, что у реального
// auth.DisplayNameProvider (пустая строка/отсутствие ключа — «имя
// недоступно», не ошибка).
type FakeAccountDirectory struct {
	mu    sync.Mutex
	names map[string]string
}

// NewFakeAccountDirectory создаёт пустой fake-справочник учёток.
func NewFakeAccountDirectory() *FakeAccountDirectory {
	return &FakeAccountDirectory{names: make(map[string]string)}
}

var _ domain.AccountDirectory = (*FakeAccountDirectory)(nil)

// Set регистрирует отображаемое имя учётки (test helper).
func (a *FakeAccountDirectory) Set(userID, displayName string) *FakeAccountDirectory {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.names[userID] = displayName
	return a
}

// DisplayNames возвращает батч отображаемых имён по набору id.
func (a *FakeAccountDirectory) DisplayNames(_ context.Context, ids []string) (map[string]string, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	out := make(map[string]string, len(ids))
	for _, id := range ids {
		if name, ok := a.names[id]; ok {
			out[id] = name
		}
	}
	return out, nil
}
