-- name: InsertFighter :one
INSERT INTO fighter.fighters (tournament_id, name, club, origin_user_id, status, withdrawal_reason)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, tournament_id, name, club, origin_user_id, status, withdrawal_reason, created_at, updated_at, merged_into_id;

-- name: GetFighterByID :one
SELECT id, tournament_id, name, club, origin_user_id, status, withdrawal_reason, created_at, updated_at, merged_into_id
FROM fighter.fighters
WHERE id = $1;

-- name: FindFighterByOrigin :one
SELECT id, tournament_id, name, club, origin_user_id, status, withdrawal_reason, created_at, updated_at, merged_into_id
FROM fighter.fighters
WHERE tournament_id = $1 AND origin_user_id = $2;

-- ListRosterByTournament — страница ростера турнира с фильтром/поиском
-- (спека 0041, FR-1..FR-3): статус, активное участие в одной из перечисленных
-- номинаций (JOIN/EXISTS на fighter.participations, статус участия должен
-- быть 'active' — не любое историческое), клуб (точное совпадение,
-- include_no_club отдельно добавляет club=''), подстрока по имени/клубу без
-- учёта регистра (ILIKE). Пустой statuses/nomination_ids/clubs (и
-- include_no_club=false) = без ограничения по этому измерению — семантика
-- "пустой фильтр = всё". LIMIT/OFFSET — постраничность (спека 0041, FR-1).
-- name: ListRosterByTournament :many
SELECT id, tournament_id, name, club, origin_user_id, status, withdrawal_reason, created_at, updated_at, merged_into_id
FROM fighter.fighters f
WHERE f.tournament_id = sqlc.arg(tournament_id)
  AND (
    cardinality(sqlc.arg(statuses)::text[]) = 0
    OR f.status = ANY(sqlc.arg(statuses)::text[])
  )
  AND (
    (cardinality(sqlc.arg(clubs)::text[]) = 0 AND NOT sqlc.arg(include_no_club)::bool)
    OR f.club = ANY(sqlc.arg(clubs)::text[])
    OR (sqlc.arg(include_no_club)::bool AND f.club = '')
  )
  AND (
    cardinality(sqlc.arg(nomination_ids)::uuid[]) = 0
    OR EXISTS (
      SELECT 1 FROM fighter.participations p
      WHERE p.fighter_id = f.id
        AND p.status = 'active'
        AND p.nomination_id = ANY(sqlc.arg(nomination_ids)::uuid[])
    )
  )
  AND (
    sqlc.narg(search)::text IS NULL
    OR f.name ILIKE '%' || sqlc.narg(search)::text || '%'
    OR f.club ILIKE '%' || sqlc.narg(search)::text || '%'
  )
ORDER BY f.created_at
LIMIT sqlc.arg(row_limit) OFFSET sqlc.arg(row_offset);

-- CountRosterByTournament — total_count для постраничной навигации: тот же
-- WHERE, что ListRosterByTournament, без LIMIT/OFFSET (спека 0041, FR-5).
-- name: CountRosterByTournament :one
SELECT count(*) FROM fighter.fighters f
WHERE f.tournament_id = sqlc.arg(tournament_id)
  AND (
    cardinality(sqlc.arg(statuses)::text[]) = 0
    OR f.status = ANY(sqlc.arg(statuses)::text[])
  )
  AND (
    (cardinality(sqlc.arg(clubs)::text[]) = 0 AND NOT sqlc.arg(include_no_club)::bool)
    OR f.club = ANY(sqlc.arg(clubs)::text[])
    OR (sqlc.arg(include_no_club)::bool AND f.club = '')
  )
  AND (
    cardinality(sqlc.arg(nomination_ids)::uuid[]) = 0
    OR EXISTS (
      SELECT 1 FROM fighter.participations p
      WHERE p.fighter_id = f.id
        AND p.status = 'active'
        AND p.nomination_id = ANY(sqlc.arg(nomination_ids)::uuid[])
    )
  )
  AND (
    sqlc.narg(search)::text IS NULL
    OR f.name ILIKE '%' || sqlc.narg(search)::text || '%'
    OR f.club ILIKE '%' || sqlc.narg(search)::text || '%'
  );

-- CountByTournamentStatus — счётчики бойцов по статусу для шапки экрана
-- (спека 0041, FR-4): только tournament_id, независимо от фильтра/поиска
-- ListRosterByTournament.
-- name: CountByTournamentStatus :many
SELECT status, count(*) AS count
FROM fighter.fighters
WHERE tournament_id = sqlc.arg(tournament_id)
GROUP BY status;

-- name: UpdateFighter :one
UPDATE fighter.fighters
SET name = $2,
    club = $3,
    status = $4,
    withdrawal_reason = $5,
    updated_at = now()
WHERE id = $1
RETURNING id, tournament_id, name, club, origin_user_id, status, withdrawal_reason, created_at, updated_at, merged_into_id;

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

-- Слияние дублей (спека 0040, FR-10). Отклонение от буквального plan.md:
-- там MergeParticipations — один SQL-блок с двумя стейтментами под одним
-- именем; этот кодбаз (см. остальные *.sql файлы модулей) держит одно имя
-- -- один стейтмент на sqlc-запрос, поэтому это разбито на два запроса,
-- которые repo.MergeParticipations вызывает подряд в одной транзакции —
-- тот же приём, что уже применяет repo.Create/Update для upsert участий.

-- name: DeleteDuplicateParticipationsForMerge :exec
DELETE FROM fighter.participations p
USING fighter.participations t
WHERE p.fighter_id = sqlc.arg(source_id)
  AND t.fighter_id = sqlc.arg(target_id)
  AND p.nomination_id = t.nomination_id;

-- name: RepointParticipations :exec
UPDATE fighter.participations
SET fighter_id = sqlc.arg(target_id), updated_at = now()
WHERE fighter_id = sqlc.arg(source_id);

-- name: ClearOriginUserID :exec
UPDATE fighter.fighters
SET origin_user_id = NULL, updated_at = now()
WHERE id = $1;

-- SetMerged дополнительно обнуляет withdrawal_reason: отклонение от
-- буквального plan.md (там столбец не упомянут), но необходимо для
-- соблюдения chk_fighters_reason_when — оно требует пустой reason при любом
-- status, кроме 'withdrawn', а source может быть выведенным бойцом с
-- непустой причиной на момент слияния.
-- name: SetMerged :exec
UPDATE fighter.fighters
SET status = 'merged', merged_into_id = sqlc.arg(target_id), withdrawal_reason = '', updated_at = now()
WHERE id = sqlc.arg(source_id);
