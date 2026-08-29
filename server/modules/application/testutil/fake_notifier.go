package testutil

import (
	"context"

	"github.com/hema/server/modules/application/domain"
)

// FakeNotifier — in-memory domain.Notifier для тестов. Без мьютекса: тесты
// сервиса синхронны (один горутин-вызов за раз), в отличие от других fake
// в этом пакете, которые допускают параллельный доступ.
type FakeNotifier struct {
	Calls []domain.ApplicationNotice
}

var _ domain.Notifier = (*FakeNotifier)(nil)

// ApplicationStateChanged записывает вызов (test helper).
func (n *FakeNotifier) ApplicationStateChanged(_ context.Context, notice domain.ApplicationNotice) {
	n.Calls = append(n.Calls, notice)
}
