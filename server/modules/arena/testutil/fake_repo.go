// Package testutil содержит test doubles (fake-реализации портов) модуля
// arena. Используется юнит-тестами service и e2e-тестами api-хендлеров.
package testutil

import (
	"context"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/hema/server/modules/arena/domain"
)

// FakeRepo — in-memory реализация domain.Repository для тестов.
// Потокобезопасна (мьютекс). Повторяет контракты БД: position по порядку
// добавления (max+1), SetStatus просто выставляет строку статуса.
type FakeRepo struct {
	mu     sync.Mutex
	arenas map[string]domain.Arena
}

// NewFakeRepo создаёт пустой fake-репозиторий.
func NewFakeRepo() *FakeRepo {
	return &FakeRepo{arenas: make(map[string]domain.Arena)}
}

// NewFakeRepoWithArenas создаёт fake-репозиторий, предзаполненный
// переданными площадками (удобно для тестов чтения/обновления).
func NewFakeRepoWithArenas(arenas ...domain.Arena) *FakeRepo {
	r := NewFakeRepo()
	for _, a := range arenas {
		r.arenas[a.ID] = a
	}
	return r
}

var _ domain.Repository = (*FakeRepo)(nil)

// ListByTournament возвращает площадки турнира, отсортированные по position.
func (r *FakeRepo) ListByTournament(_ context.Context, tournamentID string) ([]domain.Arena, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	out := make([]domain.Arena, 0)
	for _, a := range r.arenas {
		if a.TournamentID == tournamentID {
			out = append(out, a)
		}
	}
	sortByPosition(out)
	return out, nil
}

// GetByID возвращает площадку по идентификатору.
func (r *FakeRepo) GetByID(_ context.Context, id string) (domain.Arena, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	a, ok := r.arenas[id]
	if !ok {
		return domain.Arena{}, domain.ErrNotFound
	}
	return a, nil
}

// Create создаёт площадку у турнира; position = следующий за максимумом
// среди существующих площадок турнира. Статус по умолчанию — active.
func (r *FakeRepo) Create(_ context.Context, tournamentID string, in domain.CreateInput) (domain.Arena, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	maxPosition := int32(-1)
	for _, a := range r.arenas {
		if a.TournamentID != tournamentID {
			continue
		}
		if a.Position > maxPosition {
			maxPosition = a.Position
		}
	}

	now := time.Now().UTC()
	a := domain.Arena{
		ID:          uuid.NewString(),
		TournamentID: tournamentID,
		Name:        in.Name,
		Description: in.Description,
		Position:    maxPosition + 1,
		Status:      domain.StatusActive,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	r.arenas[a.ID] = a
	return a, nil
}

// Update обновляет редактируемые поля существующей площадки.
func (r *FakeRepo) Update(_ context.Context, in domain.UpdateInput) (domain.Arena, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	existing, ok := r.arenas[in.ID]
	if !ok {
		return domain.Arena{}, domain.ErrNotFound
	}
	existing.Name = in.Name
	existing.Description = in.Description
	existing.UpdatedAt = time.Now().UTC()
	r.arenas[in.ID] = existing
	return existing, nil
}

// SetStatus переключает статус площадки (active↔archived).
func (r *FakeRepo) SetStatus(_ context.Context, id string, status domain.Status) (domain.Arena, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	existing, ok := r.arenas[id]
	if !ok {
		return domain.Arena{}, domain.ErrNotFound
	}
	existing.Status = status
	existing.UpdatedAt = time.Now().UTC()
	r.arenas[id] = existing
	return existing, nil
}

// Reorder задаёт позиции площадок турнира по порядку orderedIDs. Предполагает,
// что orderedIDs уже провалидирован вызывающим (service) как ровно текущий
// набор id турнира.
func (r *FakeRepo) Reorder(_ context.Context, _ string, orderedIDs []string) ([]domain.Arena, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	now := time.Now().UTC()
	out := make([]domain.Arena, 0, len(orderedIDs))
	for i, id := range orderedIDs {
		a, ok := r.arenas[id]
		if !ok {
			return nil, domain.ErrNotFound
		}
		a.Position = int32(i)
		a.UpdatedAt = now
		r.arenas[id] = a
		out = append(out, a)
	}
	return out, nil
}

func sortByPosition(arenas []domain.Arena) {
	for i := 1; i < len(arenas); i++ {
		for j := i; j > 0 && arenas[j].Position < arenas[j-1].Position; j-- {
			arenas[j], arenas[j-1] = arenas[j-1], arenas[j]
		}
	}
}