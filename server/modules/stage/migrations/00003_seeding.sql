-- +goose Up
-- +goose StatementBegin
-- Правило отбора этапа (спека 0019, FR-1): семь скалярных колонок, как
-- bracket_size/third_place у сетки (0018) — их можно проверить CHECK-ом,
-- переезд на jsonb оправдан, когда конфигов станет много (план 0020).
ALTER TABLE stage.stages
    ADD COLUMN source_kind     TEXT    NOT NULL DEFAULT '',
    ADD COLUMN source_stage_id UUID    NULL REFERENCES stage.stages(id) ON DELETE RESTRICT,
    ADD COLUMN selector_kind   TEXT    NOT NULL DEFAULT '',
    ADD COLUMN place_from      INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN place_to        INTEGER NOT NULL DEFAULT 0,   -- 0 = открытая граница (FR-3)
    ADD COLUMN layout_method   TEXT    NOT NULL DEFAULT '',
    ADD COLUMN group_count     INTEGER NOT NULL DEFAULT 0;   -- FR-8, только у groups

ALTER TABLE stage.stages
    ADD CONSTRAINT chk_stages_source   CHECK (source_kind   IN ('','roster','stage')),
    ADD CONSTRAINT chk_stages_selector CHECK (selector_kind IN ('','all','group_places','overall_places')),
    ADD CONSTRAINT chk_stages_method   CHECK (layout_method IN ('','snake','seeded'));

-- Правило либо есть целиком, либо его нет вовсе (FR-1): у этапа без правила
-- все шесть полей — нулевые/пустые одновременно.
ALTER TABLE stage.stages ADD CONSTRAINT chk_stages_rule CHECK (
    (source_kind = '' AND selector_kind = '' AND layout_method = ''
     AND source_stage_id IS NULL AND place_from = 0 AND place_to = 0)
 OR (source_kind <> '' AND selector_kind <> '' AND layout_method <> ''));

-- Источник-этап <=> ссылка на этап заполнена (FR-2).
ALTER TABLE stage.stages ADD CONSTRAINT chk_stages_source_stage
    CHECK ((source_kind = 'stage') = (source_stage_id IS NOT NULL));

ALTER TABLE stage.stages ADD CONSTRAINT chk_stages_places
    CHECK (place_from >= 0 AND place_to >= 0 AND (place_to = 0 OR place_to >= place_from));

-- Число групп — только у группового этапа (FR-8/FR-9): у явно созданного
-- задано организатором, у сетки и у авто-этапа (пока не переведён на явную
-- схему) — 0.
ALTER TABLE stage.stages ADD CONSTRAINT chk_stages_group_count
    CHECK (group_count >= 0 AND (type = 'groups' OR group_count = 0));

-- Расширение undo новым видом снапшота (спека 0019, FR-21): формирование
-- этапа обратимо, как автораспределение/удаление пула/сброс раскладки.
-- Данных build-снапшот не хранит (undo_data остаётся '{}'::jsonb) — после
-- формирования состав применяется поверх гарантированно пустого этапа
-- (FR-18), поэтому откат сводится к очистке состава.
ALTER TABLE stage.stages DROP CONSTRAINT chk_stages_undo;
ALTER TABLE stage.stages ADD  CONSTRAINT chk_stages_undo
    CHECK (undo_kind IN ('','auto','delete_pool','reset','build'));

CREATE INDEX idx_stages_source ON stage.stages (source_stage_id) WHERE source_stage_id IS NOT NULL;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS stage.idx_stages_source;
ALTER TABLE stage.stages DROP CONSTRAINT IF EXISTS chk_stages_undo;
ALTER TABLE stage.stages ADD  CONSTRAINT chk_stages_undo
    CHECK (undo_kind IN ('','auto','delete_pool','reset'));
ALTER TABLE stage.stages DROP CONSTRAINT IF EXISTS chk_stages_group_count;
ALTER TABLE stage.stages DROP CONSTRAINT IF EXISTS chk_stages_places;
ALTER TABLE stage.stages DROP CONSTRAINT IF EXISTS chk_stages_source_stage;
ALTER TABLE stage.stages DROP CONSTRAINT IF EXISTS chk_stages_rule;
ALTER TABLE stage.stages DROP CONSTRAINT IF EXISTS chk_stages_method;
ALTER TABLE stage.stages DROP CONSTRAINT IF EXISTS chk_stages_selector;
ALTER TABLE stage.stages DROP CONSTRAINT IF EXISTS chk_stages_source;
ALTER TABLE stage.stages DROP COLUMN IF EXISTS group_count;
ALTER TABLE stage.stages DROP COLUMN IF EXISTS layout_method;
ALTER TABLE stage.stages DROP COLUMN IF EXISTS place_to;
ALTER TABLE stage.stages DROP COLUMN IF EXISTS place_from;
ALTER TABLE stage.stages DROP COLUMN IF EXISTS selector_kind;
ALTER TABLE stage.stages DROP COLUMN IF EXISTS source_stage_id;
ALTER TABLE stage.stages DROP COLUMN IF EXISTS source_kind;
-- +goose StatementEnd
