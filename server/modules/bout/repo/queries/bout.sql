-- name: DeleteBoutsByNomination :exec
-- ON DELETE CASCADE на bout.bout_events.bout_id удаляет вместе с проекцией
-- и потоки событий регенерируемых боёв (спека 0013, plan.md «Server» →
-- bout, миграция 00002). Используется ReplaceForNomination (GenerateForStage,
-- спека 0017): в этом инкременте у номинации ровно один этап, поэтому
-- delete-перед-insert всё ещё безопасно адресовать по номинации целиком.
DELETE FROM bout.bouts WHERE nomination_id = $1;

-- name: DeleteBoutsByPools :exec
-- Расфиксация этапа (спека 0017, ClearForPools): удаляет бои только
-- перечисленных пулов, не трогая бои пулов других этапов той же номинации
-- (FR-8). ON DELETE CASCADE на bout.bout_events.bout_id удаляет вместе с
-- проекцией и потоки событий.
DELETE FROM bout.bouts WHERE pool_id = ANY(sqlc.arg(pool_ids)::uuid[]);

-- name: InsertBout :one
INSERT INTO bout.bouts (
    pool_id, nomination_id, round_number, sequence_number,
    fighter_a_id, fighter_a_name, fighter_a_club,
    fighter_b_id, fighter_b_name, fighter_b_club,
    state, score_a, score_b, version
) VALUES (
    $1, $2, $3, $4,
    $5, $6, $7,
    $8, $9, $10,
    $11, $12, $13, $14
)
RETURNING id, pool_id, nomination_id, round_number, sequence_number,
    fighter_a_id, fighter_a_name, fighter_a_club,
    fighter_b_id, fighter_b_name, fighter_b_club,
    state, score_a, score_b, version;

-- name: ListBoutsByNomination :many
SELECT id, pool_id, nomination_id, round_number, sequence_number,
    fighter_a_id, fighter_a_name, fighter_a_club,
    fighter_b_id, fighter_b_name, fighter_b_club,
    state, score_a, score_b, version
FROM bout.bouts
WHERE nomination_id = $1
ORDER BY pool_id, sequence_number;

-- name: BoutsByPool :many
SELECT id, pool_id, nomination_id, round_number, sequence_number,
    fighter_a_id, fighter_a_name, fighter_a_club,
    fighter_b_id, fighter_b_name, fighter_b_club,
    state, score_a, score_b, version
FROM bout.bouts
WHERE pool_id = $1
ORDER BY sequence_number;

-- name: GetBout :one
SELECT id, pool_id, nomination_id, round_number, sequence_number,
    fighter_a_id, fighter_a_name, fighter_a_club,
    fighter_b_id, fighter_b_name, fighter_b_club,
    state, score_a, score_b, version
FROM bout.bouts
WHERE id = $1;

-- name: PoolProgress :one
-- started — бои, вышедшие из not_started (in_progress или finished),
-- см. domain.Repository.PoolProgress (спека 0013, FR-10).
SELECT
    count(*)::int AS total,
    count(*) FILTER (WHERE state <> 'not_started')::int AS started,
    count(*) FILTER (WHERE state = 'finished')::int AS finished
FROM bout.bouts
WHERE pool_id = $1;

-- name: AnyStartedInPools :one
-- Гейт расфиксации этапа (спека 0017, FR-8/FR-13): есть ли среди боёв
-- перечисленных пулов хотя бы один со state ≠ not_started.
SELECT EXISTS (
    SELECT 1 FROM bout.bouts
    WHERE pool_id = ANY(sqlc.arg(pool_ids)::uuid[]) AND state <> 'not_started'
) AS any_started;

-- name: AppendEvent :exec
-- Вставка события потока боя: version = expectedVersion+1 (вычисляется
-- вызывающим). Нарушение uq_bout_events_version → конфликт версии
-- (ErrConcurrency, ADR 0011 п.3) — детектируется в repo.go по имени
-- констрейнта.
INSERT INTO bout.bout_events (bout_id, version, event_type, payload, actor_id, occurred_at)
VALUES ($1, $2, $3, $4, $5, $6);

-- name: UpdateProjection :exec
-- Обновляет инлайн-проекцию боя атомарно с AppendEvent (одна транзакция,
-- ADR 0011 п.4). Строка проекции уже существует (создана при генерации,
-- ReplaceForNomination) — здесь только UPDATE, не upsert.
UPDATE bout.bouts
SET state = $2, score_a = $3, score_b = $4, version = $5
WHERE id = $1;

-- name: LoadEvents :many
SELECT bout_id, version, event_type, payload, actor_id, occurred_at
FROM bout.bout_events
WHERE bout_id = $1
ORDER BY version;
