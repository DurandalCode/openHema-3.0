// Package testutil содержит test doubles (fake-реализации портов) модуля
// pool. Используется юнит-тестами service и e2e-тестами api-хендлеров.
package testutil

import (
	"context"
	"sort"
	"sync"

	"github.com/google/uuid"

	"github.com/hema/server/modules/pool/domain"
)

type layoutRow struct {
	status domain.LayoutStatus
	undo   domain.UndoState
}

type poolRow struct {
	id           string
	nominationID string
	number       int
	memberIDs    []string
}

// FakeRepo — in-memory реализация domain.Repository для тестов.
// Потокобезопасна (мьютекс). Повторяет ключевые инварианты БД: один боец —
// не более одного пула в номинации (FR-1), lazy-init раскладки (FR-14).
type FakeRepo struct {
	mu      sync.Mutex
	layouts map[string]layoutRow
	pools   map[string]*poolRow
}

// NewFakeRepo создаёт пустой fake-репозиторий.
func NewFakeRepo() *FakeRepo {
	return &FakeRepo{layouts: make(map[string]layoutRow), pools: make(map[string]*poolRow)}
}

var _ domain.Repository = (*FakeRepo)(nil)

// SeedPool — тестовый хелпер: добавляет пул напрямую (в обход
// CreatePool/undo-семантики), возвращает его id.
func (r *FakeRepo) SeedPool(nominationID string, number int, memberIDs ...string) string {
	r.mu.Lock()
	defer r.mu.Unlock()

	id := uuid.NewString()
	r.pools[id] = &poolRow{
		id:           id,
		nominationID: nominationID,
		number:       number,
		memberIDs:    append([]string{}, memberIDs...),
	}
	return id
}

// SeedStatus — тестовый хелпер: задаёт статус раскладки напрямую.
func (r *FakeRepo) SeedStatus(nominationID string, status domain.LayoutStatus) {
	r.mu.Lock()
	defer r.mu.Unlock()

	row := r.layouts[nominationID]
	row.status = status
	r.layouts[nominationID] = row
}

// GetLayout возвращает статус, undo-снапшот и пулы номинации.
func (r *FakeRepo) GetLayout(_ context.Context, nominationID string) (domain.LayoutStatus, domain.UndoState, []domain.Pool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	status := domain.LayoutDraft
	var undo domain.UndoState
	if row, ok := r.layouts[nominationID]; ok {
		status = row.status
		undo = row.undo
	}
	return status, undo, r.listPoolsLocked(nominationID), nil
}

// GetPool возвращает один пул по id.
func (r *FakeRepo) GetPool(_ context.Context, poolID string) (domain.Pool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	p, ok := r.pools[poolID]
	if !ok {
		return domain.Pool{}, domain.ErrNotFound
	}
	return toDomainPool(p), nil
}

// CreatePool вставляет пул, материализует раскладку в draft, очищает undo.
func (r *FakeRepo) CreatePool(_ context.Context, nominationID string, number int) (domain.Pool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	id := uuid.NewString()
	r.pools[id] = &poolRow{id: id, nominationID: nominationID, number: number}
	r.clearUndoLocked(nominationID)
	return domain.Pool{ID: id, NominationID: nominationID, Number: number}, nil
}

// DeletePool удаляет пул и записывает undo-снапшот удалённого пула.
func (r *FakeRepo) DeletePool(_ context.Context, poolID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	p, ok := r.pools[poolID]
	if !ok {
		return domain.ErrNotFound
	}
	fighterIDs := append([]string{}, p.memberIDs...)
	delete(r.pools, poolID)
	r.setUndoLocked(p.nominationID, domain.UndoState{
		Kind: domain.UndoDeletePool, FighterIDs: fighterIDs, PoolNumber: p.number,
	})
	return nil
}

// ResetLayout удаляет все пулы номинации, очищает undo, статус — draft.
func (r *FakeRepo) ResetLayout(_ context.Context, nominationID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	for id, p := range r.pools {
		if p.nominationID == nominationID {
			delete(r.pools, id)
		}
	}
	r.layouts[nominationID] = layoutRow{status: domain.LayoutDraft}
	return nil
}

// AssignFighter кладёт бойца в пул (move, если он уже был в другом пуле).
func (r *FakeRepo) AssignFighter(_ context.Context, nominationID, fighterID, poolID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	target, ok := r.pools[poolID]
	if !ok || target.nominationID != nominationID {
		return domain.ErrNotFound
	}
	for _, p := range r.pools {
		if p.nominationID == nominationID {
			p.memberIDs = removeString(p.memberIDs, fighterID)
		}
	}
	target.memberIDs = append(target.memberIDs, fighterID)
	r.clearUndoLocked(nominationID)
	return nil
}

// UnassignFighter убирает бойца из пула, если он там был (идемпотентно).
func (r *FakeRepo) UnassignFighter(_ context.Context, nominationID, fighterID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, p := range r.pools {
		if p.nominationID == nominationID {
			p.memberIDs = removeString(p.memberIDs, fighterID)
		}
	}
	r.clearUndoLocked(nominationID)
	return nil
}

// ApplyAutoDistribute применяет назначения и записывает undo (kind=auto).
func (r *FakeRepo) ApplyAutoDistribute(_ context.Context, nominationID string, assignments []domain.Assignment) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	fighterIDs := make([]string, 0, len(assignments))
	for _, a := range assignments {
		p, ok := r.pools[a.PoolID]
		if !ok {
			return domain.ErrNotFound
		}
		if !containsString(p.memberIDs, a.FighterID) {
			p.memberIDs = append(p.memberIDs, a.FighterID)
		}
		fighterIDs = append(fighterIDs, a.FighterID)
	}
	r.setUndoLocked(nominationID, domain.UndoState{Kind: domain.UndoAuto, FighterIDs: fighterIDs})
	return nil
}

// UndoAuto возвращает перечисленных бойцов в нераспределённые, очищает undo.
func (r *FakeRepo) UndoAuto(_ context.Context, nominationID string, fighterIDs []string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, p := range r.pools {
		if p.nominationID != nominationID {
			continue
		}
		for _, fid := range fighterIDs {
			p.memberIDs = removeString(p.memberIDs, fid)
		}
	}
	r.clearUndoLocked(nominationID)
	return nil
}

// UndoDeletePool пересоздаёт пул с тем же number и членами, очищает undo.
func (r *FakeRepo) UndoDeletePool(_ context.Context, nominationID string, number int, fighterIDs []string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	id := uuid.NewString()
	r.pools[id] = &poolRow{
		id: id, nominationID: nominationID, number: number,
		memberIDs: append([]string{}, fighterIDs...),
	}
	r.clearUndoLocked(nominationID)
	return nil
}

// PruneMembers удаляет членства бойцов, которых нет среди activeFighterIDs.
// Не трогает undo.
func (r *FakeRepo) PruneMembers(_ context.Context, nominationID string, activeFighterIDs []string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	active := make(map[string]bool, len(activeFighterIDs))
	for _, id := range activeFighterIDs {
		active[id] = true
	}
	for _, p := range r.pools {
		if p.nominationID != nominationID {
			continue
		}
		kept := p.memberIDs[:0]
		for _, fid := range p.memberIDs {
			if active[fid] {
				kept = append(kept, fid)
			}
		}
		p.memberIDs = kept
	}
	return nil
}

// SetStatus задаёт статус раскладки, очищает undo.
func (r *FakeRepo) SetStatus(_ context.Context, nominationID string, status domain.LayoutStatus) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.layouts[nominationID] = layoutRow{status: status}
	return nil
}

func (r *FakeRepo) listPoolsLocked(nominationID string) []domain.Pool {
	out := make([]domain.Pool, 0)
	for _, p := range r.pools {
		if p.nominationID == nominationID {
			out = append(out, toDomainPool(p))
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Number < out[j].Number })
	return out
}

func (r *FakeRepo) clearUndoLocked(nominationID string) {
	row := r.layouts[nominationID]
	row.undo = domain.UndoState{}
	if row.status == "" {
		row.status = domain.LayoutDraft
	}
	r.layouts[nominationID] = row
}

func (r *FakeRepo) setUndoLocked(nominationID string, undo domain.UndoState) {
	row := r.layouts[nominationID]
	row.undo = undo
	if row.status == "" {
		row.status = domain.LayoutDraft
	}
	r.layouts[nominationID] = row
}

func toDomainPool(p *poolRow) domain.Pool {
	members := make([]domain.FighterRef, 0, len(p.memberIDs))
	for _, fid := range p.memberIDs {
		members = append(members, domain.FighterRef{ID: fid})
	}
	return domain.Pool{ID: p.id, NominationID: p.nominationID, Number: p.number, Members: members}
}

func removeString(list []string, s string) []string {
	out := list[:0]
	for _, v := range list {
		if v != s {
			out = append(out, v)
		}
	}
	return out
}

func containsString(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}

