package testutil

import (
	"context"
	"sync"

	"github.com/hema/server/modules/pool/domain"
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

// FakeBoutGenerator — spy-реализация domain.BoutGenerator для тестов
// service: фиксирует все вызовы GenerateForNomination/ClearForNomination с
// их аргументами, позволяет настроить ошибку на каждый метод.
type FakeBoutGenerator struct {
	mu sync.Mutex

	// GenerateErr — если задана, GenerateForNomination возвращает эту ошибку
	// (вызов при этом всё равно фиксируется).
	GenerateErr error
	// ClearErr — если задана, ClearForNomination возвращает эту ошибку (вызов
	// при этом всё равно фиксируется).
	ClearErr error

	GenerateCalls []GenerateCall
	ClearCalls    []ClearCall
}

// NewFakeBoutGenerator создаёт пустой fake-генератор боёв.
func NewFakeBoutGenerator() *FakeBoutGenerator {
	return &FakeBoutGenerator{}
}

var _ domain.BoutGenerator = (*FakeBoutGenerator)(nil)

// GenerateForNomination фиксирует вызов и возвращает GenerateErr, если задан.
func (f *FakeBoutGenerator) GenerateForNomination(_ context.Context, nominationID string, pools []domain.BoutPoolInput) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.GenerateCalls = append(f.GenerateCalls, GenerateCall{
		NominationID: nominationID,
		Pools:        append([]domain.BoutPoolInput{}, pools...),
	})
	return f.GenerateErr
}

// ClearForNomination фиксирует вызов и возвращает ClearErr, если задан.
func (f *FakeBoutGenerator) ClearForNomination(_ context.Context, nominationID string) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.ClearCalls = append(f.ClearCalls, ClearCall{NominationID: nominationID})
	return f.ClearErr
}
