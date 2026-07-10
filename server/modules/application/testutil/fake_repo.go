// Package testutil содержит test doubles (fake-реализации портов) модуля
// application. Используется юнит-тестами service и e2e-тестами api-хендлеров.
package testutil

import (
	"context"
	"sort"
	"sync"

	"github.com/hema/server/modules/application/domain"
)

// activeKey — ключ инварианта «нет активного дубля»: (заявитель, номинация).
type activeKey struct {
	userID       string
	nominationID string
}

// FakeRepo — in-memory реализация domain.Repository: журнал событий + проекция.
// Воспроизводит оптимистичную конкуренцию по версии потока и partial-unique
// семантику активного дубля. Потокобезопасна (мьютекс). Не сохраняет данные
// между запусками.
type FakeRepo struct {
	mu      sync.Mutex
	streams map[string][]domain.Event
	views   map[string]domain.ApplicationView
	active  map[activeKey]string // -> appID
}

// NewFakeRepo создаёт пустой fake-репозиторий.
func NewFakeRepo() *FakeRepo {
	return &FakeRepo{
		streams: make(map[string][]domain.Event),
		views:   make(map[string]domain.ApplicationView),
		active:  make(map[activeKey]string),
	}
}

var _ domain.Repository = (*FakeRepo)(nil)

// Load возвращает поток событий заявки по версии.
func (r *FakeRepo) Load(_ context.Context, appID string) ([]domain.Event, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	events, ok := r.streams[appID]
	if !ok || len(events) == 0 {
		return nil, domain.ErrNotFound
	}
	out := make([]domain.Event, len(events))
	copy(out, events)
	return out, nil
}

// Append атомарно вставляет событие с version = expectedVersion+1 и обновляет
// проекцию. Конфликт версии → ErrConcurrency; нарушение инварианта активного
// дубля на новом потоке → ErrDuplicateActive.
func (r *FakeRepo) Append(_ context.Context, appID string, expectedVersion int, ev domain.Event, view domain.ApplicationView) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	current := r.streams[appID]
	if len(current) != expectedVersion {
		return domain.ErrConcurrency
	}

	key := activeKey{userID: view.ApplicantUserID, nominationID: view.NominationID}
	if expectedVersion == 0 {
		if existing, ok := r.active[key]; ok && existing != appID {
			return domain.ErrDuplicateActive
		}
	}

	r.streams[appID] = append(current, ev)
	r.views[appID] = view

	if view.State.IsActive() {
		r.active[key] = appID
	} else if r.active[key] == appID {
		delete(r.active, key)
	}
	return nil
}

// ActiveExists — быстрая предпроверка активного дубля перед Submit.
func (r *FakeRepo) ActiveExists(_ context.Context, userID, nominationID string) (bool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	_, ok := r.active[activeKey{userID: userID, nominationID: nominationID}]
	return ok, nil
}

// ListByApplicant возвращает заявки пользователя, отсортированные по id
// (детерминированность тестов).
func (r *FakeRepo) ListByApplicant(_ context.Context, userID string) ([]domain.ApplicationView, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	var out []domain.ApplicationView
	for _, v := range r.views {
		if v.ApplicantUserID == userID {
			out = append(out, v)
		}
	}
	sortViews(out)
	return out, nil
}

// ListByNomination возвращает все заявки номинации.
func (r *FakeRepo) ListByNomination(_ context.Context, nominationID string) ([]domain.ApplicationView, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	var out []domain.ApplicationView
	for _, v := range r.views {
		if v.NominationID == nominationID {
			out = append(out, v)
		}
	}
	sortViews(out)
	return out, nil
}

// ListByTournament — сводный экран с опциональными фильтрами по статусу и/или
// номинации.
func (r *FakeRepo) ListByTournament(_ context.Context, tournamentID string, status *domain.State, nominationID *string) ([]domain.ApplicationView, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	var out []domain.ApplicationView
	for _, v := range r.views {
		if v.TournamentID != tournamentID {
			continue
		}
		if status != nil && v.State != *status {
			continue
		}
		if nominationID != nil && v.NominationID != *nominationID {
			continue
		}
		out = append(out, v)
	}
	sortViews(out)
	return out, nil
}

// ParticipantsByNomination возвращает неотозванные заявки номинации.
func (r *FakeRepo) ParticipantsByNomination(_ context.Context, nominationID string) ([]domain.ApplicationView, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	var out []domain.ApplicationView
	for _, v := range r.views {
		if v.NominationID == nominationID && v.State != domain.StateWithdrawn {
			out = append(out, v)
		}
	}
	sortViews(out)
	return out, nil
}

// CountRegistered возвращает число зарегистрированных заявок номинации.
func (r *FakeRepo) CountRegistered(_ context.Context, nominationID string) (int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	n := 0
	for _, v := range r.views {
		if v.NominationID == nominationID && v.State == domain.StateRegistered {
			n++
		}
	}
	return n, nil
}

// CountsByNomination возвращает «заявлено» (неотозванные) и «подтверждено»
// (оплачена + зарегистрирована).
func (r *FakeRepo) CountsByNomination(_ context.Context, nominationID string) (int, int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	applied, confirmed := 0, 0
	for _, v := range r.views {
		if v.NominationID != nominationID {
			continue
		}
		if v.State != domain.StateWithdrawn {
			applied++
		}
		if v.State == domain.StatePaid || v.State == domain.StateRegistered {
			confirmed++
		}
	}
	return applied, confirmed, nil
}

func sortViews(views []domain.ApplicationView) {
	sort.Slice(views, func(i, j int) bool { return views[i].ID < views[j].ID })
}
