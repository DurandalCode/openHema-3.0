-- +goose Up
-- +goose StatementBegin
CREATE SCHEMA IF NOT EXISTS arena;

-- arenas — агрегат-корень «площадка/ристалище турнира».
CREATE TABLE arena.arenas (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Принадлежность турниру: передаётся клиентом, валидируется сервисом
    -- (в MVP — активный турнир). Без кросс-схемного FK на tournament (ADR 0002).
    tournament_id UUID NOT NULL,
    name          TEXT NOT NULL,                 -- имя/номер ристалища; непусто
    description   TEXT NOT NULL DEFAULT '',       -- описание/локация; может быть пустым
    -- Порядок в списке площадок турнира (0-индекс).
    position      INTEGER NOT NULL,
    -- Статус: 'active' по умолчанию | 'archived' (обратимое «удаление», FR-5).
    status        TEXT NOT NULL DEFAULT 'active',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_arenas_name     CHECK (length(btrim(name)) > 0),
    CONSTRAINT chk_arenas_position CHECK (position >= 0),
    CONSTRAINT chk_arenas_status   CHECK (status IN ('active','archived'))
);

-- Выборка и сортировка списка площадок по турниру.
CREATE INDEX idx_arenas_tournament ON arena.arenas (tournament_id, position);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS arena.arenas;
DROP SCHEMA IF EXISTS arena;
-- +goose StatementEnd