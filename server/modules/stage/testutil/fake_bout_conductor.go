package testutil

import (
	"context"
	"sort"
	"sync"

	"github.com/google/uuid"

	"github.com/hema/server/modules/stage/domain"
)

// GenerateCall — зафиксированный вызов GenerateForStage (аргументы, для
// проверки в тестах). NominationID здесь — не адресация (см. комментарий у
// domain.BoutConductor), а штамп для payload события Scheduled.
type GenerateCall struct {
	NominationID string
	Pools        []domain.BoutPoolInput
}

// ClearCall — зафиксированный вызов ClearForPools (аргументы, для проверки в
// тестах). PoolIDs — пулы ОДНОГО этапа (спека 0017): тесты T6 используют это
// поле, чтобы убедиться, что ready→draft не трогает бои пулов другого этапа
// той же номинации.
type ClearCall struct {
	PoolIDs []string
}

// LifecycleCall — зафиксированный вызов лайфсайкл-команды без счёта
// (Start/Finish/Reopen/Reset), спека 0013.
type LifecycleCall struct {
	BoutID  string
	ActorID string
}

// ScoreCall — зафиксированный вызов ScoreBout (спека 0013, FR-2/FR-2a):
// абсолютные значения счёта на момент вызова.
type ScoreCall struct {
	BoutID  string
	ActorID string
	ScoreA  int
	ScoreB  int
}

// ScheduleCall — зафиксированный вызов ScheduleBout (спека 0018, FR-14):
// материализация одной пары сетки.
type ScheduleCall struct {
	NominationID string
	PoolID       string
	Round        int
	Sequence     int
	A, B         domain.FighterRef
}

// FakeBoutConductor — spy-реализация domain.BoutConductor для тестов
// service/api (спека 0013): фиксирует все вызовы (генерация/очистка боёв,
// лайфсайкл текущего боя) с их аргументами, позволяет настроить ошибку на
// каждый метод и предзаселить бои пулов (состояния/счёт) для сценариев
// ведения («пул с B1 завершён, B2 идёт, B3 не начат»).
type FakeBoutConductor struct {
	mu sync.Mutex

	// GenerateErr — если задана, GenerateForNomination возвращает эту ошибку
	// (вызов при этом всё равно фиксируется).
	GenerateErr error
	// ClearErr — если задана, ClearForNomination возвращает эту ошибку (вызов
	// при этом всё равно фиксируется).
	ClearErr error
	// ScheduleErr/DeleteBoutsErr — если заданы, ScheduleBout/DeleteBouts
	// возвращают эту ошибку (вызов всё равно фиксируется, спека 0018).
	ScheduleErr    error
	DeleteBoutsErr error
	// StartErr/ScoreErr/FinishErr/ReopenErr/ResetErr — если заданы,
	// соответствующий метод возвращает эту ошибку (вызов всё равно
	// фиксируется, но состояние предзаселённого боя не меняется).
	StartErr  error
	ScoreErr  error
	FinishErr error
	ReopenErr error
	ResetErr  error
	// BoutsByPoolErr/PoolProgressErr/AnyStartedErr/EventsForPoolsErr —
	// ошибки соответствующих чтений.
	BoutsByPoolErr    error
	PoolProgressErr   error
	AnyStartedErr     error
	EventsForPoolsErr error

	GenerateCalls    []GenerateCall
	ClearCalls       []ClearCall
	StartCalls       []LifecycleCall
	ScoreCalls       []ScoreCall
	FinishCalls      []LifecycleCall
	ReopenCalls      []LifecycleCall
	ResetCalls       []LifecycleCall
	ScheduleCalls    []ScheduleCall
	DeleteBoutsCalls [][]string

	bouts       map[string]*domain.BoutRef // bout id -> bout (мутируется лайфсайкл-командами)
	boutsByPool map[string][]string        // pool id -> bout ids (порядок посева, доска сортирует сама по SequenceNumber)
	poolOfBout  map[string]string          // bout id -> pool id (для чистки boutsByPool при DeleteBouts, спека 0018)

	anyStarted map[string]bool // pool id -> есть ли начатый/проведённый бой (FR-13/спека 0017 FR-8)

	// events — журнал боёв по пулам (спека 0033, FR-33): pool id -> посеянные
	// записи, в порядке SeedEvent (EventsForPools сортирует сама, как
	// настоящий репозиторий — occurred_at DESC).
	events map[string][]domain.BoutEventRecord
}

// NewFakeBoutConductor создаёт пустой fake-кондуктор боёв.
func NewFakeBoutConductor() *FakeBoutConductor {
	return &FakeBoutConductor{
		bouts:       make(map[string]*domain.BoutRef),
		boutsByPool: make(map[string][]string),
		poolOfBout:  make(map[string]string),
		anyStarted:  make(map[string]bool),
		events:      make(map[string][]domain.BoutEventRecord),
	}
}

var _ domain.BoutConductor = (*FakeBoutConductor)(nil)

// SeedBout добавляет бой в пул с заданным начальным состоянием — тестовый
// хелпер для сборки сценариев ведения («B1 finished, B2 in_progress, B3
// not_started»). Повторный SeedBout с тем же b.ID перезаписывает бой (но не
// дублирует его в boutsByPool).
func (f *FakeBoutConductor) SeedBout(poolID string, b domain.BoutRef) {
	f.mu.Lock()
	defer f.mu.Unlock()

	cp := b
	if _, exists := f.bouts[b.ID]; !exists {
		f.boutsByPool[poolID] = append(f.boutsByPool[poolID], b.ID)
		f.poolOfBout[b.ID] = poolID
	}
	f.bouts[b.ID] = &cp
}

// SetAnyStartedForPool — тестовый хелпер: задаёт результат AnyStartedInPools
// для конкретного пула напрямую (без резолва через посеянные бои — гейт
// FR-13/спека 0017 FR-8 тестируется независимо от доски).
func (f *FakeBoutConductor) SetAnyStartedForPool(poolID string, v bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.anyStarted[poolID] = v
}

// Bout возвращает текущее (возможно, изменённое лайфсайкл-командами)
// состояние посеянного боя — тестовый хелпер для проверки мутаций.
func (f *FakeBoutConductor) Bout(boutID string) (domain.BoutRef, bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	b, ok := f.bouts[boutID]
	if !ok {
		return domain.BoutRef{}, false
	}
	return *b, true
}

// GenerateForStage фиксирует вызов и возвращает GenerateErr, если задан.
func (f *FakeBoutConductor) GenerateForStage(_ context.Context, nominationID string, pools []domain.BoutPoolInput) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.GenerateCalls = append(f.GenerateCalls, GenerateCall{
		NominationID: nominationID,
		Pools:        append([]domain.BoutPoolInput{}, pools...),
	})
	return f.GenerateErr
}

// ClearForPools фиксирует вызов (с перечнем пулов этапа) и возвращает
// ClearErr, если задан.
func (f *FakeBoutConductor) ClearForPools(_ context.Context, poolIDs []string) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.ClearCalls = append(f.ClearCalls, ClearCall{PoolIDs: append([]string{}, poolIDs...)})
	return f.ClearErr
}

// ScheduleBout фиксирует вызов и материализует единичный бой пары сетки
// (спека 0018, FR-14): создаёт запись not_started/0:0 с заданными
// round/sequence/участниками, возвращает сгенерированный id. Возвращает
// ScheduleErr, если задан (вызов всё равно фиксируется).
func (f *FakeBoutConductor) ScheduleBout(_ context.Context, nominationID, poolID string, round, sequence int, a, b domain.FighterRef) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.ScheduleCalls = append(f.ScheduleCalls, ScheduleCall{
		NominationID: nominationID, PoolID: poolID, Round: round, Sequence: sequence, A: a, B: b,
	})
	if f.ScheduleErr != nil {
		return "", f.ScheduleErr
	}
	id := uuid.NewString()
	f.bouts[id] = &domain.BoutRef{
		ID: id, RoundNumber: round, SequenceNumber: sequence,
		FighterA: a, FighterB: b, State: domain.BoutStateNotStarted,
	}
	f.boutsByPool[poolID] = append(f.boutsByPool[poolID], id)
	f.poolOfBout[id] = poolID
	return id, nil
}

// DeleteBouts фиксирует вызов и точечно удаляет перечисленные бои (снятие
// продвижения при пересмотре результата, спека 0018, FR-16). Возвращает
// DeleteBoutsErr, если задан.
func (f *FakeBoutConductor) DeleteBouts(_ context.Context, ids []string) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.DeleteBoutsCalls = append(f.DeleteBoutsCalls, append([]string{}, ids...))
	if f.DeleteBoutsErr != nil {
		return f.DeleteBoutsErr
	}
	for _, id := range ids {
		poolID, ok := f.poolOfBout[id]
		if ok {
			f.boutsByPool[poolID] = removeBoutID(f.boutsByPool[poolID], id)
		}
		delete(f.bouts, id)
		delete(f.poolOfBout, id)
	}
	return nil
}

func removeBoutID(ids []string, target string) []string {
	out := ids[:0]
	for _, id := range ids {
		if id != target {
			out = append(out, id)
		}
	}
	return out
}

// StartBout фиксирует вызов, переводит посеянный бой в in_progress (если
// найден), возвращает StartErr, если задан.
func (f *FakeBoutConductor) StartBout(_ context.Context, boutID, actorID string) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.StartCalls = append(f.StartCalls, LifecycleCall{BoutID: boutID, ActorID: actorID})
	if f.StartErr != nil {
		return f.StartErr
	}
	if b, ok := f.bouts[boutID]; ok {
		b.State = domain.BoutStateInProgress
	}
	return nil
}

// ScoreBout фиксирует вызов, задаёт абсолютный счёт посеянного боя (если
// найден), возвращает ScoreErr, если задан.
func (f *FakeBoutConductor) ScoreBout(_ context.Context, boutID, actorID string, scoreA, scoreB int) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.ScoreCalls = append(f.ScoreCalls, ScoreCall{BoutID: boutID, ActorID: actorID, ScoreA: scoreA, ScoreB: scoreB})
	if f.ScoreErr != nil {
		return f.ScoreErr
	}
	if b, ok := f.bouts[boutID]; ok {
		b.ScoreA, b.ScoreB = scoreA, scoreB
	}
	return nil
}

// FinishBout фиксирует вызов, переводит посеянный бой в finished (если
// найден), возвращает FinishErr, если задан.
func (f *FakeBoutConductor) FinishBout(_ context.Context, boutID, actorID string) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.FinishCalls = append(f.FinishCalls, LifecycleCall{BoutID: boutID, ActorID: actorID})
	if f.FinishErr != nil {
		return f.FinishErr
	}
	if b, ok := f.bouts[boutID]; ok {
		b.State = domain.BoutStateFinished
	}
	return nil
}

// ReopenBout фиксирует вызов, переводит посеянный бой обратно в in_progress
// (если найден), возвращает ReopenErr, если задан.
func (f *FakeBoutConductor) ReopenBout(_ context.Context, boutID, actorID string) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.ReopenCalls = append(f.ReopenCalls, LifecycleCall{BoutID: boutID, ActorID: actorID})
	if f.ReopenErr != nil {
		return f.ReopenErr
	}
	if b, ok := f.bouts[boutID]; ok {
		b.State = domain.BoutStateInProgress
	}
	return nil
}

// ResetBout фиксирует вызов, переводит посеянный бой в not_started со
// счётом 0:0 (если найден), возвращает ResetErr, если задан.
func (f *FakeBoutConductor) ResetBout(_ context.Context, boutID, actorID string) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.ResetCalls = append(f.ResetCalls, LifecycleCall{BoutID: boutID, ActorID: actorID})
	if f.ResetErr != nil {
		return f.ResetErr
	}
	if b, ok := f.bouts[boutID]; ok {
		b.State = domain.BoutStateNotStarted
		b.ScoreA, b.ScoreB = 0, 0
	}
	return nil
}

// BoutsByPool возвращает посеянные бои пула (порядок посева — тесты не
// должны полагаться на него, сервис pool сортирует по SequenceNumber сам).
func (f *FakeBoutConductor) BoutsByPool(_ context.Context, poolID string) ([]domain.BoutRef, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	if f.BoutsByPoolErr != nil {
		return nil, f.BoutsByPoolErr
	}
	ids := f.boutsByPool[poolID]
	out := make([]domain.BoutRef, 0, len(ids))
	for _, id := range ids {
		out = append(out, *f.bouts[id])
	}
	return out, nil
}

// PoolProgress вычисляет total/started/finished из посеянных боёв пула
// (started — state ≠ not_started, FR-10).
func (f *FakeBoutConductor) PoolProgress(_ context.Context, poolID string) (total, started, finished int, err error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	if f.PoolProgressErr != nil {
		return 0, 0, 0, f.PoolProgressErr
	}
	ids := f.boutsByPool[poolID]
	total = len(ids)
	for _, id := range ids {
		switch f.bouts[id].State {
		case domain.BoutStateInProgress:
			started++
		case domain.BoutStateFinished:
			started++
			finished++
		}
	}
	return total, started, finished, nil
}

// AnyStartedInPools возвращает true, если хотя бы для одного из poolIDs
// задано SetAnyStartedForPool(id, true); AnyStartedErr, если задан. Пустой
// список — валидный вход, no-op → false (план «Модуль bout», FR-13).
func (f *FakeBoutConductor) AnyStartedInPools(_ context.Context, poolIDs []string) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	if f.AnyStartedErr != nil {
		return false, f.AnyStartedErr
	}
	for _, id := range poolIDs {
		if f.anyStarted[id] {
			return true, nil
		}
	}
	return false, nil
}

// SeedEvent добавляет запись журнала боя в пул (спека 0033, T15) — тестовый
// хелпер для сценариев журнала («бой 6 завершён, бой 7 начат»). В отличие от
// SeedBout (текущая проекция боя), это отдельный event-sourced поток —
// EventsForPools читает его как есть, не выводя из посеянных боёв.
func (f *FakeBoutConductor) SeedEvent(poolID string, ev domain.BoutEventRecord) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.events[poolID] = append(f.events[poolID], ev)
}

// EventsForPools возвращает журнал боёв перечисленных пулов (спека 0033,
// FR-33): все посеянные через SeedEvent записи этих пулов, отсортированные
// новыми вперёд (occurred_at DESC — как настоящий репозиторий, план
// «repo/queries/bout.sql»), ограниченные limit. EventsForPoolsErr, если
// задан.
func (f *FakeBoutConductor) EventsForPools(_ context.Context, poolIDs []string, limit int) ([]domain.BoutEventRecord, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	if f.EventsForPoolsErr != nil {
		return nil, f.EventsForPoolsErr
	}
	out := make([]domain.BoutEventRecord, 0)
	for _, id := range poolIDs {
		out = append(out, f.events[id]...)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].OccurredAt.After(out[j].OccurredAt) })
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}
