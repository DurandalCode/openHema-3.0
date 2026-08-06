-- +goose Up
-- +goose StatementBegin
-- Тип этапа расширяется вторым значением (спека 0018, FR-1).
ALTER TABLE stage.stages DROP CONSTRAINT chk_stages_type;
ALTER TABLE stage.stages ADD CONSTRAINT chk_stages_type
    CHECK (type IN ('groups','bracket'));

-- Конфиг этапа-сетки (ADR 0014, §1a): две скалярные настройки —
-- отдельными колонками, а не jsonb: их можно проверить CHECK-ом, а
-- типизированный jsonb оправдан там, где полей много и они разнородны
-- (метаданные номинации, 0003). Когда конфигов станет больше (план 0020) —
-- переезд на jsonb отдельным шагом.
ALTER TABLE stage.stages ADD COLUMN bracket_size INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stage.stages ADD COLUMN third_place  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE stage.stages ADD CONSTRAINT chk_stages_bracket
    CHECK ((type = 'groups'  AND bracket_size = 0 AND third_place = false)
        OR (type = 'bracket' AND bracket_size IN (4,8,16,32)));

-- Слот посева (спека 0018, FR-7): членство в контейнере первого круга +
-- номер слота. NULL — членство группы (слотов там нет). Уникальность
-- слота — в пределах контейнера (пул половины круга); уникальность бойца в
-- пределах этапа уже обеспечена uq_members_stage_fighter (0017, FR-7).
ALTER TABLE stage.pool_members ADD COLUMN slot INTEGER NULL;
ALTER TABLE stage.pool_members ADD CONSTRAINT chk_members_slot
    CHECK (slot IS NULL OR slot >= 1);
CREATE UNIQUE INDEX uq_members_pool_slot
    ON stage.pool_members (pool_id, slot) WHERE slot IS NOT NULL;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS stage.uq_members_pool_slot;
ALTER TABLE stage.pool_members DROP CONSTRAINT IF EXISTS chk_members_slot;
ALTER TABLE stage.pool_members DROP COLUMN IF EXISTS slot;
ALTER TABLE stage.stages DROP CONSTRAINT IF EXISTS chk_stages_bracket;
ALTER TABLE stage.stages DROP COLUMN IF EXISTS third_place;
ALTER TABLE stage.stages DROP COLUMN IF EXISTS bracket_size;
ALTER TABLE stage.stages DROP CONSTRAINT IF EXISTS chk_stages_type;
ALTER TABLE stage.stages ADD CONSTRAINT chk_stages_type CHECK (type IN ('groups'));
-- +goose StatementEnd
