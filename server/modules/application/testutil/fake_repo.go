// Package testutil содержит test doubles (fake-реализации портов) модуля
// application. Используется юнит-тестами service и e2e-тестами api-хендлеров.
package testutil

import (
	"context"
	"sort"
	"strings"
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
// дубля → ErrDuplicateActive. Проверка дубля не привязана к новому потоку
// (expectedVersion==0): админская правка (перенос номинации, ручная смена
// статуса, спека 0006) может сделать активной уже существующую заявку — и
// должна ловить тот же дубль, что и обычная Submit (моделирует partial
// unique index в реальной БД, который действует на каждый UPSERT проекции).
func (r *FakeRepo) Append(_ context.Context, appID string, expectedVersion int, ev domain.Event, view domain.ApplicationView) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	current := r.streams[appID]
	if len(current) != expectedVersion {
		return domain.ErrConcurrency
	}

	key := activeKey{userID: view.ApplicantUserID, nominationID: view.NominationID}
	if view.State.IsActive() {
		if existing, ok := r.active[key]; ok && existing != appID {
			return domain.ErrDuplicateActive
		}
	}

	r.streams[appID] = append(current, ev)
	r.views[appID] = view

	// Заявка могла сменить (user, nomination) при переносе в другую номинацию
	// (EditApplication, спека 0006) — старый ключ инварианта для этой заявки
	// больше не актуален и должен быть снят, иначе дубль-проверка ложно
	// заблокирует новую подачу в старую номинацию.
	for k, id := range r.active {
		if id == appID && k != key {
			delete(r.active, k)
		}
	}

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

// ListByTournament — сводный экран заявок турнира: статус/номинация/
// экипировка + Limit/Offset «в памяти», как SQL-путь ListByTournament у
// реального репозитория (используется, когда f.Search пуст). total — число
// заявок, подходящих под фильтр без учёта Limit/Offset (FR-5).
func (r *FakeRepo) ListByTournament(_ context.Context, tournamentID string, f domain.ListFilter) ([]domain.ApplicationView, int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	var matched []domain.ApplicationView
	for _, v := range r.views {
		if !matchesTournamentFilter(v, tournamentID, f) {
			continue
		}
		matched = append(matched, v)
	}
	sortViews(matched)
	total := len(matched)
	return paginateViews(matched, f.Limit, f.Offset), total, nil
}

// SearchCandidates возвращает кандидатов для досева по имени в service — все
// заявки турнира, подходящие под статус/номинацию/экипировку, у которых клуб
// или ApplicantNameOverride уже совпадает с search (без учёта регистра), ЛИБО
// override пуст (имя ещё не известно на этом уровне, резолвится из auth —
// строка обязана остаться кандидатом, иначе service не сможет её досеять по
// резолвленному имени). Без Limit/Offset — та же семантика, что у реального
// SQL-запроса SearchCandidatesByTournament (см. repo/repo.go).
func (r *FakeRepo) SearchCandidates(_ context.Context, tournamentID string, f domain.ListFilter) ([]domain.ApplicationView, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	search := ""
	if f.Search != nil {
		search = strings.ToLower(*f.Search)
	}

	var out []domain.ApplicationView
	for _, v := range r.views {
		if !matchesTournamentFilter(v, tournamentID, f) {
			continue
		}
		if v.ApplicantNameOverride == "" ||
			strings.Contains(strings.ToLower(v.Club), search) ||
			strings.Contains(strings.ToLower(v.ApplicantNameOverride), search) {
			out = append(out, v)
		}
	}
	sortViews(out)
	return out, nil
}

// CountByTournamentStatus — счётчик заявок по каждому статусу турнира, не
// зависящий от фильтров/поиска запроса (FR-4, спека 0041).
func (r *FakeRepo) CountByTournamentStatus(_ context.Context, tournamentID string) (map[domain.State]int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	out := make(map[domain.State]int)
	for _, v := range r.views {
		if v.TournamentID != tournamentID {
			continue
		}
		out[v.State]++
	}
	return out, nil
}

// matchesTournamentFilter — статус/номинация/экипировка, общая часть
// ListByTournament и SearchCandidates (поиск по имени/клубу — отдельная
// логика в каждом методе, см. выше).
func matchesTournamentFilter(v domain.ApplicationView, tournamentID string, f domain.ListFilter) bool {
	if v.TournamentID != tournamentID {
		return false
	}
	if len(f.Statuses) > 0 && !containsState(f.Statuses, v.State) {
		return false
	}
	if len(f.NominationIDs) > 0 && !containsString(f.NominationIDs, v.NominationID) {
		return false
	}
	if f.NeedsEquipment != nil && v.NeedsEquipment != *f.NeedsEquipment {
		return false
	}
	return true
}

func containsState(states []domain.State, s domain.State) bool {
	for _, x := range states {
		if x == s {
			return true
		}
	}
	return false
}

func containsString(ss []string, s string) bool {
	for _, x := range ss {
		if x == s {
			return true
		}
	}
	return false
}

// paginateViews режет уже отсортированный срез по Limit/Offset — та же
// семантика, что LIMIT/OFFSET в SQL (никакого «0 = без ограничения»: ровно
// как у ListUsers/admin.proto — сервис не задаёт свой дефолт/потолок сверх
// уже принятого в проекте, Limit=0 буквально означает LIMIT 0 = пустая
// страница; вызывающая сторона отвечает за осмысленный Limit).
func paginateViews(views []domain.ApplicationView, limit, offset int32) []domain.ApplicationView {
	start := int(offset)
	if start < 0 {
		start = 0
	}
	if start >= len(views) || limit <= 0 {
		return nil
	}
	end := start + int(limit)
	if end > len(views) {
		end = len(views)
	}
	out := make([]domain.ApplicationView, end-start)
	copy(out, views[start:end])
	return out
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
