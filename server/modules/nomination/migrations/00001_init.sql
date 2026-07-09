-- +goose Up
-- +goose StatementBegin
CREATE SCHEMA IF NOT EXISTS nomination;

CREATE TABLE nomination.nominations (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Ссылка на турнир. Обязательна: передаётся клиентом явно и валидируется
    -- сервисом (в MVP — активный турнир). Без FK на tournament.tournaments —
    -- кросс-схемные границы модулей (ADR 0002); целостность держит сервис.
    tournament_id    UUID NOT NULL,
    title            TEXT NOT NULL,
    description      TEXT NOT NULL DEFAULT '',
    -- NULL = плановая вместимость не задана.
    fighter_capacity INTEGER NULL,
    -- Типизированная закрытая схема прочих данных (MVP-ключ rules_url).
    metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Порядок в списке номинаций турнира (0-индекс).
    position         INTEGER NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_nominations_capacity CHECK (fighter_capacity IS NULL OR fighter_capacity >= 0),
    CONSTRAINT chk_nominations_position CHECK (position >= 0),
    CONSTRAINT chk_nominations_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

-- Уникальность названия в пределах турнира без учёта регистра (FR-9/AC-8).
CREATE UNIQUE INDEX nominations_title_per_tournament
    ON nomination.nominations (tournament_id, lower(title));

-- Выборка и сортировка списка по турниру.
CREATE INDEX idx_nominations_tournament
    ON nomination.nominations (tournament_id, position);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS nomination.nominations;
DROP SCHEMA IF EXISTS nomination;
-- +goose StatementEnd
