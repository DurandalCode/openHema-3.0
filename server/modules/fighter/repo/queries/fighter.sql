-- name: InsertFighter :one
INSERT INTO fighter.fighters (tournament_id, name, club, origin_user_id, status, withdrawal_reason)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, tournament_id, name, club, origin_user_id, status, withdrawal_reason, created_at, updated_at;

-- name: GetFighterByID :one
SELECT id, tournament_id, name, club, origin_user_id, status, withdrawal_reason, created_at, updated_at
FROM fighter.fighters
WHERE id = $1;

-- name: FindFighterByOrigin :one
SELECT id, tournament_id, name, club, origin_user_id, status, withdrawal_reason, created_at, updated_at
FROM fighter.fighters
WHERE tournament_id = $1 AND origin_user_id = $2;

-- name: ListFightersByTournament :many
SELECT id, tournament_id, name, club, origin_user_id, status, withdrawal_reason, created_at, updated_at
FROM fighter.fighters
WHERE tournament_id = $1
ORDER BY created_at;

-- name: UpdateFighter :one
UPDATE fighter.fighters
SET name = $2,
    club = $3,
    status = $4,
    withdrawal_reason = $5,
    updated_at = now()
WHERE id = $1
RETURNING id, tournament_id, name, club, origin_user_id, status, withdrawal_reason, created_at, updated_at;

-- name: UpsertParticipation :exec
INSERT INTO fighter.participations (fighter_id, nomination_id, status)
VALUES ($1, $2, $3)
ON CONFLICT ON CONSTRAINT uq_participations_fighter_nomination
DO UPDATE SET status = EXCLUDED.status, updated_at = now();

-- name: ListParticipationsByFighter :many
SELECT id, fighter_id, nomination_id, status, created_at, updated_at
FROM fighter.participations
WHERE fighter_id = $1
ORDER BY created_at;

-- name: ListParticipationsByFighterIDs :many
SELECT id, fighter_id, nomination_id, status, created_at, updated_at
FROM fighter.participations
WHERE fighter_id = ANY(sqlc.arg(fighter_ids)::uuid[])
ORDER BY created_at;

-- name: RosterByNomination :many
SELECT f.name, f.club, f.status AS fighter_status, p.status AS participation_status
FROM fighter.participations p
JOIN fighter.fighters f ON f.id = p.fighter_id
WHERE p.nomination_id = $1
ORDER BY f.name;

-- name: ActiveFightersByNomination :many
SELECT f.id, f.name, f.club
FROM fighter.participations p
JOIN fighter.fighters f ON f.id = p.fighter_id
WHERE p.nomination_id = $1
  AND f.status = 'active'
  AND p.status = 'active'
ORDER BY f.name;
