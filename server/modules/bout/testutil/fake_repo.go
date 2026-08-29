// Package testutil содержит test doubles (fake-реализации портов) модуля
// bout. Используется юнит-тестами service и e2e-тестами api-хендлеров.
package testutil

import (
	"context"
	"sort"
	"sync"
	"time"

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
	// eventsForPoolsCalls — spy: аргументы каждого вызова EventsForPools
	// (спека 0033, FR-33) — для проверки клэмпа лимита и no-op на пустом
	// poolIDs в тестах service.
	eventsForPoolsCalls []EventsForPoolsCall
	// boutTimesForPoolsCalls — spy: аргументы каждого вызова
	// BoutTimesForPools (спека 0034, FR-16) — для проверки no-op на пустом
	// poolIDs в тестах service (TimesForPools не должен ходить в репо).
	boutTimesForPoolsCalls [][]string
	// startedAtByBoutsCalls — spy: аргументы каждого вызова
	// StartedAtByBouts (спека 0043, ADR 0020) — для проверки no-op на
	// пустом boutIDs в тестах service.
	startedAtByBoutsCalls [][]string
	// existsBoutForNominationCalls — spy: аргументы каждого вызова
	// ExistsBoutForNomination (спека 0040, гейт удаления номинации).
	existsBoutForNominationCalls []string
	// repointFighterCalls — spy: аргументы каждого вызова RepointFighter
	// (спека 0040, слияние дублей бойца).
	repointFighterCalls []RepointFighterCall
}

// RepointFighterCall — зафиксированный вызов RepointFighter.
type RepointFighterCall struct {
	OldID string
	NewID string
}

// EventsForPoolsCall — зафиксированный вызов EventsForPools.
type EventsForPoolsCall struct {
	PoolIDs []string
	Limit   int
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

// EventsForPools возвращает журнал боёв перечисленных пулов (спека 0033,
// FR-33): находит boutID, чья проекция (r.views) принадлежит одному из
// poolIDs, берёт из r.events[boutID] все события кроме scheduled (у него
// нет человека-инициатора, FR-34/FR-36) и собирает плоские EventRecord —
// fighter/pool/sequence из проекции (у остальных типов событий их нет в
// payload), ScoreA/ScoreB из payload события, ActorID/OccurredAt/Type — из
// самого события. Сортировка — новыми вперёд (occurred_at DESC, при
// совпадении — версия события DESC, как ORDER BY в реальном SQL). Пустой
// poolIDs — no-op: пустой срез, без сканирования хранилища.
func (r *FakeRepo) EventsForPools(_ context.Context, poolIDs []string, limit int) ([]domain.EventRecord, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.eventsForPoolsCalls = append(r.eventsForPoolsCalls, EventsForPoolsCall{
		PoolIDs: append([]string{}, poolIDs...),
		Limit:   limit,
	})

	if len(poolIDs) == 0 {
		return nil, nil
	}

	poolSet := make(map[string]struct{}, len(poolIDs))
	for _, id := range poolIDs {
		poolSet[id] = struct{}{}
	}

	type scored struct {
		rec domain.EventRecord
		seq int
	}
	var recs []scored
	for boutID, view := range r.views {
		if _, ok := poolSet[view.PoolID]; !ok {
			continue
		}
		for _, ev := range r.events[boutID] {
			if ev.Type == domain.EventScheduled {
				continue
			}
			recs = append(recs, scored{
				rec: domain.EventRecord{
					BoutID:         boutID,
					PoolID:         view.PoolID,
					SequenceNumber: view.SequenceNumber,
					FighterA:       view.FighterA,
					FighterB:       view.FighterB,
					Type:           ev.Type,
					ScoreA:         ev.Payload.ScoreA,
					ScoreB:         ev.Payload.ScoreB,
					ActorID:        ev.ActorID,
					OccurredAt:     ev.OccurredAt,
				},
				seq: ev.Sequence,
			})
		}
	}

	sort.Slice(recs, func(i, j int) bool {
		if !recs[i].rec.OccurredAt.Equal(recs[j].rec.OccurredAt) {
			return recs[i].rec.OccurredAt.After(recs[j].rec.OccurredAt)
		}
		return recs[i].seq > recs[j].seq
	})

	out := make([]domain.EventRecord, 0, len(recs))
	for _, s := range recs {
		out = append(out, s.rec)
	}
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	return out, nil
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

// EventsForPoolsCalls возвращает зафиксированные вызовы EventsForPools (для
// проверки клэмпа лимита и no-op на пустом poolIDs в тестах service, спека
// 0033, FR-33).
func (r *FakeRepo) EventsForPoolsCalls() []EventsForPoolsCall {
	r.mu.Lock()
	defer r.mu.Unlock()

	out := make([]EventsForPoolsCall, len(r.eventsForPoolsCalls))
	for i, c := range r.eventsForPoolsCalls {
		out[i] = EventsForPoolsCall{PoolIDs: append([]string{}, c.PoolIDs...), Limit: c.Limit}
	}
	return out
}

// BoutTimesForPools возвращает фактическое время начала/завершения каждого
// боя перечисленных пулов (спека 0034, FR-16) — зеркалит семантику SQL
// BoutTimesForPools (repo/queries/bout.sql): время берётся не из первого
// попавшегося события своего вида, а из последнего события started/
// finished, случившегося после последнего restart-маркера потока (reset —
// для started; reopened или reset — для finished), см. boutTimesFromEvents.
// Пустой poolIDs — no-op: пустая карта без сканирования хранилища.
func (r *FakeRepo) BoutTimesForPools(_ context.Context, poolIDs []string) (map[string]domain.BoutTimes, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.boutTimesForPoolsCalls = append(r.boutTimesForPoolsCalls, append([]string{}, poolIDs...))

	if len(poolIDs) == 0 {
		return map[string]domain.BoutTimes{}, nil
	}

	poolSet := make(map[string]struct{}, len(poolIDs))
	for _, id := range poolIDs {
		poolSet[id] = struct{}{}
	}

	out := make(map[string]domain.BoutTimes)
	for boutID, view := range r.views {
		if _, ok := poolSet[view.PoolID]; !ok {
			continue
		}
		out[boutID] = boutTimesFromEvents(r.events[boutID])
	}
	return out, nil
}

// boutTimesFromEvents — общая логика BoutTimesForPools для потока одного
// боя (см. doc-комментарий выше и SQL-запрос для доменного обоснования):
// started_at — момент последнего события started, случившегося после
// последнего reset; finished_at — момент последнего события finished,
// случившегося после последнего reopened/reset. Оба nil, если такого
// события нет вовсе (спека 0034, FR-16).
func boutTimesFromEvents(events []domain.Event) domain.BoutTimes {
	var lastReset, lastReopenOrReset int
	for _, ev := range events {
		switch ev.Type {
		case domain.EventReset:
			if ev.Sequence > lastReset {
				lastReset = ev.Sequence
			}
			if ev.Sequence > lastReopenOrReset {
				lastReopenOrReset = ev.Sequence
			}
		case domain.EventReopened:
			if ev.Sequence > lastReopenOrReset {
				lastReopenOrReset = ev.Sequence
			}
		}
	}

	var times domain.BoutTimes
	bestStartedSeq, bestFinishedSeq := 0, 0
	for _, ev := range events {
		switch ev.Type {
		case domain.EventStarted:
			if ev.Sequence > lastReset && ev.Sequence > bestStartedSeq {
				t := ev.OccurredAt
				times.StartedAt = &t
				bestStartedSeq = ev.Sequence
			}
		case domain.EventFinished:
			if ev.Sequence > lastReopenOrReset && ev.Sequence > bestFinishedSeq {
				t := ev.OccurredAt
				times.FinishedAt = &t
				bestFinishedSeq = ev.Sequence
			}
		}
	}
	return times
}

// BoutTimesForPoolsCalls возвращает зафиксированные вызовы
// BoutTimesForPools (для проверки no-op на пустом poolIDs в тестах
// service, спека 0034, FR-16).
func (r *FakeRepo) BoutTimesForPoolsCalls() [][]string {
	r.mu.Lock()
	defer r.mu.Unlock()

	out := make([][]string, len(r.boutTimesForPoolsCalls))
	for i, c := range r.boutTimesForPoolsCalls {
		out[i] = append([]string{}, c...)
	}
	return out
}

// StartedAtByBouts возвращает первый момент начала каждого боя из списка
// (спека 0043, ADR 0020) — зеркалит семантику SQL StartedAtByBouts
// (repo/queries/pace.sql): МИНИМАЛЬНЫЙ occurred_at события started (не
// последний, в отличие от boutTimesFromEvents выше) — reset+повторный
// StartBout может дать несколько started, для темпа площадки важен первый
// реальный запуск. Бои без события started просто отсутствуют в карте.
// Пустой boutIDs — no-op: пустая карта без сканирования хранилища.
func (r *FakeRepo) StartedAtByBouts(_ context.Context, boutIDs []string) (map[string]time.Time, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.startedAtByBoutsCalls = append(r.startedAtByBoutsCalls, append([]string{}, boutIDs...))

	if len(boutIDs) == 0 {
		return map[string]time.Time{}, nil
	}

	out := make(map[string]time.Time)
	for _, boutID := range boutIDs {
		var earliest *time.Time
		for _, ev := range r.events[boutID] {
			if ev.Type != domain.EventStarted {
				continue
			}
			if earliest == nil || ev.OccurredAt.Before(*earliest) {
				t := ev.OccurredAt
				earliest = &t
			}
		}
		if earliest != nil {
			out[boutID] = *earliest
		}
	}
	return out, nil
}

// StartedAtByBoutsCalls возвращает зафиксированные вызовы StartedAtByBouts
// (для проверки no-op на пустом boutIDs в тестах service, спека 0043).
func (r *FakeRepo) StartedAtByBoutsCalls() [][]string {
	r.mu.Lock()
	defer r.mu.Unlock()

	out := make([][]string, len(r.startedAtByBoutsCalls))
	for i, c := range r.startedAtByBoutsCalls {
		out[i] = append([]string{}, c...)
	}
	return out
}

// ExistsBoutForNomination — есть ли среди боёв номинации хотя бы один
// поставленный (спека 0040, гейт удаления номинации). Зеркалит семантику
// реального SQL-запроса (WHERE nomination_id = $1) над проекциями боёв.
func (r *FakeRepo) ExistsBoutForNomination(_ context.Context, nominationID string) (bool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.existsBoutForNominationCalls = append(r.existsBoutForNominationCalls, nominationID)

	for _, v := range r.views {
		if v.NominationID == nominationID {
			return true, nil
		}
	}
	return false, nil
}

// ExistsBoutForNominationCalls возвращает зафиксированные вызовы
// ExistsBoutForNomination (для проверки в тестах service, спека 0040).
func (r *FakeRepo) ExistsBoutForNominationCalls() []string {
	r.mu.Lock()
	defer r.mu.Unlock()

	return append([]string{}, r.existsBoutForNominationCalls...)
}

// RepointFighter переносит оба борта (FighterA/FighterB) всех боёв
// дубля-источника (oldID) на итоговую запись (newID) — слияние дублей
// бойца (спека 0040, сценарий 3). Денормализованные имя/клуб бойца в
// проекции НЕ переписываются — тот же исторический-снапшот приём, что и
// настоящий SQL (repo/queries/bout.sql, RepointFighterA/B).
func (r *FakeRepo) RepointFighter(_ context.Context, oldID, newID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.repointFighterCalls = append(r.repointFighterCalls, RepointFighterCall{OldID: oldID, NewID: newID})

	for id, v := range r.views {
		if v.FighterA.ID == oldID {
			v.FighterA.ID = newID
		}
		if v.FighterB.ID == oldID {
			v.FighterB.ID = newID
		}
		r.views[id] = v
	}
	return nil
}

// RepointFighterCalls возвращает зафиксированные вызовы RepointFighter
// (для проверки в тестах service, спека 0040).
func (r *FakeRepo) RepointFighterCalls() []RepointFighterCall {
	r.mu.Lock()
	defer r.mu.Unlock()

	return append([]RepointFighterCall{}, r.repointFighterCalls...)
}
