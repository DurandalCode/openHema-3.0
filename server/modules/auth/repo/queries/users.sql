-- name: CreateUser :one
INSERT INTO auth.users (email, password_hash, display_name, role)
VALUES ($1, $2, $3, $4)
RETURNING id, email, password_hash, display_name, role, created_at;

-- name: GetUserByEmail :one
SELECT id, email, password_hash, display_name, role, created_at
FROM auth.users
WHERE email = $1;

-- name: GetUserByID :one
SELECT id, email, password_hash, display_name, role, created_at
FROM auth.users
WHERE id = $1;

-- name: GetUsersByIDs :many
SELECT id, email, password_hash, display_name, role, created_at
FROM auth.users
WHERE id = ANY($1::uuid[]);

-- name: CountAdmins :one
SELECT count(*) FROM auth.users WHERE role = 'admin';

-- name: ListAdmins :many
SELECT id, email, password_hash, display_name, role, created_at
FROM auth.users
WHERE role = 'admin'
ORDER BY created_at;

-- name: ListUsers :many
SELECT id, email, password_hash, display_name, role, created_at
FROM auth.users
ORDER BY created_at
LIMIT $1 OFFSET $2;

-- name: SetUserRole :one
UPDATE auth.users
SET role = $2
WHERE id = $1
RETURNING id, email, password_hash, display_name, role, created_at;
