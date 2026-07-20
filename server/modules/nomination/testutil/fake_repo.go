// Package testutil содержит test doubles (fake-реализации портов) модуля
// nomination. Используется юнит-тестами service и e2e-тестами api-хендлеров.
package testutil

import (
	"context"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/hema/server/modules/nomination/domain"
)

// FakeRepo — in-memory реализация domain.Repository для тестов.
// Потокобезопасна (мьютекс). Повторяет контракты БД: уникальность названия
// в пределах турнира без учёта регистра, позиция по порядку добавления.
type FakeRepo struct {
	mu          sync.Mutex
	nominations map[string]domain.Nomination
}

// NewFakeRepo создаёт пустой fake-репозиторий.
func NewFakeRepo() *FakeRepo {
	return &FakeRepo{nominations: make(map[string]domain.Nomination)}
}

// NewFakeRepoWithNominations создаёт fake-репозиторий, предзаполненный
// переданными номинациями (удобно для тестов чтения/удаления/обновления).
func NewFakeRepoWithNominations(nominations ...domain.Nomination) *FakeRepo {
	r := NewFakeRepo()
	for _, n := range nominations {
		r.nominations[n.ID] = n
	}
	return r
}

var _ domain.Repository = (*FakeRepo)(nil)

// ListByTournament возвращает номинации турнира, отсортированные по position.
func (r *FakeRepo) ListByTournament(_ context.Context, tournamentID string) ([]domain.Nomination, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	out := make([]domain.Nomination, 0)
	for _, n := range r.nominations {
		if n.TournamentID == tournamentID {
			out = append(out, n)
		}
	}
	sortByPosition(out)
	return out, nil
}

// GetByID возвращает номинацию по идентификатору.
func (r *FakeRepo) GetByID(_ context.Context, id string) (domain.Nomination, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	n, ok := r.nominations[id]
	if !ok {
		return domain.Nomination{}, domain.ErrNotFound
	}
	return n, nil
}

// Create создаёт номинацию у турнира; position = следующий за максимумом
// среди существующих номинаций турнира. Отклоняет дубликат названия
// (без учёта регистра) в пределах турнира.
func (r *FakeRepo) Create(_ context.Context, tournamentID string, in domain.CreateInput) (domain.Nomination, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	maxPosition := int32(-1)
	for _, n := range r.nominations {
		if n.TournamentID != tournamentID {
			continue
		}
		if strings.EqualFold(n.Title, in.Title) {
			return domain.Nomination{}, domain.ErrConflict
		}
		if n.Position > maxPosition {
			maxPosition = n.Position
		}
	}

	now := time.Now().UTC()
	n := domain.Nomination{
		ID:                 uuid.NewString(),
		TournamentID:       tournamentID,
		Title:              in.Title,
		Description:        in.Description,
		FighterCapacity:    in.FighterCapacity,
		HasFighterCapacity: in.HasFighterCapacity,
		Metadata:           in.Metadata,
		Position:           maxPosition + 1,
		CreatedAt:          now,
		UpdatedAt:          now,
		Status:             domain.StatusOpen,
	}
	r.nominations[n.ID] = n
	return n, nil
}

// Update обновляет поля существующей номинации. Отклоняет дубликат названия
// (без учёта регистра) среди других номинаций того же турнира.
func (r *FakeRepo) Update(_ context.Context, in domain.UpdateInput) (domain.Nomination, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	existing, ok := r.nominations[in.ID]
	if !ok {
		return domain.Nomination{}, domain.ErrNotFound
	}
	for id, n := range r.nominations {
		if id == in.ID || n.TournamentID != existing.TournamentID {
			continue
		}
		if strings.EqualFold(n.Title, in.Title) {
			return domain.Nomination{}, domain.ErrConflict
		}
	}

	existing.Title = in.Title
	existing.Description = in.Description
	existing.FighterCapacity = in.FighterCapacity
	existing.HasFighterCapacity = in.HasFighterCapacity
	existing.Metadata = in.Metadata
	existing.UpdatedAt = time.Now().UTC()
	r.nominations[in.ID] = existing
	return existing, nil
}

// Delete удаляет номинацию по идентификатору.
func (r *FakeRepo) Delete(_ context.Context, id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, ok := r.nominations[id]; !ok {
		return domain.ErrNotFound
	}
	delete(r.nominations, id)
	return nil
}

// Reorder задаёт позиции номинаций турнира по порядку orderedIDs. Предполагает,
// что orderedIDs уже провалидирован вызывающим (service) как ровно текущий
// набор id турнира.
func (r *FakeRepo) Reorder(_ context.Context, _ string, orderedIDs []string) ([]domain.Nomination, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	now := time.Now().UTC()
	out := make([]domain.Nomination, 0, len(orderedIDs))
	for i, id := range orderedIDs {
		n, ok := r.nominations[id]
		if !ok {
			return nil, domain.ErrNotFound
		}
		n.Position = int32(i)
		n.UpdatedAt = now
		r.nominations[id] = n
		out = append(out, n)
	}
	return out, nil
}

// SetRegistrationState записывает статус, причину закрытия и снапшот
// «раскладка активна» существующей номинации.
func (r *FakeRepo) SetRegistrationState(_ context.Context, id string, status domain.Status, reason domain.ClosedReason, hasDistributed bool) (domain.Nomination, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	existing, ok := r.nominations[id]
	if !ok {
		return domain.Nomination{}, domain.ErrNotFound
	}

	existing.Status = status
	existing.ClosedReason = reason
	existing.HasDistributedFighters = hasDistributed
	existing.UpdatedAt = time.Now().UTC()
	r.nominations[id] = existing
	return existing, nil
}

func sortByPosition(nominations []domain.Nomination) {
	for i := 1; i < len(nominations); i++ {
		for j := i; j > 0 && nominations[j].Position < nominations[j-1].Position; j-- {
			nominations[j], nominations[j-1] = nominations[j-1], nominations[j]
		}
	}
}
