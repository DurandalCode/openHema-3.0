// Package testutil содержит test doubles (fake-реализации портов) модуля
// fighter. Используется юнит-тестами service и e2e-тестами api-хендлеров.
package testutil

import (
	"context"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/hema/server/modules/fighter/domain"
)

// FakeRepo — in-memory реализация domain.Repository для тестов.
// Потокобезопасна (мьютекс). Повторяет ключевой инвариант БД: один боец на
// пару (tournament_id, origin_user_id), если origin_user_id задан.
type FakeRepo struct {
	mu       sync.Mutex
	fighters map[string]domain.Fighter
}

// NewFakeRepo создаёт пустой fake-репозиторий.
func NewFakeRepo() *FakeRepo {
	return &FakeRepo{fighters: make(map[string]domain.Fighter)}
}

// NewFakeRepoWithFighters создаёт fake-репозиторий, предзаполненный
// переданными бойцами (удобно для тестов чтения/правки/вывода).
func NewFakeRepoWithFighters(fighters ...domain.Fighter) *FakeRepo {
	r := NewFakeRepo()
	for _, f := range fighters {
		r.fighters[f.ID] = f
	}
	return r
}

var _ domain.Repository = (*FakeRepo)(nil)

// Create вставляет нового бойца с участиями, присваивая ID. Имитирует
// partial-unique индекс БД (tournament_id, origin_user_id):
// domain.ErrOriginConflict при гонке двух созданий с одним ключом.
func (r *FakeRepo) Create(_ context.Context, f domain.Fighter) (domain.Fighter, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if f.OriginUserID != nil {
		for _, existing := range r.fighters {
			if existing.TournamentID == f.TournamentID &&
				existing.OriginUserID != nil && *existing.OriginUserID == *f.OriginUserID {
				return domain.Fighter{}, domain.ErrOriginConflict
			}
		}
	}

	now := time.Now().UTC()
	f.ID = uuid.NewString()
	f.CreatedAt = now
	f.UpdatedAt = now
	r.fighters[f.ID] = f
	return f, nil
}

// Update сохраняет полное состояние существующего бойца.
func (r *FakeRepo) Update(_ context.Context, f domain.Fighter) (domain.Fighter, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	existing, ok := r.fighters[f.ID]
	if !ok {
		return domain.Fighter{}, domain.ErrNotFound
	}
	f.TournamentID = existing.TournamentID
	f.OriginUserID = existing.OriginUserID
	f.CreatedAt = existing.CreatedAt
	f.UpdatedAt = time.Now().UTC()
	r.fighters[f.ID] = f
	return f, nil
}

// GetByID возвращает бойца со всеми участиями.
func (r *FakeRepo) GetByID(_ context.Context, id string) (domain.Fighter, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	f, ok := r.fighters[id]
	if !ok {
		return domain.Fighter{}, domain.ErrNotFound
	}
	return f, nil
}

// FindByOrigin ищет бойца по ключу происхождения в пределах турнира.
func (r *FakeRepo) FindByOrigin(_ context.Context, tournamentID, originUserID string) (domain.Fighter, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, f := range r.fighters {
		if f.TournamentID == tournamentID && f.OriginUserID != nil && *f.OriginUserID == originUserID {
			return f, nil
		}
	}
	return domain.Fighter{}, domain.ErrNotFound
}

// ListByTournament возвращает ростер турнира.
func (r *FakeRepo) ListByTournament(_ context.Context, tournamentID string) ([]domain.Fighter, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	out := make([]domain.Fighter, 0)
	for _, f := range r.fighters {
		if f.TournamentID == tournamentID {
			out = append(out, f)
		}
	}
	return out, nil
}

// RosterByNomination возвращает публичный состав номинации: по каждому
// бойцу, у которого есть участие в этой номинации (любого статуса) — имя,
// клуб и признак «в составе».
func (r *FakeRepo) RosterByNomination(_ context.Context, nominationID string) ([]domain.RosterEntry, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	out := make([]domain.RosterEntry, 0)
	for _, f := range r.fighters {
		for _, p := range f.Participations {
			if p.NominationID != nominationID {
				continue
			}
			out = append(out, domain.RosterEntry{
				Name:     f.Name,
				Club:     f.Club,
				InRoster: f.Status == domain.StatusActive && p.Status == domain.ParticipationActive,
			})
		}
	}
	return out, nil
}

// ActiveFightersByNomination возвращает бойцов «в составе» номинации.
func (r *FakeRepo) ActiveFightersByNomination(_ context.Context, nominationID string) ([]domain.FighterRef, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	out := make([]domain.FighterRef, 0)
	for _, f := range r.fighters {
		if f.Status != domain.StatusActive {
			continue
		}
		for _, p := range f.Participations {
			if p.NominationID == nominationID && p.Status == domain.ParticipationActive {
				out = append(out, domain.FighterRef{ID: f.ID, Name: f.Name, Club: f.Club})
				break
			}
		}
	}
	return out, nil
}
