-- +goose Up
-- +goose StatementBegin
CREATE SCHEMA IF NOT EXISTS stage;

-- pool_layouts — одна строка на номинацию: статус раскладки + undo-снапшот.
-- Lazy-init (спека 0009, решение №9): отсутствие строки = draft с пустым
-- undo. Строка материализуется при первой мутации.
CREATE TABLE stage.pool_layouts (
    nomination_id UUID PRIMARY KEY,                 -- без кросс-схемного FK (ADR 0002)
    status        TEXT NOT NULL DEFAULT 'draft',
    -- undo последнего mutating-действия (решение №16): вид + JSONB-снапшот.
    -- undo_kind='' — undo недоступен. 'auto' — {"fighter_ids":[...]} (кого
    -- расставило авто — вернуть в нераспределённые). 'delete_pool' —
    -- {"number":N,"fighter_ids":[...]} (восстановить пул + членства).
    undo_kind     TEXT NOT NULL DEFAULT '',
    undo_data     JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_layouts_status CHECK (status IN ('draft','ready','active','finished')),
    CONSTRAINT chk_layouts_undo   CHECK (undo_kind IN ('','auto','delete_pool'))
);

-- pools — пул (именованная корзина) внутри номинации. number уникален в
-- пределах номинации (FR-3: свободный номер; удалённые переиспользуются).
CREATE TABLE stage.pools (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nomination_id UUID NOT NULL,
    number        INTEGER NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_pools_number     CHECK (number >= 1),
    CONSTRAINT uq_pools_nom_number  UNIQUE (nomination_id, number)
);
CREATE INDEX idx_pools_nomination ON stage.pools (nomination_id, number);

-- pool_members — членство бойца в пуле. Инвариант FR-1/FR-16: один боец —
-- не более одного пула в номинации → UNIQUE(nomination_id, fighter_id).
-- Отсутствие членства = «нераспределённый». Удаление пула каскадит членства
-- (бойцы автоматически становятся нераспределёнными, FR-4).
CREATE TABLE stage.pool_members (
    pool_id       UUID NOT NULL REFERENCES stage.pools(id) ON DELETE CASCADE,
    nomination_id UUID NOT NULL,                    -- денормализация под инвариант/выборки
    fighter_id    UUID NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (pool_id, fighter_id),
    CONSTRAINT uq_members_nom_fighter UNIQUE (nomination_id, fighter_id)
);
CREATE INDEX idx_members_nomination ON stage.pool_members (nomination_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS stage.pool_members;
DROP TABLE IF EXISTS stage.pools;
DROP TABLE IF EXISTS stage.pool_layouts;
DROP SCHEMA IF EXISTS stage;
-- +goose StatementEnd
