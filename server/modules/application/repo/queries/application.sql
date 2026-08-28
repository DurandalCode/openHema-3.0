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
-- Сводный экран заявок турнира (спека 0041): фильтр по статусу/номинации/
-- экипировке + LIMIT/OFFSET целиком в SQL. Используется, когда поиск по
-- имени (search) не активен — путь, реально снимающий предел NFR-1 (не тянет
-- весь список турнира). cardinality(...) = 0 — пустой repeated-параметр
-- (Go nil/[]string{}) значит «без ограничения по этому измерению».
SELECT application_id, nomination_id, tournament_id, applicant_user_id, state, version, created_at, updated_at,
       club, needs_equipment, applicant_name_override
FROM application.application_current
WHERE tournament_id = sqlc.arg('tournament_id')
  AND (cardinality(sqlc.arg('statuses')::text[]) = 0 OR state = ANY(sqlc.arg('statuses')::text[]))
  AND (cardinality(sqlc.arg('nomination_ids')::uuid[]) = 0 OR nomination_id = ANY(sqlc.arg('nomination_ids')::uuid[]))
  AND (sqlc.narg('needs_equipment')::bool IS NULL OR needs_equipment = sqlc.narg('needs_equipment'))
ORDER BY created_at
LIMIT sqlc.arg('limit_rows') OFFSET sqlc.arg('offset_rows');

-- name: CountByTournamentFiltered :one
-- total_count для постраничной навигации (FR-5, спека 0041): тот же WHERE,
-- что и ListByTournament, без LIMIT/OFFSET.
SELECT count(*)::int AS total
FROM application.application_current
WHERE tournament_id = sqlc.arg('tournament_id')
  AND (cardinality(sqlc.arg('statuses')::text[]) = 0 OR state = ANY(sqlc.arg('statuses')::text[]))
  AND (cardinality(sqlc.arg('nomination_ids')::uuid[]) = 0 OR nomination_id = ANY(sqlc.arg('nomination_ids')::uuid[]))
  AND (sqlc.narg('needs_equipment')::bool IS NULL OR needs_equipment = sqlc.narg('needs_equipment'));

-- name: SearchCandidatesByTournament :many
-- Кандидаты для поиска по имени заявителя (спека 0041, план «Server»/
-- «Риски»): отображаемое имя — ApplicantNameOverride, если задан, иначе
-- имя резолвится в service через UserProvider (auth) и не читается этим
-- запросом. Строка проходит дальше в SQL-кандидаты, если:
--   - её клуб уже совпадает с search (ILIKE), ИЛИ
--   - её override непуст и совпадает с search (ILIKE) — override и есть
--     финальное отображаемое имя, résolve auth не нужен, безопасно решить
--     здесь и не тащить в Go-досев, ИЛИ
--   - override пуст — тогда отображаемое имя ещё не известно на этом
--     уровне (резолвится из auth), и строка обязана остаться кандидатом,
--     иначе service не сможет досеять её по резолвленному имени.
-- Без LIMIT/OFFSET — постраничность режется в Go после досева по имени.
SELECT application_id, nomination_id, tournament_id, applicant_user_id, state, version, created_at, updated_at,
       club, needs_equipment, applicant_name_override
FROM application.application_current
WHERE tournament_id = sqlc.arg('tournament_id')
  AND (cardinality(sqlc.arg('statuses')::text[]) = 0 OR state = ANY(sqlc.arg('statuses')::text[]))
  AND (cardinality(sqlc.arg('nomination_ids')::uuid[]) = 0 OR nomination_id = ANY(sqlc.arg('nomination_ids')::uuid[]))
  AND (sqlc.narg('needs_equipment')::bool IS NULL OR needs_equipment = sqlc.narg('needs_equipment'))
  AND (
        club ILIKE '%' || sqlc.arg('search') || '%'
        OR applicant_name_override ILIKE '%' || sqlc.arg('search') || '%'
        OR applicant_name_override = ''
      )
ORDER BY created_at;

-- name: CountByTournamentStatus :many
-- status_counts (FR-4, спека 0041): счётчик по каждому статусу турнира,
-- не зависящий от фильтров/поиска запроса — «сколько всего», а не «сколько
-- нашлось».
SELECT state, count(*)::int AS count
FROM application.application_current
WHERE tournament_id = sqlc.arg('tournament_id')
GROUP BY state;

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
