// Спека 0063: очередь пулов на арену — упорядоченный план, переход к
// следующему пулу только явным действием секретаря (FR-8). Очередь не
// меняет пул и бои: хранит лишь «кто за кем».
package service

import (
	"context"
	"strings"

	"github.com/hema/server/modules/stage/domain"
)

// EnqueuePool добавляет пул в конец очереди арены (FR-3/FR-4); пул из очереди
// другой арены переносится (FR-5). Очередь можно составлять независимо от
// занятости арены (FR-7). Отклоняется: пул не найден (ErrNotFound); пул стоит
// на арене (ErrAlreadySeated, FR-2); раскладка его этапа не ready
// (ErrNotReady, FR-3); арена не найдена или архивна (ErrArenaNotAvailable).
// Возвращает очередь целевой арены в том же виде, что GetPoolsForArena.
func (s *Service) EnqueuePool(ctx context.Context, poolID, arenaID string) (domain.ArenaPools, error) {
	poolID = strings.TrimSpace(poolID)
	arenaID = strings.TrimSpace(arenaID)
	if poolID == "" || arenaID == "" {
		return domain.ArenaPools{}, domain.ErrInvalidInput
	}

	pool, err := s.repo.GetPool(ctx, poolID)
	if err != nil {
		return domain.ArenaPools{}, err
	}
	if pool.ArenaID != "" {
		return domain.ArenaPools{}, domain.ErrAlreadySeated
	}
	stage, found, err := s.repo.StageByID(ctx, pool.StageID)
	if err != nil {
		return domain.ArenaPools{}, err
	}
	if !found || stage.Status != domain.LayoutReady {
		return domain.ArenaPools{}, domain.ErrNotReady
	}
	arena, err := s.arenas.ArenaByID(ctx, arenaID)
	if err != nil || !arena.Active {
		return domain.ArenaPools{}, domain.ErrArenaNotAvailable
	}

	if err := s.repo.EnqueuePool(ctx, poolID, arenaID); err != nil {
		return domain.ArenaPools{}, err
	}
	s.notifyNominationChanged(pool.NominationID)
	return s.GetPoolsForArena(ctx, arenaID)
}

// DequeuePool убирает пул из очереди арены (FR-6). Пул вне очереди —
// ErrNotQueued. Возвращает очередь арены, из которой пул убран.
func (s *Service) DequeuePool(ctx context.Context, poolID string) (domain.ArenaPools, error) {
	poolID = strings.TrimSpace(poolID)
	if poolID == "" {
		return domain.ArenaPools{}, domain.ErrInvalidInput
	}
	pool, err := s.repo.GetPool(ctx, poolID)
	if err != nil {
		return domain.ArenaPools{}, err
	}
	entries, err := s.repo.QueueEntries(ctx, []string{poolID})
	if err != nil {
		return domain.ArenaPools{}, err
	}
	entry, ok := entries[poolID]
	if !ok {
		return domain.ArenaPools{}, domain.ErrNotQueued
	}
	if err := s.repo.DequeuePool(ctx, poolID); err != nil {
		return domain.ArenaPools{}, err
	}
	s.notifyNominationChanged(pool.NominationID)
	return s.GetPoolsForArena(ctx, entry.ArenaID)
}

// ReorderArenaQueue задаёт порядок очереди арены целиком (FR-6). Набор id
// обязан совпасть с текущей очередью, иначе ErrQueueMismatch — защита от
// устаревшего клиента и гонки двух операторов (NFR-3).
func (s *Service) ReorderArenaQueue(ctx context.Context, arenaID string, poolIDs []string) (domain.ArenaPools, error) {
	arenaID = strings.TrimSpace(arenaID)
	if arenaID == "" {
		return domain.ArenaPools{}, domain.ErrInvalidInput
	}
	if err := s.repo.ReorderArenaQueue(ctx, arenaID, poolIDs); err != nil {
		return domain.ArenaPools{}, err
	}
	if err := s.notifyQueueChanged(ctx, arenaID); err != nil {
		return domain.ArenaPools{}, err
	}
	return s.GetPoolsForArena(ctx, arenaID)
}

// SeatNextPool ставит первый пул очереди на арену (FR-9) тем же путём, что
// SeatPoolOnArena (проверки, письма, сигнал табло), и убирает его из очереди.
// Очередь пуста — ErrQueueEmpty. Если голова очереди поставлена быть не может
// (арена занята/архивна и т.п.), возвращается причина отказа, очередь не
// меняется (FR-11).
func (s *Service) SeatNextPool(ctx context.Context, arenaID string) (domain.ArenaPools, error) {
	arenaID = strings.TrimSpace(arenaID)
	if arenaID == "" {
		return domain.ArenaPools{}, domain.ErrInvalidInput
	}
	queue, err := s.repo.ArenaQueue(ctx, arenaID)
	if err != nil {
		return domain.ArenaPools{}, err
	}
	if len(queue) == 0 {
		return domain.ArenaPools{}, domain.ErrQueueEmpty
	}
	if _, err := s.SeatPoolOnArena(ctx, queue[0].ID, arenaID); err != nil {
		return domain.ArenaPools{}, err
	}
	return s.GetPoolsForArena(ctx, arenaID)
}

// notifyQueueChanged публикует в живой канал каждую номинацию, пулы которой
// стоят в очереди арены (порядок очереди виден на экранах этих номинаций).
func (s *Service) notifyQueueChanged(ctx context.Context, arenaID string) error {
	queue, err := s.repo.ArenaQueue(ctx, arenaID)
	if err != nil {
		return err
	}
	seen := make(map[string]bool, len(queue))
	for _, p := range queue {
		if seen[p.NominationID] {
			continue
		}
		seen[p.NominationID] = true
		s.notifyNominationChanged(p.NominationID)
	}
	return nil
}

// applyQueue заполняет QueueArenaID/QueueArenaName/QueuePosition пулов по
// записям очереди (один запрос на список, NFR-2); имена арен резолвятся live
// через ArenaProvider, как ArenaName. Пулы вне очередей не меняются.
func (s *Service) applyQueue(ctx context.Context, pools []domain.Pool) error {
	if len(pools) == 0 {
		return nil
	}
	poolIDs := make([]string, 0, len(pools))
	for _, p := range pools {
		if p.ID != "" {
			poolIDs = append(poolIDs, p.ID)
		}
	}
	entries, err := s.repo.QueueEntries(ctx, poolIDs)
	if err != nil {
		return err
	}
	if len(entries) == 0 {
		return nil
	}
	arenaIDs := make([]string, 0, len(entries))
	seen := make(map[string]bool, len(entries))
	for _, e := range entries {
		if !seen[e.ArenaID] {
			seen[e.ArenaID] = true
			arenaIDs = append(arenaIDs, e.ArenaID)
		}
	}
	names, err := s.arenas.ArenasByIDs(ctx, arenaIDs)
	if err != nil {
		return err
	}
	for i := range pools {
		e, ok := entries[pools[i].ID]
		if !ok {
			continue
		}
		pools[i].QueueArenaID = e.ArenaID
		pools[i].QueueArenaName = names[e.ArenaID].Name
		pools[i].QueuePosition = e.Position
	}
	return nil
}

// hideArchivedQueues убирает очередь из публичной проекции пулов, если арена
// очереди архивна или недоступна (FR-13: очередь архивной арены публично не
// видна). Вызывается только на публичных путях (ListPublicPools/
// NominationLive); admin-пути сохраняют пометку «в очереди: Арена N».
func (s *Service) hideArchivedQueues(ctx context.Context, pools []domain.Pool) error {
	arenaIDs := make([]string, 0)
	seen := make(map[string]bool)
	for _, p := range pools {
		if p.QueueArenaID != "" && !seen[p.QueueArenaID] {
			seen[p.QueueArenaID] = true
			arenaIDs = append(arenaIDs, p.QueueArenaID)
		}
	}
	if len(arenaIDs) == 0 {
		return nil
	}
	arenas, err := s.arenas.ArenasByIDs(ctx, arenaIDs)
	if err != nil {
		return err
	}
	for i := range pools {
		if pools[i].QueueArenaID == "" {
			continue
		}
		if a, ok := arenas[pools[i].QueueArenaID]; !ok || !a.Active {
			pools[i].QueueArenaID = ""
			pools[i].QueueArenaName = ""
			pools[i].QueuePosition = 0
		}
	}
	return nil
}
