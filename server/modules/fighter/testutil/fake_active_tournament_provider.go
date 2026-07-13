package testutil

import (
	"context"

	"github.com/hema/server/modules/fighter/domain"
)

// FakeActiveTournamentProvider — fake-реализация domain.ActiveTournamentProvider
// для тестов service/api. Возвращает фиксированный id активного турнира либо
// заданную ошибку (эмуляция «активного турнира нет»).
type FakeActiveTournamentProvider struct {
	id  string
	err error
}

// NewFakeActiveTournamentProvider создаёт провайдер с фиксированным активным
// турниром.
func NewFakeActiveTournamentProvider(id string) *FakeActiveTournamentProvider {
	return &FakeActiveTournamentProvider{id: id}
}

// NewFakeActiveTournamentProviderWithError создаёт провайдер, всегда
// возвращающий ошибку (эмуляция отсутствия активного турнира).
func NewFakeActiveTournamentProviderWithError(err error) *FakeActiveTournamentProvider {
	return &FakeActiveTournamentProvider{err: err}
}

var _ domain.ActiveTournamentProvider = (*FakeActiveTournamentProvider)(nil)

// ActiveTournamentID возвращает фиксированный id активного турнира либо ошибку.
func (p *FakeActiveTournamentProvider) ActiveTournamentID(_ context.Context) (string, error) {
	if p.err != nil {
		return "", p.err
	}
	return p.id, nil
}
