-- name: AppendEvent :exec
INSERT INTO application.events (aggregate_id, version, event_type, payload, actor_id, occurred_at)
VALUES ($1, $2, $3, $4, $5, $6);

-- name: UpsertCurrent :exec
INSERT INTO application.application_current
    (application_id, nomination_id, tournament_id, applicant_user_id, state, version, created_at, updated_at,
     club, needs_equipment, applicant_name_override)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
ON CONFLICT (application_id) DO UPDATE SET
    nomination_id            = EXCLUDED.nomination_id,
    tournament_id            = EXCLUDED.tournament_id,
    state                    = EXCLUDED.state,
    version                  = EXCLUDED.version,
    updated_at               = EXCLUDED.updated_at,
    club                     = EXCLUDED.club,
    needs_equipment          = EXCLUDED.needs_equipment,
    applicant_name_override  = EXCLUDED.applicant_name_override;

-- name: LoadStream :many
SELECT aggregate_id, version, event_type, payload, actor_id, occurred_at
FROM application.events
WHERE aggregate_id = $1
ORDER BY version;

-- name: GetCurrent :one
SELECT application_id, nomination_id, tournament_id, applicant_user_id, state, version, created_at, updated_at,
       club, needs_equipment, applicant_name_override
FROM application.application_current
WHERE application_id = $1;

-- name: ExistsActive :one
SELECT EXISTS (
    SELECT 1 FROM application.application_current
    WHERE applicant_user_id = $1
      AND nomination_id = $2
      AND state IN ('submitted', 'awaiting_payment_confirmation', 'paid')
);

-- name: ListByApplicant :many
SELECT application_id, nomination_id, tournament_id, applicant_user_id, state, version, created_at, updated_at,
       club, needs_equipment, applicant_name_override
FROM application.application_current
WHERE applicant_user_id = $1
ORDER BY created_at;

-- name: ListByNomination :many
SELECT application_id, nomination_id, tournament_id, applicant_user_id, state, version, created_at, updated_at,
       club, needs_equipment, applicant_name_override
FROM application.application_current
WHERE nomination_id = $1
ORDER BY created_at;

-- name: ListByTournament :many
SELECT application_id, nomination_id, tournament_id, applicant_user_id, state, version, created_at, updated_at,
       club, needs_equipment, applicant_name_override
FROM application.application_current
WHERE tournament_id = sqlc.arg('tournament_id')
  AND (sqlc.narg('status')::text IS NULL OR state = sqlc.narg('status'))
  AND (sqlc.narg('nomination_id')::uuid IS NULL OR nomination_id = sqlc.narg('nomination_id'))
ORDER BY created_at;

-- name: ParticipantsByNomination :many
SELECT application_id, nomination_id, tournament_id, applicant_user_id, state, version, created_at, updated_at,
       club, needs_equipment, applicant_name_override
FROM application.application_current
WHERE nomination_id = $1
  AND state <> 'withdrawn'
ORDER BY created_at;

-- name: CountRegistered :one
SELECT count(*)::int AS registered
FROM application.application_current
WHERE nomination_id = $1
  AND state = 'registered';

-- name: CountsByNomination :one
SELECT
    count(*) FILTER (WHERE state <> 'withdrawn')::int AS applied,
    count(*) FILTER (WHERE state IN ('paid', 'registered'))::int AS confirmed
FROM application.application_current
WHERE nomination_id = $1;
