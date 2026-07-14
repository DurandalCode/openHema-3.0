-- name: GetPoolLayout :one
SELECT nomination_id, status, undo_kind, undo_data
FROM pool.pool_layouts
WHERE nomination_id = $1;

-- name: ListPoolsByNomination :many
SELECT id, nomination_id, number
FROM pool.pools
WHERE nomination_id = $1
ORDER BY number;

-- name: ListMembersByNomination :many
SELECT pool_id, fighter_id
FROM pool.pool_members
WHERE nomination_id = $1;

-- name: GetPoolByID :one
SELECT id, nomination_id, number
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
