// Package testutil содержит test doubles (fake-реализации портов) модуля
// fighter. Используется юнит-тестами service и e2e-тестами api-хендлеров.
package testutil

import (
	"context"
	"sort"
	"strings"
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

// ListByTournament возвращает страницу ростера турнира: бойцов с их
// участиями, отфильтрованных/упорядоченных/нарезанных по filter (спека
// 0041). Сортировка — по CreatedAt (тай-брейк по ID) — тот же порядок, что
// реальный `ORDER BY created_at` в repo/queries/fighter.sql, нужен для
// детерминированного LIMIT/OFFSET в тестах.
func (r *FakeRepo) ListByTournament(_ context.Context, tournamentID string, filter domain.RosterFilter) ([]domain.Fighter, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	out := r.filteredRoster(tournamentID, filter)
	sortFightersByCreatedAt(out)

	if filter.Offset >= int32(len(out)) {
		return []domain.Fighter{}, nil
	}
	end := filter.Offset + filter.Limit
	if end > int32(len(out)) {
		end = int32(len(out))
	}
	return out[filter.Offset:end], nil
}

// CountRoster возвращает число бойцов турнира, подходящих под filter, без
// Limit/Offset (спека 0041, FR-5).
func (r *FakeRepo) CountRoster(_ context.Context, tournamentID string, filter domain.RosterFilter) (int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	return len(r.filteredRoster(tournamentID, filter)), nil
}

// CountRosterByStatus возвращает счётчики бойцов по статусу для всего
// турнира вне зависимости от фильтра/поиска (спека 0041, FR-4).
func (r *FakeRepo) CountRosterByStatus(_ context.Context, tournamentID string) (map[domain.Status]int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	out := make(map[domain.Status]int)
	for _, f := range r.fighters {
		if f.TournamentID != tournamentID {
			continue
		}
		out[f.Status]++
	}
	return out, nil
}

// filteredRoster возвращает бойцов турнира, подходящих под filter (все
// измерения — логическое И, вызывающий блокирует мьютекс сам).
func (r *FakeRepo) filteredRoster(tournamentID string, filter domain.RosterFilter) []domain.Fighter {
	out := make([]domain.Fighter, 0)
	for _, f := range r.fighters {
		if f.TournamentID != tournamentID {
			continue
		}
		if !rosterFilterMatches(f, filter) {
			continue
		}
		out = append(out, f)
	}
	return out
}

// rosterFilterMatches проверяет один RosterFilter (спека 0041, FR-3):
// статус, активное участие в одной из номинаций, клуб (включая
// «без клуба»), подстрока по имени/клубу без учёта регистра. Пустое
// измерение (и IncludeNoClub=false для клуба) — без ограничения.
func rosterFilterMatches(f domain.Fighter, filter domain.RosterFilter) bool {
	if len(filter.Statuses) > 0 {
		match := false
		for _, s := range filter.Statuses {
			if f.Status == s {
				match = true
				break
			}
		}
		if !match {
			return false
		}
	}

	if len(filter.NominationIDs) > 0 {
		match := false
	participations:
		for _, p := range f.Participations {
			if p.Status != domain.ParticipationActive {
				continue
			}
			for _, nomID := range filter.NominationIDs {
				if p.NominationID == nomID {
					match = true
					break participations
				}
			}
		}
		if !match {
			return false
		}
	}

	if len(filter.Clubs) > 0 || filter.IncludeNoClub {
		match := filter.IncludeNoClub && f.Club == ""
		if !match {
			for _, c := range filter.Clubs {
				if f.Club == c {
					match = true
					break
				}
			}
		}
		if !match {
			return false
		}
	}

	if filter.Search != nil {
		q := strings.ToLower(*filter.Search)
		if !strings.Contains(strings.ToLower(f.Name), q) && !strings.Contains(strings.ToLower(f.Club), q) {
			return false
		}
	}

	return true
}

func sortFightersByCreatedAt(fighters []domain.Fighter) {
	sort.Slice(fighters, func(i, j int) bool {
		if fighters[i].CreatedAt.Equal(fighters[j].CreatedAt) {
			return fighters[i].ID < fighters[j].ID
		}
		return fighters[i].CreatedAt.Before(fighters[j].CreatedAt)
	})
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

// MergeParticipations переносит участия source в target (спека 0040,
// FR-10): совпадающие по nomination_id участия target не дублируются —
// имитирует SQL `DELETE ... USING` + `UPDATE fighter_id` реального репо
// (repo/queries/fighter.sql).
func (r *FakeRepo) MergeParticipations(_ context.Context, sourceID, targetID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	source, ok := r.fighters[sourceID]
	if !ok {
		return domain.ErrNotFound
	}
	target, ok := r.fighters[targetID]
	if !ok {
		return domain.ErrNotFound
	}

	existing := make(map[string]bool, len(target.Participations))
	for _, p := range target.Participations {
		existing[p.NominationID] = true
	}
	for _, p := range source.Participations {
		if existing[p.NominationID] {
			continue
		}
		target.Participations = append(target.Participations, p)
	}
	source.Participations = nil

	r.fighters[sourceID] = source
	r.fighters[targetID] = target
	return nil
}

// ClearOriginUserID снимает привязку записи к учётке (FR-10a).
func (r *FakeRepo) ClearOriginUserID(_ context.Context, fighterID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	f, ok := r.fighters[fighterID]
	if !ok {
		return domain.ErrNotFound
	}
	f.OriginUserID = nil
	r.fighters[fighterID] = f
	return nil
}

// SetMerged помечает source объединённым: status=merged,
// merged_into_id=targetID. Обнуляет WithdrawalReason — так же, как это
// делает реальный репо (repo/queries/fighter.sql, SetMerged): status='merged'
// требует пустой withdrawal_reason (chk_fighters_reason_when), иначе
// слияние ранее выведенного бойца нарушило бы констрейнт БД.
func (r *FakeRepo) SetMerged(_ context.Context, sourceID, targetID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	f, ok := r.fighters[sourceID]
	if !ok {
		return domain.ErrNotFound
	}
	f.Status = domain.StatusMerged
	f.MergedIntoID = targetID
	f.WithdrawalReason = domain.ReasonNone
	r.fighters[sourceID] = f
	return nil
}
