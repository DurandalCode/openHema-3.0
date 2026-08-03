// Package testutil содержит test doubles (fake-реализации портов) модуля
// bout. Используется юнит-тестами service и e2e-тестами api-хендлеров.
package testutil

import (
	"context"
	"sort"
	"sync"

	"github.com/google/uuid"

	"github.com/hema/server/modules/bout/domain"
)

// FakeRepo — in-memory реализация domain.Repository: журнал событий (по
// bout_id) + инлайн-проекция. Эмулирует UNIQUE(bout_id, version) (ADR 0011
// п.3): Append успевает только если длина текущего потока в точности равна
// expectedVersion — второй параллельный Append с той же ожидаемой версией
// получает ErrConcurrency, как настоящий уникальный констрейнт. Потокобезопасна
// (мьютекс). Не сохраняет данные между запусками.
type FakeRepo struct {
	mu     sync.Mutex
	events map[string][]domain.Event // boutID -> поток событий, упорядоченный по версии
	views  map[string]domain.Bout    // boutID -> текущая проекция

	// replaceCalls — spy: аргументы каждого вызова ReplaceForNomination
	// (для проверки идемпотентного replace-семантики в тестах service).
	replaceCalls []ReplaceCall
	// deleteByPoolsCalls — spy: аргументы каждого вызова DeleteBoutsByPools
	// (для проверки, что расфиксация этапа трогает только свои пулы,
	// спека 0017 FR-8).
	deleteByPoolsCalls [][]string
}

// ReplaceCall — зафиксированный вызов ReplaceForNomination.
type ReplaceCall struct {
	NominationID string
	Bouts        []domain.Bout
}

// NewFakeRepo создаёт пустой fake-репозиторий.
func NewFakeRepo() *FakeRepo {
	return &FakeRepo{
		events: make(map[string][]domain.Event),
		views:  make(map[string]domain.Bout),
	}
}

var _ domain.Repository = (*FakeRepo)(nil)

// Load возвращает поток событий боя, упорядоченный по версии.
func (r *FakeRepo) Load(_ context.Context, boutID string) ([]domain.Event, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	events, ok := r.events[boutID]
	if !ok || len(events) == 0 {
		return nil, domain.ErrNotFound
	}
	out := make([]domain.Event, len(events))
	copy(out, events)
	return out, nil
}

// Append атомарно вставляет событие с version = expectedVersion+1 и
// обновляет проекцию. Конфликт версии (текущая длина потока ≠
// expectedVersion) → ErrConcurrency.
func (r *FakeRepo) Append(_ context.Context, boutID string, expectedVersion int, ev domain.Event, view domain.BoutView) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	current := r.events[boutID]
	if len(current) != expectedVersion {
		return domain.ErrConcurrency
	}

	r.events[boutID] = append(current, ev)
	view.ID = boutID
	r.views[boutID] = view
	return nil
}

// ReplaceForNomination удаляет все бои номинации (проекция + потоки
// событий, эмулируя ON DELETE CASCADE) и вставляет новые: на каждый бой —
// строка проекции (state=not_started, version=1) и событие scheduled
// (version 1) — как настоящий repo (bouts == nil → только удаление).
// Используется GenerateForStage (спека 0017).
func (r *FakeRepo) ReplaceForNomination(_ context.Context, nominationID string, bouts []domain.Bout) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.replaceCalls = append(r.replaceCalls, ReplaceCall{NominationID: nominationID, Bouts: append([]domain.Bout{}, bouts...)})

	for id, v := range r.views {
		if v.NominationID == nominationID {
			delete(r.views, id)
			delete(r.events, id)
		}
	}

	for _, b := range bouts {
		id := b.ID
		if id == "" {
			id = uuid.NewString()
		}
		b.ID = id
		b.State = domain.StateNotStarted
		b.ScoreA = 0
		b.ScoreB = 0
		b.Version = 1

		sched := domain.Event{
			Type:     domain.EventScheduled,
			Sequence: 1,
			Payload: domain.Payload{
				PoolID:         b.PoolID,
				NominationID:   b.NominationID,
				RoundNumber:    b.RoundNumber,
				SequenceNumber: b.SequenceNumber,
				FighterA:       b.FighterA,
				FighterB:       b.FighterB,
			},
		}
		r.events[id] = []domain.Event{sched}
		r.views[id] = b
	}
	return nil
}

// DeleteBoutsByPools удаляет бои (проекция + потоки событий, эмулируя
// ON DELETE CASCADE) перечисленных пулов, не трогая бои остальных пулов
// (спека 0017, ClearForPools). Пустой список — no-op.
func (r *FakeRepo) DeleteBoutsByPools(_ context.Context, poolIDs []string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.deleteByPoolsCalls = append(r.deleteByPoolsCalls, append([]string{}, poolIDs...))

	poolSet := make(map[string]struct{}, len(poolIDs))
	for _, id := range poolIDs {
		poolSet[id] = struct{}{}
	}
	for id, v := range r.views {
		if _, ok := poolSet[v.PoolID]; ok {
			delete(r.views, id)
			delete(r.events, id)
		}
	}
	return nil
}

// ListByNomination возвращает бои номинации, отсортированные по PoolID,
// затем SequenceNumber.
func (r *FakeRepo) ListByNomination(_ context.Context, nominationID string) ([]domain.Bout, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	var out []domain.Bout
	for _, v := range r.views {
		if v.NominationID == nominationID {
			out = append(out, v)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].PoolID != out[j].PoolID {
			return out[i].PoolID < out[j].PoolID
		}
		return out[i].SequenceNumber < out[j].SequenceNumber
	})
	return out, nil
}

// BoutsByPool возвращает бои пула, отсортированные по SequenceNumber.
func (r *FakeRepo) BoutsByPool(_ context.Context, poolID string) ([]domain.Bout, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	var out []domain.Bout
	for _, v := range r.views {
		if v.PoolID == poolID {
			out = append(out, v)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].SequenceNumber < out[j].SequenceNumber })
	return out, nil
}

// GetBout возвращает проекцию одного боя.
func (r *FakeRepo) GetBout(_ context.Context, boutID string) (domain.Bout, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	v, ok := r.views[boutID]
	if !ok {
		return domain.Bout{}, domain.ErrNotFound
	}
	return v, nil
}

// PoolProgress возвращает total/started/finished боёв пула. started — бои,
// вышедшие из not_started (in_progress или finished).
func (r *FakeRepo) PoolProgress(_ context.Context, poolID string) (int, int, int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	var total, started, finished int
	for _, v := range r.views {
		if v.PoolID != poolID {
			continue
		}
		total++
		if v.State != domain.StateNotStarted {
			started++
		}
		if v.State == domain.StateFinished {
			finished++
		}
	}
	return total, started, finished, nil
}

// AnyStartedInPools — есть ли среди боёв перечисленных пулов хотя бы один
// со state ≠ not_started (спека 0017, гейт расфиксации этапа). Пустой
// список — no-op: false.
func (r *FakeRepo) AnyStartedInPools(_ context.Context, poolIDs []string) (bool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	poolSet := make(map[string]struct{}, len(poolIDs))
	for _, id := range poolIDs {
		poolSet[id] = struct{}{}
	}
	for _, v := range r.views {
		if _, ok := poolSet[v.PoolID]; !ok {
			continue
		}
		if v.State != domain.StateNotStarted {
			return true, nil
		}
	}
	return false, nil
}

// SeedBouts — тестовый хелпер: кладёт бои напрямую (проекция + синтетическое
// событие scheduled), в обход ReplaceForNomination (без записи в spy).
// Автоматически присваивает ID, если не задан.
func (r *FakeRepo) SeedBouts(nominationID string, bouts ...domain.Bout) {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, b := range bouts {
		id := b.ID
		if id == "" {
			id = uuid.NewString()
		}
		b.ID = id
		b.NominationID = nominationID
		if b.State == "" {
			b.State = domain.StateNotStarted
		}
		if b.Version == 0 {
			b.Version = 1
		}
		if _, ok := r.events[id]; !ok {
			r.events[id] = []domain.Event{{
				Type:     domain.EventScheduled,
				Sequence: 1,
				Payload: domain.Payload{
					PoolID:         b.PoolID,
					NominationID:   b.NominationID,
					RoundNumber:    b.RoundNumber,
					SequenceNumber: b.SequenceNumber,
					FighterA:       b.FighterA,
					FighterB:       b.FighterB,
				},
			}}
		}
		r.views[id] = b
	}
}

// SeedEvents — тестовый хелпер: заводит бой напрямую по готовому потоку
// событий (например, собранному через реальные доменные команды
// Scheduled/Start/Score/...), сворачивает его в проекцию и возвращает
// результат. Полезно для service-тестов, которым нужен бой в конкретном
// состоянии (in_progress/finished) с правдоподобной историей.
func (r *FakeRepo) SeedEvents(boutID string, events ...domain.Event) (domain.Bout, error) {
	view, err := domain.Rebuild(boutID, events)
	if err != nil {
		return domain.Bout{}, err
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	r.events[boutID] = append([]domain.Event{}, events...)
	r.views[boutID] = view
	return view, nil
}

// ReplaceCalls возвращает зафиксированные вызовы ReplaceForNomination (для
// проверки в тестах service, сколько раз и с чем был вызван репозиторий).
func (r *FakeRepo) ReplaceCalls() []ReplaceCall {
	r.mu.Lock()
	defer r.mu.Unlock()

	return append([]ReplaceCall{}, r.replaceCalls...)
}

// DeleteByPoolsCalls возвращает зафиксированные вызовы DeleteBoutsByPools
// (для проверки в тестах service, с каким набором пулов был вызван
// репозиторий, спека 0017).
func (r *FakeRepo) DeleteByPoolsCalls() [][]string {
	r.mu.Lock()
	defer r.mu.Unlock()

	out := make([][]string, len(r.deleteByPoolsCalls))
	for i, c := range r.deleteByPoolsCalls {
		out[i] = append([]string{}, c...)
	}
	return out
}
