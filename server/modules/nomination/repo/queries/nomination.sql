-- name: ListNominationsByTournament :many
SELECT id, tournament_id, title, description, fighter_capacity, metadata, position, created_at, updated_at
FROM nomination.nominations
WHERE tournament_id = $1
ORDER BY position ASC;

-- name: GetNomination :one
SELECT id, tournament_id, title, description, fighter_capacity, metadata, position, created_at, updated_at
FROM nomination.nominations
WHERE id = $1;

-- name: MaxPosition :one
SELECT COALESCE(MAX(position), -1)::integer AS max_position
FROM nomination.nominations
WHERE tournament_id = $1;

-- name: CreateNomination :one
INSERT INTO nomination.nominations (tournament_id, title, description, fighter_capacity, metadata, position)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, tournament_id, title, description, fighter_capacity, metadata, position, created_at, updated_at;

-- name: UpdateNomination :one
UPDATE nomination.nominations
SET
    title            = $2,
    description      = $3,
    fighter_capacity = $4,
    metadata         = $5,
    updated_at       = now()
WHERE id = $1
RETURNING id, tournament_id, title, description, fighter_capacity, metadata, position, created_at, updated_at;

-- name: DeleteNomination :execrows
DELETE FROM nomination.nominations
WHERE id = $1;

-- name: SetNominationPosition :execrows
UPDATE nomination.nominations
SET position = $2, updated_at = now()
WHERE id = $1;
