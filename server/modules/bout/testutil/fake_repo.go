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

	// replaceCalls — spy: аргументы каждого вызова ReplaceForPools
	// (для проверки идемпотентного replace-семантики в тестах service).
	replaceCalls []ReplaceCall
	// scheduleCalls — spy: аргументы каждого вызова ScheduleBouts (спека
	// 0018, FR-14).
	scheduleCalls [][]domain.Bout
	// deleteBoutsCalls — spy: аргументы каждого вызова DeleteBouts (спека
	// 0018, FR-16) — точечное удаление боёв по id, в отличие от
	// deleteByPoolsCalls ниже (удаление по пулам).
	deleteBoutsCalls [][]string
	// deleteByPoolsCalls — spy: аргументы каждого вызова DeleteBoutsByPools
	// (для проверки, что расфиксация этапа трогает только свои пулы,
	// спека 0017 FR-8).
	deleteByPoolsCalls [][]string
}

// ReplaceCall — зафиксированный вызов ReplaceForPools.
type ReplaceCall struct {
	PoolIDs []string
	Bouts   []domain.Bout
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

// ReplaceForPools удаляет бои перечисленных пулов (проекция + потоки
// событий, эмулируя ON DELETE CASCADE) и вставляет новые: на каждый бой —
// строка проекции (state=not_started, version=1) и событие scheduled
// (version 1) — как настоящий repo (bouts == nil → только удаление).
// Используется GenerateForStage: адресация удаления — явный список пулов
// этапа, не номинация целиком (спека 0018 — регресс латентного бага 0017,
// см. testutil "не трогает бои пулов другого этапа той же номинации").
func (r *FakeRepo) ReplaceForPools(_ context.Context, poolIDs []string, bouts []domain.Bout) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.replaceCalls = append(r.replaceCalls, ReplaceCall{PoolIDs: append([]string{}, poolIDs...), Bouts: append([]domain.Bout{}, bouts...)})

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

	r.insertScheduled(bouts)
	return nil
}

// ScheduleBouts вставляет проекции + события scheduled для перечисленных
// боёв, не удаляя ничего (спека 0018, FR-14) — точечная материализация пары
// сетки, в отличие от ReplaceForPools (полная замена состава контейнера).
func (r *FakeRepo) ScheduleBouts(_ context.Context, bouts []domain.Bout) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.scheduleCalls = append(r.scheduleCalls, append([]domain.Bout{}, bouts...))
	r.insertScheduled(bouts)
	return nil
}

// insertScheduled — общая логика вставки боёв со стартовым состоянием
// (state=not_started, version=1) и событием scheduled (version 1),
// используемая и ReplaceForPools, и ScheduleBouts. Вызывающий уже держит
// r.mu.
func (r *FakeRepo) insertScheduled(bouts []domain.Bout) {
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
}

// DeleteBouts точечно удаляет перечисленные бои (проекция + потоки событий,
// эмулируя ON DELETE CASCADE) по id — снятие продвижения при пересмотре
// результата (спека 0018, FR-16). Пустой список — no-op.
func (r *FakeRepo) DeleteBouts(_ context.Context, ids []string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.deleteBoutsCalls = append(r.deleteBoutsCalls, append([]string{}, ids...))

	for _, id := range ids {
		delete(r.views, id)
		delete(r.events, id)
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
// событие scheduled), в обход ReplaceForPools (без записи в spy).
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

// ReplaceCalls возвращает зафиксированные вызовы ReplaceForPools (для
// проверки в тестах service, сколько раз и с чем был вызван репозиторий).
func (r *FakeRepo) ReplaceCalls() []ReplaceCall {
	r.mu.Lock()
	defer r.mu.Unlock()

	return append([]ReplaceCall{}, r.replaceCalls...)
}

// ScheduleCalls возвращает зафиксированные вызовы ScheduleBouts (спека
// 0018, FR-14).
func (r *FakeRepo) ScheduleCalls() [][]domain.Bout {
	r.mu.Lock()
	defer r.mu.Unlock()

	out := make([][]domain.Bout, len(r.scheduleCalls))
	for i, c := range r.scheduleCalls {
		out[i] = append([]domain.Bout{}, c...)
	}
	return out
}

// DeleteBoutsCalls возвращает зафиксированные вызовы DeleteBouts — точечное
// удаление по id (спека 0018, FR-16), в отличие от DeleteByPoolsCalls ниже.
func (r *FakeRepo) DeleteBoutsCalls() [][]string {
	r.mu.Lock()
	defer r.mu.Unlock()

	out := make([][]string, len(r.deleteBoutsCalls))
	for i, c := range r.deleteBoutsCalls {
		out[i] = append([]string{}, c...)
	}
	return out
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
