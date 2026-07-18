-- +goose Up
-- +goose StatementBegin
-- Инкремент 2026-07-18 (спека 0011): постановка пула на арену.
--
-- arena_id — привязка пула к площадке (без кросс-схемного FK, ADR 0002):
-- NULL — пул не на арене («готов»/«не готов»); задан — пул «готовится к
-- запуску» (FR-1/FR-7/FR-12). Статус отдельного пула не хранится отдельной
-- колонкой — вычисляется из статуса раскладки + факта arena_id (план
-- «Обзор решения»); идёт/завершён добавит будущий ЕДД-инкремент отдельной
-- колонкой без ломки данных (NFR-1).
ALTER TABLE pool.pools ADD COLUMN arena_id UUID NULL;

-- Инвариант «одна арена ↔ один пул» (FR-6, NFR-4): арена ведёт не более
-- одного пула одновременно, защищено на уровне данных (не только
-- приложения) — конкурентная постановка на одну арену не должна посадить
-- два пула разом. Partial-индекс не ограничивает количество пулов с
-- arena_id IS NULL (не на арене).
CREATE UNIQUE INDEX uq_pools_arena ON pool.pools (arena_id) WHERE arena_id IS NOT NULL;

-- Статус раскладки урезается до двух значений (спека 0011, FR-1): заглушки
-- 'active'/'finished' (спека 0009 «Вне скоупа») убраны с раскладки —
-- исполнительная фаза («готовится к запуску» и далее) принадлежит
-- отдельному пулу (см. arena_id выше), не раскладке номинации целиком.
ALTER TABLE pool.pool_layouts
    DROP CONSTRAINT chk_layouts_status,
    ADD CONSTRAINT chk_layouts_status CHECK (status IN ('draft','ready'));
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE pool.pool_layouts
    DROP CONSTRAINT chk_layouts_status,
    ADD CONSTRAINT chk_layouts_status CHECK (status IN ('draft','ready','active','finished'));

DROP INDEX IF EXISTS pool.uq_pools_arena;
ALTER TABLE pool.pools DROP COLUMN IF EXISTS arena_id;
-- +goose StatementEnd
