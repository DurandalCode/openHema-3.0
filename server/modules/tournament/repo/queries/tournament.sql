-- name: GetActiveTournament :one
SELECT id, title, description, event_start_at, event_end_at, emblem_url, is_active, created_at, updated_at,
       chief_judge, regulations_url, venue_name, venue_address, entry_fee_minor, entry_fee_currency
FROM tournament.tournaments
WHERE is_active = TRUE
LIMIT 1;

-- name: ListContactsByTournament :many
SELECT id, tournament_id, type, value, position
FROM tournament.contacts
WHERE tournament_id = $1
ORDER BY position ASC;

-- name: UpdateActiveTournament :one
UPDATE tournament.tournaments
SET
    title               = $1,
    description         = $2,
    event_start_at      = $3,
    event_end_at        = $4,
    emblem_url          = $5,
    chief_judge         = $6,
    regulations_url     = $7,
    venue_name          = $8,
    venue_address       = $9,
    entry_fee_minor     = $10,
    entry_fee_currency  = $11,
    updated_at          = now()
WHERE is_active = TRUE
RETURNING id, title, description, event_start_at, event_end_at, emblem_url, is_active, created_at, updated_at,
          chief_judge, regulations_url, venue_name, venue_address, entry_fee_minor, entry_fee_currency;

-- name: DeleteContactsByTournament :exec
DELETE FROM tournament.contacts
WHERE tournament_id = $1;

-- name: InsertContact :one
INSERT INTO tournament.contacts (tournament_id, type, value, position)
VALUES ($1, $2, $3, $4)
RETURNING id, tournament_id, type, value, position;