package testutil

import (
	"context"

	"github.com/hema/server/modules/nomination/domain"
)

// FakeBoutOccupancyChecker — fake-реализация domain.BoutOccupancyChecker для
// тестов service/api (спека 0040, T3/T4). Возвращает фиксированный результат
// независимо от nominationID — этого достаточно для гейта Delete, который не
// дифференцирует номинации внутри одного теста.
type FakeBoutOccupancyChecker struct {
	hasBouts bool
	err      error
}

// NewFakeBoutOccupancyChecker создаёт чекер с фиксированным результатом
// HasBouts.
func NewFakeBoutOccupancyChecker(hasBouts bool) *FakeBoutOccupancyChecker {
	return &FakeBoutOccupancyChecker{hasBouts: hasBouts}
}

// NewFakeBoutOccupancyCheckerWithError создаёт чекер, всегда возвращающий
// заданную ошибку (эмуляция сбоя межмодульного вызова).
func NewFakeBoutOccupancyCheckerWithError(err error) *FakeBoutOccupancyChecker {
	return &FakeBoutOccupancyChecker{err: err}
}

var _ domain.BoutOccupancyChecker = (*FakeBoutOccupancyChecker)(nil)

// HasBouts возвращает фиксированный результат либо ошибку.
func (c *FakeBoutOccupancyChecker) HasBouts(_ context.Context, _ string) (bool, error) {
	if c.err != nil {
		return false, c.err
	}
	return c.hasBouts, nil
}
