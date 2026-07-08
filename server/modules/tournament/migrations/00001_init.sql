-- +goose Up
-- +goose StatementBegin
CREATE SCHEMA IF NOT EXISTS tournament;

CREATE TABLE tournament.tournaments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title       TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    event_at    TIMESTAMPTZ NULL,
    emblem_url  TEXT NOT NULL DEFAULT '',
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- В MVP ровно один активный турнир. Partial unique index гарантирует
-- единственность is_active = true и расширяется в будущем до мультитурнирности
-- (снятие индекса вместо переписывания сущности).
CREATE UNIQUE INDEX tournaments_one_active
    ON tournament.tournaments (is_active)
    WHERE is_active = TRUE;

CREATE TABLE tournament.contacts (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID NOT NULL REFERENCES tournament.tournaments(id) ON DELETE CASCADE,
    type           TEXT NOT NULL,
    value          TEXT NOT NULL,
    position       INTEGER NOT NULL,
    CONSTRAINT chk_contacts_type CHECK (type IN ('telegram','vk','facebook','website','email','other')),
    CONSTRAINT chk_contacts_position CHECK (position >= 0)
);

CREATE INDEX idx_contacts_tournament ON tournament.contacts (tournament_id, position);

-- Seed: один пустой активный турнир. Состоится «всегда есть профиль»
-- (FR-1/init decision); admin редактирует его (upsert-семантика).
INSERT INTO tournament.tournaments (id, is_active)
VALUES ('00000000-0000-0000-0000-000000000001', TRUE);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS tournament.contacts;
DROP TABLE IF EXISTS tournament.tournaments;
DROP SCHEMA IF EXISTS tournament;
-- +goose StatementEnd