-- name: CreateUser :one
INSERT INTO auth.users (email, password_hash, display_name, role)
VALUES ($1, $2, $3, $4)
RETURNING id, email, password_hash, display_name, role, created_at, club, password_changed_at;

-- name: GetUserByEmail :one
SELECT id, email, password_hash, display_name, role, created_at, club, password_changed_at
FROM auth.users
WHERE email = $1;

-- name: GetUserByID :one
SELECT id, email, password_hash, display_name, role, created_at, club, password_changed_at
FROM auth.users
WHERE id = $1;

-- name: GetUsersByIDs :many
SELECT id, email, password_hash, display_name, role, created_at, club, password_changed_at
FROM auth.users
WHERE id = ANY($1::uuid[]);

-- name: CountAdmins :one
SELECT count(*) FROM auth.users WHERE role = 'admin';

-- name: ListAdmins :many
SELECT id, email, password_hash, display_name, role, created_at, club, password_changed_at
FROM auth.users
WHERE role = 'admin'
ORDER BY created_at;

-- name: ListUsers :many
SELECT id, email, password_hash, display_name, role, created_at, club, password_changed_at
FROM auth.users
ORDER BY created_at
LIMIT $1 OFFSET $2;

-- name: SetUserRole :one
UPDATE auth.users
SET role = $2
WHERE id = $1
RETURNING id, email, password_hash, display_name, role, created_at, club, password_changed_at;

-- name: UpdateUserPassword :exec
-- Заменяет хеш пароля и двигает password_changed_at на текущий момент —
-- Refresh сверяет с ним iat токена, чтобы оборвать продление старых сессий
-- после смены/сброса пароля (спека 0037, FR-12).
UPDATE auth.users
SET password_hash = $2,
    password_changed_at = now()
WHERE id = $1;

-- name: UpdateUserProfile :one
-- Правит отображаемое имя и клуб (спека 0037, FR-13). Email и роль не трогает.
UPDATE auth.users
SET display_name = $2,
    club = $3
WHERE id = $1
RETURNING id, email, password_hash, display_name, role, created_at, club, password_changed_at;

-- name: CreateResetToken :one
-- Сохраняет только хеш токена восстановления (NFR-1) — сырой токен живёт
-- лишь в письме.
INSERT INTO auth.password_reset_tokens (user_id, token_hash, expires_at)
VALUES ($1, $2, $3)
RETURNING id, user_id, token_hash, created_at, expires_at, used_at;

-- name: LastResetTokenAt :one
-- Время выдачи последнего токена восстановления (в т.ч. погашенного) —
-- троттлинг запроса восстановления (FR-6). COALESCE вместо NULL: без него
-- MAX() над пустым множеством не типизируется sqlc однозначно (interface{}
-- вместо time.Time). Нулевое время Go (0001-01-01T00:00:00Z) — контракт
-- domain.Repository.LastResetTokenAt: «токенов не было».
SELECT (COALESCE(MAX(created_at), '0001-01-01 00:00:00+00'::timestamptz))::timestamptz AS last_created_at
FROM auth.password_reset_tokens
WHERE user_id = $1;

-- name: InvalidateActiveResetTokens :exec
-- Гасит все активные (непогашенные) токены пользователя — новый запрос
-- обесценивает прежние неиспользованные ссылки (FR-5).
UPDATE auth.password_reset_tokens
SET used_at = now()
WHERE user_id = $1
  AND used_at IS NULL;

-- name: GetActiveResetToken :one
-- Активный токен по хешу: не погашен и не просрочен. Иначе — ноль строк,
-- сервис мапит это в ErrInvalidResetToken (один код на все три случая, FR-8).
SELECT id, user_id, token_hash, created_at, expires_at, used_at
FROM auth.password_reset_tokens
WHERE token_hash = $1
  AND used_at IS NULL
  AND expires_at > now();

-- name: MarkResetTokenUsed :exec
-- Погашает токен после успешной смены пароля (FR-4) — повторный переход по
-- той же ссылке отклоняется.
UPDATE auth.password_reset_tokens
SET used_at = now()
WHERE id = $1;
