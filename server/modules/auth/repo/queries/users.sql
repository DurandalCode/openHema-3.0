-- name: CreateUser :one
INSERT INTO auth.users (email, password_hash, display_name)
VALUES ($1, $2, $3)
RETURNING id, email, password_hash, display_name, created_at;

-- name: GetUserByEmail :one
SELECT id, email, password_hash, display_name, created_at
FROM auth.users
WHERE email = $1;

-- name: GetUserByID :one
SELECT id, email, password_hash, display_name, created_at
FROM auth.users
WHERE id = $1;
