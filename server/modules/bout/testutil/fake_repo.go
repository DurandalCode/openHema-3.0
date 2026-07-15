// Package testutil содержит test doubles (fake-реализации портов) модуля
// bout. Используется юнит-тестами service и e2e-тестами api-хендлеров.
package testutil

import (
	"context"
	"sort"
	"sync"

	"github.com/hema/server/modules/bout/domain"
)

// FakeRepo — in-memory реализация domain.Repository для тестов.
// Потокобезопасна (мьютекс).
type FakeRepo struct {
	mu    sync.Mutex
	bouts map[string][]domain.Bout // nominationID -> bouts

	// replaceCalls — spy: аргументы каждого вызова ReplaceForNomination
	// (для проверки идемпотентного replace-семантики в тестах service).
	replaceCalls []ReplaceCall
}

// ReplaceCall — зафиксированный вызов ReplaceForNomination.
type ReplaceCall struct {
	NominationID string
	Bouts        []domain.Bout
}

// NewFakeRepo создаёт пустой fake-репозиторий.
func NewFakeRepo() *FakeRepo {
	return &FakeRepo{bouts: make(map[string][]domain.Bout)}
}

var _ domain.Repository = (*FakeRepo)(nil)

// ReplaceForNomination удаляет все бои номинации и вставляет новые
// (bouts == nil → только удаление — генерация и очистка используют один и
// тот же метод, см. domain.Repository).
func (r *FakeRepo) ReplaceForNomination(_ context.Context, nominationID string, bouts []domain.Bout) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.replaceCalls = append(r.replaceCalls, ReplaceCall{NominationID: nominationID, Bouts: append([]domain.Bout{}, bouts...)})
	if len(bouts) == 0 {
		delete(r.bouts, nominationID)
		return nil
	}
	r.bouts[nominationID] = append([]domain.Bout{}, bouts...)
	return nil
}

// ListByNomination возвращает бои номинации, отсортированные по PoolID,
// затем SequenceNumber.
func (r *FakeRepo) ListByNomination(_ context.Context, nominationID string) ([]domain.Bout, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	out := append([]domain.Bout{}, r.bouts[nominationID]...)
	sort.Slice(out, func(i, j int) bool {
		if out[i].PoolID != out[j].PoolID {
			return out[i].PoolID < out[j].PoolID
		}
		return out[i].SequenceNumber < out[j].SequenceNumber
	})
	return out, nil
}

// SeedBouts — тестовый хелпер: кладёт бои напрямую, в обход
// ReplaceForNomination (без записи в spy).
func (r *FakeRepo) SeedBouts(nominationID string, bouts ...domain.Bout) {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.bouts[nominationID] = append(r.bouts[nominationID], bouts...)
}

// ReplaceCalls возвращает зафиксированные вызовы ReplaceForNomination (для
// проверки в тестах service, сколько раз и с чем был вызван репозиторий).
func (r *FakeRepo) ReplaceCalls() []ReplaceCall {
	r.mu.Lock()
	defer r.mu.Unlock()

	return append([]ReplaceCall{}, r.replaceCalls...)
}
