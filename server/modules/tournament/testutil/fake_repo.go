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
	t.ChiefJudge = in.ChiefJudge
	t.RegulationsURL = in.RegulationsURL
	t.VenueName = in.VenueName
	t.VenueAddress = in.VenueAddress
	t.EntryFeeMinor = in.EntryFeeMinor
	t.EntryFeeCurrency = in.EntryFeeCurrency
	t.Notifications = in.Notifications
	t.UpdatedAt = now

	// Инвариант «файл ⊕ ссылка» (FR-34): непустая ссылка атомарно
	// обнуляет файл того же вида — зеркалит SQL CASE в repo.UpdateActive
	// (см. repo/queries/tournament.sql).
	if in.RegulationsURL != "" {
		t.RegulationsFile = domain.StoredFile{}
	}
	if in.EmblemURL != "" {
		t.EmblemFile = domain.StoredFile{}
	}

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

	program := make([]domain.ProgramDay, 0, len(in.Program))
	for _, d := range in.Program {
		items := make([]domain.ProgramItem, 0, len(d.Items))
		items = append(items, d.Items...)
		program = append(program, domain.ProgramDay{Date: d.Date, Items: items})
	}
	t.Program = program

	r.tournament = t
	return cloneTournament(t), nil
}

// SetFile записывает новый файл для kind и атомарно очищает ссылку того же
// вида (FR-34), зеркаля repo.SetRegulationsFile/SetEmblemFile.
func (r *FakeRepo) SetFile(_ context.Context, kind domain.FileKind, file domain.StoredFile) (domain.Tournament, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if !r.hasActive {
		return domain.Tournament{}, domain.ErrNotFound
	}

	switch kind {
	case domain.FileKindRegulations:
		r.tournament.RegulationsFile = file
		r.tournament.RegulationsURL = ""
	case domain.FileKindEmblem:
		r.tournament.EmblemFile = file
		r.tournament.EmblemURL = ""
	default:
		return domain.Tournament{}, domain.ErrInvalidInput
	}
	r.tournament.UpdatedAt = time.Now().UTC()
	return cloneTournament(r.tournament), nil
}

// ClearFile обнуляет файл для kind, не трогая ссылку.
func (r *FakeRepo) ClearFile(_ context.Context, kind domain.FileKind) (domain.Tournament, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if !r.hasActive {
		return domain.Tournament{}, domain.ErrNotFound
	}

	switch kind {
	case domain.FileKindRegulations:
		r.tournament.RegulationsFile = domain.StoredFile{}
	case domain.FileKindEmblem:
		r.tournament.EmblemFile = domain.StoredFile{}
	default:
		return domain.Tournament{}, domain.ErrInvalidInput
	}
	r.tournament.UpdatedAt = time.Now().UTC()
	return cloneTournament(r.tournament), nil
}

func cloneTournament(t domain.Tournament) domain.Tournament {
	out := t
	if len(t.Contacts) > 0 {
		out.Contacts = append([]domain.Contact(nil), t.Contacts...)
	}
	if len(t.Program) > 0 {
		program := make([]domain.ProgramDay, len(t.Program))
		for i, d := range t.Program {
			program[i] = domain.ProgramDay{Date: d.Date}
			if len(d.Items) > 0 {
				program[i].Items = append([]domain.ProgramItem(nil), d.Items...)
			}
		}
		out.Program = program
	}
	return out
}
