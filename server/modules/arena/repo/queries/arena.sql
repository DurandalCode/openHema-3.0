-- name: ListArenasByTournament :many
SELECT id, tournament_id, name, description, position, status, created_at, updated_at
FROM arena.arenas
WHERE tournament_id = $1
ORDER BY position ASC;

-- name: GetArena :one
SELECT id, tournament_id, name, description, position, status, created_at, updated_at
FROM arena.arenas
WHERE id = $1;

-- name: MaxPosition :one
SELECT COALESCE(MAX(position), -1)::integer AS max_position
FROM arena.arenas
WHERE tournament_id = $1;

-- name: CreateArena :one
INSERT INTO arena.arenas (tournament_id, name, description, position)
VALUES ($1, $2, $3, $4)
RETURNING id, tournament_id, name, description, position, status, created_at, updated_at;

-- name: UpdateArena :one
UPDATE arena.arenas
SET
    name        = $2,
    description = $3,
    updated_at  = now()
WHERE id = $1
RETURNING id, tournament_id, name, description, position, status, created_at, updated_at;

-- name: SetArenaStatus :one
UPDATE arena.arenas
SET status = $2, updated_at = now()
WHERE id = $1
RETURNING id, tournament_id, name, description, position, status, created_at, updated_at;

-- name: SetArenaPosition :execrows
UPDATE arena.arenas
SET position = $2, updated_at = now()
WHERE id = $1;