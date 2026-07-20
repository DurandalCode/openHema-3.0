-- name: GetPoolLayout :one
SELECT nomination_id, status, undo_kind, undo_data
FROM pool.pool_layouts
WHERE nomination_id = $1;

-- name: ListPoolsByNomination :many
SELECT id, nomination_id, number, arena_id
FROM pool.pools
WHERE nomination_id = $1
ORDER BY number;

-- name: ListMembersByNomination :many
SELECT pool_id, fighter_id
FROM pool.pool_members
WHERE nomination_id = $1;

-- name: GetPoolByID :one
SELECT id, nomination_id, number, arena_id
FROM pool.pools
WHERE id = $1;

-- name: ListMembersByPool :many
SELECT fighter_id
FROM pool.pool_members
WHERE pool_id = $1;

-- name: InsertPool :one
INSERT INTO pool.pools (nomination_id, number)
VALUES ($1, $2)
RETURNING id, nomination_id, number;

-- name: DeletePoolByID :exec
DELETE FROM pool.pools WHERE id = $1;

-- name: DeleteAllPoolsByNomination :exec
DELETE FROM pool.pools WHERE nomination_id = $1;

-- name: InsertMember :exec
INSERT INTO pool.pool_members (pool_id, nomination_id, fighter_id)
VALUES ($1, $2, $3);

-- name: DeleteMemberByFighter :exec
DELETE FROM pool.pool_members WHERE nomination_id = $1 AND fighter_id = $2;

-- name: DeleteMembersByFighterIDs :exec
DELETE FROM pool.pool_members
WHERE nomination_id = $1 AND fighter_id = ANY(sqlc.arg(fighter_ids)::uuid[]);

-- name: PruneMembers :exec
DELETE FROM pool.pool_members
WHERE nomination_id = $1 AND fighter_id <> ALL(sqlc.arg(active_fighter_ids)::uuid[]);

-- name: SetLayoutStatus :exec
INSERT INTO pool.pool_layouts (nomination_id, status, undo_kind, undo_data)
VALUES ($1, $2, '', '{}'::jsonb)
ON CONFLICT (nomination_id) DO UPDATE
SET status = EXCLUDED.status, undo_kind = '', undo_data = '{}'::jsonb, updated_at = now();

-- name: EnsureLayoutAndClearUndo :exec
INSERT INTO pool.pool_layouts (nomination_id, status, undo_kind, undo_data)
VALUES ($1, 'draft', '', '{}'::jsonb)
ON CONFLICT (nomination_id) DO UPDATE
SET undo_kind = '', undo_data = '{}'::jsonb, updated_at = now();

-- name: SetLayoutUndo :exec
INSERT INTO pool.pool_layouts (nomination_id, status, undo_kind, undo_data)
VALUES ($1, 'draft', $2, $3)
ON CONFLICT (nomination_id) DO UPDATE
SET undo_kind = EXCLUDED.undo_kind, undo_data = EXCLUDED.undo_data, updated_at = now();

-- Спека 0011: постановка пула на арену.

-- name: SeatPool :one
-- Закрепляет пул за площадкой. Уникальность arena_id (partial unique index
-- uq_pools_arena) отклонит гонку параллельной постановки на ту же арену —
-- repo мапит нарушение констрейнта в domain.ErrArenaBusy (FR-6, NFR-4).
UPDATE pool.pools SET arena_id = $2, updated_at = now()
WHERE id = $1
RETURNING id;

-- name: UnseatPool :exec
-- Снимает пул с площадки (идемпотентно — пул без арены просто не меняется).
UPDATE pool.pools SET arena_id = NULL, updated_at = now()
WHERE id = $1;

-- name: GetPoolByArena :one
-- Пул, стоящий на арене (не более одного, инвариант uq_pools_arena).
SELECT id, nomination_id, number, arena_id
FROM pool.pools
WHERE arena_id = $1;

-- name: ListReadyUnseatedPools :many
-- Пулы в статусе «готов» (раскладка ready), ещё не поставленные ни на одну
-- арену — кандидаты для постановки на странице арены (FR-9).
SELECT p.id, p.nomination_id, p.number, p.arena_id
FROM pool.pools p
JOIN pool.pool_layouts l ON l.nomination_id = p.nomination_id
WHERE l.status = 'ready' AND p.arena_id IS NULL
ORDER BY p.nomination_id, p.number;

-- name: ExistsSeatedInNomination :one
-- Стоит ли хотя бы один пул номинации на арене (гейт FR-3: расфиксация
-- раскладки запрещена, пока пул на арене).
SELECT EXISTS (
    SELECT 1 FROM pool.pools WHERE nomination_id = $1 AND arena_id IS NOT NULL
);
