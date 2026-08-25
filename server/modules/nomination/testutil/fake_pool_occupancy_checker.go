package testutil

import (
	"context"

	"github.com/hema/server/modules/nomination/domain"
)

// FakePoolOccupancyChecker — fake-реализация domain.PoolOccupancyChecker для
// тестов service/api (спека 0040, T3/T4). Возвращает фиксированный результат
// независимо от nominationID — этого достаточно для гейта Delete, который не
// дифференцирует номинации внутри одного теста.
type FakePoolOccupancyChecker struct {
	hasDistributed bool
	err            error
}

// NewFakePoolOccupancyChecker создаёт чекер с фиксированным результатом
// HasDistributedFighters.
func NewFakePoolOccupancyChecker(hasDistributed bool) *FakePoolOccupancyChecker {
	return &FakePoolOccupancyChecker{hasDistributed: hasDistributed}
}

// NewFakePoolOccupancyCheckerWithError создаёт чекер, всегда возвращающий
// заданную ошибку (эмуляция сбоя межмодульного вызова).
func NewFakePoolOccupancyCheckerWithError(err error) *FakePoolOccupancyChecker {
	return &FakePoolOccupancyChecker{err: err}
}

var _ domain.PoolOccupancyChecker = (*FakePoolOccupancyChecker)(nil)

// HasDistributedFighters возвращает фиксированный результат либо ошибку.
func (c *FakePoolOccupancyChecker) HasDistributedFighters(_ context.Context, _ string) (bool, error) {
	if c.err != nil {
		return false, c.err
	}
	return c.hasDistributed, nil
}
