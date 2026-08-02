package testutil

import (
	"context"
	"sync"

	"github.com/hema/server/modules/stage/domain"
)

// GenerateCall — зафиксированный вызов GenerateForNomination (аргументы, для
// проверки в тестах).
type GenerateCall struct {
	NominationID string
	Pools        []domain.BoutPoolInput
}

// ClearCall — зафиксированный вызов ClearForNomination (аргументы, для
// проверки в тестах).
type ClearCall struct {
	NominationID string
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
	// StartErr/ScoreErr/FinishErr/ReopenErr/ResetErr — если заданы,
	// соответствующий метод возвращает эту ошибку (вызов всё равно
	// фиксируется, но состояние предзаселённого боя не меняется).
	StartErr  error
	ScoreErr  error
	FinishErr error
	ReopenErr error
	ResetErr  error
	// BoutsByPoolErr/PoolProgressErr/AnyStartedErr — ошибки соответствующих
	// чтений.
	BoutsByPoolErr  error
	PoolProgressErr error
	AnyStartedErr   error

	GenerateCalls []GenerateCall
	ClearCalls    []ClearCall
	StartCalls    []LifecycleCall
	ScoreCalls    []ScoreCall
	FinishCalls   []LifecycleCall
	ReopenCalls   []LifecycleCall
	ResetCalls    []LifecycleCall

	bouts       map[string]*domain.BoutRef // bout id -> bout (мутируется лайфсайкл-командами)
	boutsByPool map[string][]string        // pool id -> bout ids (порядок посева, доска сортирует сама по SequenceNumber)

	anyStarted map[string]bool // nomination id -> есть ли начатый/проведённый бой (FR-13)
}

// NewFakeBoutConductor создаёт пустой fake-кондуктор боёв.
func NewFakeBoutConductor() *FakeBoutConductor {
	return &FakeBoutConductor{
		bouts:       make(map[string]*domain.BoutRef),
		boutsByPool: make(map[string][]string),
		anyStarted:  make(map[string]bool),
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
	}
	f.bouts[b.ID] = &cp
}

// SetAnyStarted — тестовый хелпер: задаёт результат AnyStartedInNomination
// для номинации напрямую (без резолва через посеянные бои — гейт FR-13
// тестируется независимо от доски).
func (f *FakeBoutConductor) SetAnyStarted(nominationID string, v bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.anyStarted[nominationID] = v
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

// GenerateForNomination фиксирует вызов и возвращает GenerateErr, если задан.
func (f *FakeBoutConductor) GenerateForNomination(_ context.Context, nominationID string, pools []domain.BoutPoolInput) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.GenerateCalls = append(f.GenerateCalls, GenerateCall{
		NominationID: nominationID,
		Pools:        append([]domain.BoutPoolInput{}, pools...),
	})
	return f.GenerateErr
}

// ClearForNomination фиксирует вызов и возвращает ClearErr, если задан.
func (f *FakeBoutConductor) ClearForNomination(_ context.Context, nominationID string) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.ClearCalls = append(f.ClearCalls, ClearCall{NominationID: nominationID})
	return f.ClearErr
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

// AnyStartedInNomination возвращает значение, заданное SetAnyStarted (по
// умолчанию false), либо AnyStartedErr, если задан.
func (f *FakeBoutConductor) AnyStartedInNomination(_ context.Context, nominationID string) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	if f.AnyStartedErr != nil {
		return false, f.AnyStartedErr
	}
	return f.anyStarted[nominationID], nil
}
