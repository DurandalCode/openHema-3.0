package testutil

import (
	"context"
	"sync"

	"github.com/hema/server/modules/fighter/domain"
)

// RepointCall — один зафиксированный вызов RepointFighter(oldID, newID) на
// fake-репойнтере (стадии или боя).
type RepointCall struct {
	OldID string
	NewID string
}

// FakeStageRepointer — fake-реализация domain.StageRepointer для тестов
// MergeFighters (спека 0040, сценарий 3). Реальный репойнт в pool_members/
// withdrawn_seeds — ответственность модуля stage (трек B); здесь только
// фиксация факта и порядка вызова.
type FakeStageRepointer struct {
	mu    sync.Mutex
	Calls []RepointCall
	err   error
}

// NewFakeStageRepointer создаёт пустой fake-репойнтер stage.
func NewFakeStageRepointer() *FakeStageRepointer {
	return &FakeStageRepointer{}
}

// WithError заставляет RepointFighter возвращать заданную ошибку (проверка
// best-effort поведения MergeFighters — сбой репойнта в stage не должен
// откатывать уже выполненное слияние участий, см. plan.md «Риски»).
func (r *FakeStageRepointer) WithError(err error) *FakeStageRepointer {
	r.err = err
	return r
}

var _ domain.StageRepointer = (*FakeStageRepointer)(nil)

// RepointFighter записывает пару (oldID, newID) и возвращает
// сконфигурированную ошибку (если задана).
func (r *FakeStageRepointer) RepointFighter(_ context.Context, oldID, newID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.Calls = append(r.Calls, RepointCall{OldID: oldID, NewID: newID})
	return r.err
}

// FakeBoutRepointer — fake-реализация domain.BoutRepointer для тестов
// MergeFighters (спека 0040, сценарий 3). Реальный репойнт в bout.bouts —
// ответственность модуля bout (трек C); здесь только фиксация факта и
// порядка вызова.
type FakeBoutRepointer struct {
	mu    sync.Mutex
	Calls []RepointCall
	err   error
}

// NewFakeBoutRepointer создаёт пустой fake-репойнтер bout.
func NewFakeBoutRepointer() *FakeBoutRepointer {
	return &FakeBoutRepointer{}
}

// WithError заставляет RepointFighter возвращать заданную ошибку.
func (r *FakeBoutRepointer) WithError(err error) *FakeBoutRepointer {
	r.err = err
	return r
}

var _ domain.BoutRepointer = (*FakeBoutRepointer)(nil)

// RepointFighter записывает пару (oldID, newID) и возвращает
// сконфигурированную ошибку (если задана).
func (r *FakeBoutRepointer) RepointFighter(_ context.Context, oldID, newID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.Calls = append(r.Calls, RepointCall{OldID: oldID, NewID: newID})
	return r.err
}
