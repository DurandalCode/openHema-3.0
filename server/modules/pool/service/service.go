// Package service содержит бизнес-логику модуля pool (юзкейсы, спека 0009).
package service

import (
	"context"
	"strings"

	"github.com/hema/server/modules/pool/domain"
)

// Service реализует юзкейсы раскладки бойцов по пулам. Зависит от портов,
// не от pg/proto.
type Service struct {
	repo     domain.Repository
	fighters domain.ActiveFightersProvider
}

// New создаёт сервис pool.
func New(repo domain.Repository, fighters domain.ActiveFightersProvider) *Service {
	return &Service{repo: repo, fighters: fighters}
}

// GetLayout возвращает раскладку номинации (lazy-init + реконсиляция с
// активным ростером fighter, FR-12/FR-14/FR-15).
func (s *Service) GetLayout(ctx context.Context, nominationID string) (domain.Layout, error) {
	nominationID = strings.TrimSpace(nominationID)
	if nominationID == "" {
		return domain.Layout{}, domain.ErrInvalidInput
	}
	return s.loadLayout(ctx, nominationID)
}

// CreatePool создаёт пул с наименьшим свободным номером (FR-3). Только в
// draft.
func (s *Service) CreatePool(ctx context.Context, nominationID string) (domain.Layout, error) {
	nominationID = strings.TrimSpace(nominationID)
	if nominationID == "" {
		return domain.Layout{}, domain.ErrInvalidInput
	}
	status, _, pools, err := s.repo.GetLayout(ctx, nominationID)
	if err != nil {
		return domain.Layout{}, err
	}
	if status != domain.LayoutDraft {
		return domain.Layout{}, domain.ErrNotDraft
	}
	numbers := make([]int, len(pools))
	for i, p := range pools {
		numbers[i] = p.Number
	}
	if _, err := s.repo.CreatePool(ctx, nominationID, domain.NextPoolNumber(numbers)); err != nil {
		return domain.Layout{}, err
	}
	return s.loadLayout(ctx, nominationID)
}

// DeletePool удаляет пул; его бойцы возвращаются в нераспределённые (FR-4).
// Undoable. Только в draft.
func (s *Service) DeletePool(ctx context.Context, poolID string) (domain.Layout, error) {
	poolID = strings.TrimSpace(poolID)
	if poolID == "" {
		return domain.Layout{}, domain.ErrInvalidInput
	}
	pool, err := s.repo.GetPool(ctx, poolID)
	if err != nil {
		return domain.Layout{}, err
	}
	if err := s.requireDraft(ctx, pool.NominationID); err != nil {
		return domain.Layout{}, err
	}
	if err := s.repo.DeletePool(ctx, poolID); err != nil {
		return domain.Layout{}, err
	}
	return s.loadLayout(ctx, pool.NominationID)
}

// ResetLayout удаляет все пулы номинации и возвращает всех бойцов в
// нераспределённые (FR-4a). Записывает undo-снапшот всех пулов с их членствами
// (undoable — FR-7a). Только в draft. Если пулов нет — no-op (без undo).
func (s *Service) ResetLayout(ctx context.Context, nominationID string) (domain.Layout, error) {
	nominationID = strings.TrimSpace(nominationID)
	if nominationID == "" {
		return domain.Layout{}, domain.ErrInvalidInput
	}
	layout, err := s.loadLayout(ctx, nominationID)
	if err != nil {
		return domain.Layout{}, err
	}
	if layout.Status != domain.LayoutDraft {
		return domain.Layout{}, domain.ErrNotDraft
	}
	if len(layout.Pools) == 0 {
		return layout, nil // no-op: пулов нет — нечего сбрасывать, undo не пишется
	}
	if err := s.repo.ResetLayout(ctx, nominationID); err != nil {
		return domain.Layout{}, err
	}
	return s.loadLayout(ctx, nominationID)
}

// AssignFighter кладёт бойца в пул: из нераспределённых либо из другого
// пула (move одним действием, FR-5). Только в draft.
func (s *Service) AssignFighter(ctx context.Context, nominationID, fighterID, poolID string) (domain.Layout, error) {
	nominationID = strings.TrimSpace(nominationID)
	fighterID = strings.TrimSpace(fighterID)
	poolID = strings.TrimSpace(poolID)
	if nominationID == "" || fighterID == "" || poolID == "" {
		return domain.Layout{}, domain.ErrInvalidInput
	}
	if err := s.requireDraft(ctx, nominationID); err != nil {
		return domain.Layout{}, err
	}
	if err := s.repo.AssignFighter(ctx, nominationID, fighterID, poolID); err != nil {
		return domain.Layout{}, err
	}
	return s.loadLayout(ctx, nominationID)
}

// UnassignFighter возвращает бойца из пула в нераспределённые (FR-5).
// Только в draft.
func (s *Service) UnassignFighter(ctx context.Context, nominationID, fighterID string) (domain.Layout, error) {
	nominationID = strings.TrimSpace(nominationID)
	fighterID = strings.TrimSpace(fighterID)
	if nominationID == "" || fighterID == "" {
		return domain.Layout{}, domain.ErrInvalidInput
	}
	if err := s.requireDraft(ctx, nominationID); err != nil {
		return domain.Layout{}, err
	}
	if err := s.repo.UnassignFighter(ctx, nominationID, fighterID); err != nil {
		return domain.Layout{}, err
	}
	return s.loadLayout(ctx, nominationID)
}

// AutoDistribute раскладывает нераспределённых бойцов по существующим
// пулам, минимизируя одноклубников (FR-6/FR-7). Уже расставленные бойцы не
// трогаются. Undoable. Только в draft.
func (s *Service) AutoDistribute(ctx context.Context, nominationID string) (domain.Layout, error) {
	nominationID = strings.TrimSpace(nominationID)
	if nominationID == "" {
		return domain.Layout{}, domain.ErrInvalidInput
	}
	layout, err := s.loadLayout(ctx, nominationID)
	if err != nil {
		return domain.Layout{}, err
	}
	if layout.Status != domain.LayoutDraft {
		return domain.Layout{}, domain.ErrNotDraft
	}
	if len(layout.Pools) == 0 {
		return domain.Layout{}, domain.ErrNoPools
	}
	if len(layout.Unassigned) == 0 {
		return layout, nil // AC-9: no-op, состояние не меняется
	}
	assignments := domain.AutoDistribute(layout.Pools, layout.Unassigned)
	if err := s.repo.ApplyAutoDistribute(ctx, nominationID, assignments); err != nil {
		return domain.Layout{}, err
	}
	return s.loadLayout(ctx, nominationID)
}

// Undo откатывает последнее mutating-действие среди трёх классов:
// автораспределение, удаление пула или сброс раскладки (FR-7a). Только в draft.
func (s *Service) Undo(ctx context.Context, nominationID string) (domain.Layout, error) {
	nominationID = strings.TrimSpace(nominationID)
	if nominationID == "" {
		return domain.Layout{}, domain.ErrInvalidInput
	}
	status, undo, _, err := s.repo.GetLayout(ctx, nominationID)
	if err != nil {
		return domain.Layout{}, err
	}
	if status != domain.LayoutDraft {
		return domain.Layout{}, domain.ErrNotDraft
	}
	switch undo.Kind {
	case domain.UndoAuto:
		if err := s.repo.UndoAuto(ctx, nominationID, undo.FighterIDs); err != nil {
			return domain.Layout{}, err
		}
	case domain.UndoDeletePool:
		if err := s.repo.UndoDeletePool(ctx, nominationID, undo.PoolNumber, undo.FighterIDs); err != nil {
			return domain.Layout{}, err
		}
	case domain.UndoReset:
		if err := s.repo.UndoReset(ctx, nominationID, undo.Pools); err != nil {
			return domain.Layout{}, err
		}
	default:
		return domain.Layout{}, domain.ErrNothingToUndo
	}
	return s.loadLayout(ctx, nominationID)
}

// SetStatus переключает статус раскладки draft↔ready (FR-9). Другие целевые
// статусы отклоняются — переходы в active/finished не реализованы.
func (s *Service) SetStatus(ctx context.Context, nominationID string, status domain.LayoutStatus) (domain.Layout, error) {
	nominationID = strings.TrimSpace(nominationID)
	if nominationID == "" {
		return domain.Layout{}, domain.ErrInvalidInput
	}
	if status != domain.LayoutDraft && status != domain.LayoutReady {
		return domain.Layout{}, domain.ErrInvalidInput
	}
	if err := s.repo.SetStatus(ctx, nominationID, status); err != nil {
		return domain.Layout{}, err
	}
	return s.loadLayout(ctx, nominationID)
}

// requireDraft проверяет, что раскладка номинации в статусе draft
// (FR-10/FR-11), не загружая пулы целиком.
func (s *Service) requireDraft(ctx context.Context, nominationID string) error {
	status, _, _, err := s.repo.GetLayout(ctx, nominationID)
	if err != nil {
		return err
	}
	if status != domain.LayoutDraft {
		return domain.ErrNotDraft
	}
	return nil
}

// loadLayout собирает Layout: обогащает сырые членства пулов данными из
// ActiveFightersProvider (имя/клуб), скрывает выведенных/снятых бойцов
// (FR-12), в draft — лениво удаляет их осиротевшие членства (FR-15; в ready
// раскладка фиксирована — только read-only фильтрация, без записи).
func (s *Service) loadLayout(ctx context.Context, nominationID string) (domain.Layout, error) {
	status, undo, rawPools, err := s.repo.GetLayout(ctx, nominationID)
	if err != nil {
		return domain.Layout{}, err
	}
	active, err := s.fighters.ActiveFightersByNomination(ctx, nominationID)
	if err != nil {
		return domain.Layout{}, err
	}
	activeByID := make(map[string]domain.FighterRef, len(active))
	activeIDs := make([]string, len(active))
	for i, f := range active {
		activeByID[f.ID] = f
		activeIDs[i] = f.ID
	}

	pooled := make(map[string]bool)
	orphaned := false
	pools := make([]domain.Pool, 0, len(rawPools))
	for _, p := range rawPools {
		enriched := domain.Pool{ID: p.ID, NominationID: p.NominationID, Number: p.Number}
		for _, m := range p.Members {
			if ref, ok := activeByID[m.ID]; ok {
				enriched.Members = append(enriched.Members, ref)
				pooled[ref.ID] = true
			} else {
				orphaned = true
			}
		}
		pools = append(pools, enriched)
	}

	if status == domain.LayoutDraft && orphaned {
		if err := s.repo.PruneMembers(ctx, nominationID, activeIDs); err != nil {
			return domain.Layout{}, err
		}
	}

	unassigned := make([]domain.FighterRef, 0, len(active))
	for _, f := range active {
		if !pooled[f.ID] {
			unassigned = append(unassigned, f)
		}
	}

	return domain.Layout{
		NominationID: nominationID,
		Status:       status,
		Unassigned:   unassigned,
		Pools:        pools,
		CanUndo:      undo.Kind != domain.UndoNone,
	}, nil
}
