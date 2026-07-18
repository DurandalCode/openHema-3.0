-- name: DeleteBoutsByNomination :exec
DELETE FROM bout.bouts WHERE nomination_id = $1;

-- name: InsertBout :one
INSERT INTO bout.bouts (
    pool_id, nomination_id, round_number, sequence_number,
    fighter_a_id, fighter_a_name, fighter_a_club,
    fighter_b_id, fighter_b_name, fighter_b_club
) VALUES (
    $1, $2, $3, $4,
    $5, $6, $7,
    $8, $9, $10
)
RETURNING id, pool_id, nomination_id, round_number, sequence_number,
    fighter_a_id, fighter_a_name, fighter_a_club,
    fighter_b_id, fighter_b_name, fighter_b_club;

-- name: ListBoutsByNomination :many
SELECT id, pool_id, nomination_id, round_number, sequence_number,
    fighter_a_id, fighter_a_name, fighter_a_club,
    fighter_b_id, fighter_b_name, fighter_b_club
FROM bout.bouts
WHERE nomination_id = $1
ORDER BY pool_id, sequence_number;
