-- +goose Up
-- +goose StatementBegin
ALTER TABLE auth.users
    -- NULL = адрес не подтверждён. Не BOOLEAN: момент подтверждения
    -- нужен интерфейсу («подтверждён 12 июля») и разбору инцидентов.
    ADD COLUMN email_verified_at        TIMESTAMPTZ NULL,
    -- pending_email — новый адрес, ожидающий подтверждения по ссылке из
    -- письма (FR-6). Пустая строка — запроса смены нет.
    ADD COLUMN pending_email            TEXT NOT NULL DEFAULT '',
    -- Личные переключатели уведомлений (FR-20). Колонки, а не отдельная
    -- таблица: набор видов закрыт спекой (два), таблица «настройка на
    -- строку» здесь — оверинжиниринг. Третий вид добавит третью колонку.
    ADD COLUMN notify_application_state BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN notify_pool_seated       BOOLEAN NOT NULL DEFAULT FALSE;

-- Grandfather (FR-1): учётки, заведённые до фичи, считаются
-- подтверждёнными — иначе внедрение молча отключило бы им уведомления и
-- показало бы бейдж «адрес не подтверждён» всем разом, включая
-- bootstrap-админа. Колонка без DEFAULT: новые учётки создаются с NULL.
UPDATE auth.users SET email_verified_at = now();

-- Одноразовые токены подтверждения и смены адреса. Отдельная таблица от
-- password_reset_tokens: другое назначение, другой TTL и своя полезная
-- нагрузка (new_email).
CREATE TABLE auth.email_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    purpose    TEXT NOT NULL,
    -- sha256(raw) в hex: сырой токен живёт только в письме (NFR-1).
    token_hash TEXT NOT NULL UNIQUE,
    -- new_email заполнен ровно у purpose='change' (см. CHECK ниже).
    new_email  TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ NULL,
    CONSTRAINT chk_email_tokens_purpose CHECK (purpose IN ('verify', 'change')),
    -- Симметрично в обе стороны (тот же приём, что chk_entry_fee в
    -- tournament/00003): равенство предикатов запрещает и «change без
    -- адреса», и «verify с адресом».
    CONSTRAINT chk_email_tokens_new_email CHECK ((purpose = 'change') = (new_email IS NOT NULL)),
    CONSTRAINT chk_email_tokens_expires CHECK (expires_at > created_at)
);

CREATE INDEX idx_email_tokens_user_active ON auth.email_tokens (user_id, purpose)
    WHERE used_at IS NULL;
CREATE INDEX idx_email_tokens_user_created ON auth.email_tokens (user_id, purpose, created_at DESC);

-- Реестр refresh-сессий (ADR 0018). Одна строка — одна выданная сессия;
-- id строки попадает в клейм sid refresh-токена.
CREATE TABLE auth.sessions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- last_seen_at обновляется на каждом Refresh (FR-11). Не на каждом
    -- запросе: access-токен stateless и реестра не касается (FR-16).
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at   TIMESTAMPTZ NOT NULL,
    revoked_at   TIMESTAMPTZ NULL,
    CONSTRAINT chk_sessions_expires CHECK (expires_at > created_at)
);

CREATE INDEX idx_sessions_user_active ON auth.sessions (user_id) WHERE revoked_at IS NULL;
-- Для чистки просроченных (FR-15).
CREATE INDEX idx_sessions_expires ON auth.sessions (expires_at);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS auth.sessions;
DROP TABLE IF EXISTS auth.email_tokens;
ALTER TABLE auth.users
    DROP COLUMN IF EXISTS notify_pool_seated,
    DROP COLUMN IF EXISTS notify_application_state,
    DROP COLUMN IF EXISTS pending_email,
    DROP COLUMN IF EXISTS email_verified_at;
-- +goose StatementEnd
