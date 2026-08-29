-- name: StartedAtByBouts :many
-- StartedAtByBouts — первый момент начала каждого боя из списка (спека
-- 0043, ADR 0020): MIN(occurred_at) по событиям 'started' — переоткрытие
-- (reopened) не создаёт новый started, но reset+повторный StartBout может
-- дать несколько started одного боя; берём самый ранний, чтобы такт
-- площадки считался по первому реальному запуску, а не по случайному
-- повтору.
SELECT bout_id, MIN(occurred_at)::timestamptz AS started_at
FROM bout.bout_events
WHERE bout_id = ANY(sqlc.arg(bout_ids)::uuid[]) AND event_type = 'started'
GROUP BY bout_id;
