-- name: CreateEmailToken :one
-- Сохраняет новый токен подтверждения/смены адреса (только хеш, NFR-1).
INSERT INTO auth.email_tokens (user_id, purpose, token_hash, new_email, expires_at)
VALUES ($1, $2, $3, NULLIF($4, ''), $5)
RETURNING id, user_id, purpose, token_hash, coalesce(new_email, '')::text AS new_email, created_at, expires_at, used_at;

-- name: GetActiveEmailToken :one
-- Активный токен по хешу и назначению: не погашен и не просрочен. Иначе —
-- ноль строк, сервис мапит это в ErrInvalidEmailToken (один код на все три
-- случая — не найден/просрочен/погашен, FR-8/спека 0037 FR-8).
SELECT id, user_id, purpose, token_hash, coalesce(new_email, '')::text AS new_email, created_at, expires_at, used_at
FROM auth.email_tokens
WHERE token_hash = $1
  AND purpose = $2
  AND used_at IS NULL
  AND expires_at > now();

-- name: MarkEmailTokenUsed :exec
-- Погашает токен после успешного использования.
UPDATE auth.email_tokens
SET used_at = now()
WHERE id = $1;

-- name: InvalidateActiveEmailTokens :exec
-- Гасит все активные (непогашенные) токены пользователя данного
-- назначения — новый запрос обесценивает прежние неиспользованные ссылки.
UPDATE auth.email_tokens
SET used_at = now()
WHERE user_id = $1
  AND purpose = $2
  AND used_at IS NULL;

-- name: LastEmailTokenAt :one
-- Время выдачи последнего токена данного назначения (в т.ч. погашенного) —
-- троттлинг FR-4/FR-6. COALESCE — тем же приёмом, что и
-- LastResetTokenAt: без него MAX() над пустым множеством не типизируется
-- sqlc однозначно. Нулевое время Go — контракт «токенов не было».
SELECT (COALESCE(MAX(created_at), '0001-01-01 00:00:00+00'::timestamptz))::timestamptz AS last_created_at
FROM auth.email_tokens
WHERE user_id = $1
  AND purpose = $2;
