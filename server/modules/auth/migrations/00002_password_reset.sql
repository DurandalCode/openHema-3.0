-- +goose Up
-- +goose StatementBegin
ALTER TABLE auth.users
    ADD COLUMN club TEXT NOT NULL DEFAULT '',
    ADD COLUMN password_changed_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Одноразовые токены восстановления. Отдельная таблица, а не колонки в
-- users: у одного пользователя за жизнь их много, и нужна история выдачи
-- (троттлинг FR-6 читает время последней выдачи, в т.ч. погашенной).
CREATE TABLE auth.password_reset_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- sha256(raw) в hex: сырой токен живёт только в письме (NFR-1).
    token_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    -- used_at — момент погашения: и «использован» (FR-4), и «вытеснен
    -- новым запросом» (FR-5). NULL — активен.
    used_at    TIMESTAMPTZ NULL,
    CONSTRAINT chk_prt_expires_after_created CHECK (expires_at > created_at)
);

CREATE INDEX idx_prt_user_active ON auth.password_reset_tokens (user_id)
    WHERE used_at IS NULL;
CREATE INDEX idx_prt_user_created ON auth.password_reset_tokens (user_id, created_at DESC);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS auth.password_reset_tokens;
ALTER TABLE auth.users
    DROP COLUMN IF EXISTS password_changed_at,
    DROP COLUMN IF EXISTS club;
-- +goose StatementEnd
