// Package testutil содержит test doubles (fake-реализации портов) модуля
// tournament. Используется юнит-тестами service и e2e-тестами api-хендлеров.
package testutil

import (
	"context"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/hema/server/modules/tournament/domain"
)

// FakeRepo — in-memory реализация domain.Repository для тестов.
// Потокобезопасна (мьютекс). Хранит ровно один активный турнир (MVP),
// что повторяет контракт БД (partial unique index на is_active).
type FakeRepo struct {
	mu         sync.Mutex
	tournament domain.Tournament
	hasActive  bool
}

// NewFakeRepo создаёт пустой fake-репозиторий без активного турнира.
func NewFakeRepo() *FakeRepo {
	return &FakeRepo{}
}

// NewFakeRepoWithActive создаёт fake-репозиторий c предзаполненным активным
// турниром (удобно для тестов чтения).
func NewFakeRepoWithActive(t domain.Tournament) *FakeRepo {
	t.IsActive = true
	return &FakeRepo{tournament: t, hasActive: true}
}

var _ domain.Repository = (*FakeRepo)(nil)

// GetActive возвращает активный турнир с контактами.
func (r *FakeRepo) GetActive(_ context.Context) (domain.Tournament, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if !r.hasActive {
		return domain.Tournament{}, domain.ErrNotFound
	}
	return cloneTournament(r.tournament), nil
}

// UpdateActive обновляет поля активного турнира и заменяет набор контактов.
func (r *FakeRepo) UpdateActive(_ context.Context, in domain.UpdateInput) (domain.Tournament, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if !r.hasActive {
		return domain.Tournament{}, domain.ErrNotFound
	}

	now := time.Now().UTC()
	t := r.tournament
	t.Title = in.Title
	t.Description = in.Description
	t.EventStartAt = in.EventStartAt
	t.HasEventStartAt = in.HasEventStartAt
	t.EventEndAt = in.EventEndAt
	t.HasEventEndAt = in.HasEventEndAt
	t.EmblemURL = in.EmblemURL
	t.UpdatedAt = now

	contacts := make([]domain.Contact, 0, len(in.Contacts))
	for i, c := range in.Contacts {
		contacts = append(contacts, domain.Contact{
			ID:       uuid.NewString(),
			Type:     c.Type,
			Value:    c.Value,
			Position: int32(i),
		})
	}
	t.Contacts = contacts
	r.tournament = t
	return cloneTournament(t), nil
}

func cloneTournament(t domain.Tournament) domain.Tournament {
	out := t
	if len(t.Contacts) > 0 {
		out.Contacts = append([]domain.Contact(nil), t.Contacts...)
	}
	return out
}