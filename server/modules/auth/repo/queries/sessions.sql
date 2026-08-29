-- name: CreateSession :one
-- Создаёт новую строку реестра сессий (ADR 0018) — на выдачу (вход,
-- регистрация).
INSERT INTO auth.sessions (user_id, expires_at)
VALUES ($1, $2)
RETURNING id, user_id, created_at, last_seen_at, expires_at, revoked_at;

-- name: GetSession :one
SELECT id, user_id, created_at, last_seen_at, expires_at, revoked_at
FROM auth.sessions
WHERE id = $1;

-- name: TouchSession :exec
-- Обновляет last_seen_at на каждом Refresh (FR-11).
UPDATE auth.sessions
SET last_seen_at = $2
WHERE id = $1;

-- name: ListActiveSessions :many
-- Активные (не отозванные, не просроченные) сессии пользователя (FR-11),
-- свежие сверху.
SELECT id, user_id, created_at, last_seen_at, expires_at, revoked_at
FROM auth.sessions
WHERE user_id = $1
  AND revoked_at IS NULL
  AND expires_at > now()
ORDER BY created_at DESC;

-- name: RevokeSession :exec
-- Отзывает одну сессию по id (идемпотентно — WHERE revoked_at IS NULL не
-- даёт перезаписать более раннюю метку отзыва повторным вызовом).
UPDATE auth.sessions
SET revoked_at = $2
WHERE id = $1
  AND revoked_at IS NULL;

-- name: RevokeUserSessions :execrows
-- Отзывает все активные сессии пользователя, кроме exceptID (пустая
-- строка — отзывает все, FR-12/FR-14). :execrows — сервис возвращает
-- число отозванных (RevokeOtherSessionsResponse.revoked_count).
UPDATE auth.sessions
SET revoked_at = $3
WHERE user_id = $1
  -- Сравнение как text, не uuid: exceptID="" (FR-12/FR-14 — "все") не
  -- парсится как uuid и уронило бы запрос на CAST; как text пустая
  -- строка просто ни с чем не совпадает, что и нужно ("не исключать
  -- никого").
  AND id::text != $2::text
  AND revoked_at IS NULL;

-- name: DeleteExpiredSessions :exec
-- Физически удаляет строки с истёкшим expires_at — реестр не растёт
-- бесконечно вместе с логами входов (ADR 0018, п.5). Вызывается фоново.
DELETE FROM auth.sessions
WHERE expires_at < now();
