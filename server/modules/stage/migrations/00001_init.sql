-- +goose Up
-- +goose StatementBegin
CREATE SCHEMA IF NOT EXISTS stage;

-- stages — этап номинации (спека 0017): владелец статуса фиксации состава
-- и undo-снапшота (то, чем была pool_layouts), плюс идентичность и место
-- в схеме номинации. Уникальности по (nomination_id, position) нет
-- намеренно: параллельные ветки схемы делят позицию (ADR 0014, §1).
-- «Ровно один этап на номинацию» (FR-4) — инвариант сервиса (EnsureStage),
-- а не БД: ограничение в БД пришлось бы снимать уже в 0018.
CREATE TABLE stage.stages (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nomination_id UUID NOT NULL,               -- без кросс-схемного FK (ADR 0002)
    position      INTEGER NOT NULL DEFAULT 0,
    title         TEXT NOT NULL,
    type          TEXT NOT NULL DEFAULT 'groups',
    status        TEXT NOT NULL DEFAULT 'draft',
    -- undo последнего mutating-действия (спека 0009, решение №16): вид +
    -- JSONB-снапшот. '' — undo недоступен; 'auto' — {"fighter_ids":[...]};
    -- 'delete_pool' — {"number":N,"fighter_ids":[...]}; 'reset' —
    -- {"pools":[{"number":N,"fighter_ids":[...]},...]}.
    undo_kind     TEXT NOT NULL DEFAULT '',
    undo_data     JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_stages_position CHECK (position >= 0),
    CONSTRAINT chk_stages_type     CHECK (type IN ('groups')),
    CONSTRAINT chk_stages_status   CHECK (status IN ('draft','ready')),
    CONSTRAINT chk_stages_undo     CHECK (undo_kind IN ('','auto','delete_pool','reset'))
);
CREATE INDEX idx_stages_nomination ON stage.stages (nomination_id, position);

-- pools — группа (пул) внутри этапа. number уникален в пределах этапа
-- (спека 0009, FR-3: свободный номер; удалённые переиспользуются) — с
-- 0017 нумерация ведётся по этапу, а не по номинации. nomination_id —
-- осознанная денормализация: по нему идут номинационные чтения публичного
-- экрана, живого снапшота (0011/0014) и реконсиляция ростера
-- (PruneMembers, FR-9) — иначе каждое из них стало бы join через stages.
CREATE TABLE stage.pools (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stage_id      UUID NOT NULL REFERENCES stage.stages(id) ON DELETE CASCADE,
    nomination_id UUID NOT NULL,
    number        INTEGER NOT NULL,
    -- arena_id (спека 0011): NULL — пул не на арене; задан — «готовится к
    -- запуску». Без кросс-схемного FK на arena (ADR 0002). Статус пула не
    -- хранится — вычисляется из (статус этапа, arena_id, прогресс боёв),
    -- см. ComputePoolStatus.
    arena_id        UUID NULL,
    -- current_bout_id (спека 0013): указатель текущего боя пула, без
    -- кросс-схемного FK на bout.bouts. NULL — эффективный текущий бой
    -- резолвится сервисом как первый непроведённый по порядку.
    current_bout_id UUID NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_pools_number      CHECK (number >= 1),
    CONSTRAINT uq_pools_stage_number UNIQUE (stage_id, number)
);
CREATE INDEX idx_pools_stage      ON stage.pools (stage_id, number);
CREATE INDEX idx_pools_nomination ON stage.pools (nomination_id);
-- Инвариант «одна арена ↔ один пул» (спека 0011, FR-6/NFR-4): защищён на
-- уровне данных, а не только приложения — конкурентная постановка на одну
-- арену не должна посадить два пула разом. Partial-индекс не ограничивает
-- число пулов с arena_id IS NULL.
CREATE UNIQUE INDEX uq_pools_arena ON stage.pools (arena_id) WHERE arena_id IS NOT NULL;

-- pool_members — членство бойца в пуле. Инвариант (спека 0017, FR-7):
-- один боец — не более одного пула В ПРЕДЕЛАХ ЭТАПА (было: номинации).
-- Участие того же бойца в группах разных этапов — нормальное состояние,
-- это и есть переход из групп в следующий этап. Отсутствие членства =
-- «нераспределённый». Удаление пула каскадит членства.
CREATE TABLE stage.pool_members (
    pool_id       UUID NOT NULL REFERENCES stage.pools(id) ON DELETE CASCADE,
    stage_id      UUID NOT NULL,
    nomination_id UUID NOT NULL,               -- денормализация, см. pools
    fighter_id    UUID NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (pool_id, fighter_id),
    CONSTRAINT uq_members_stage_fighter UNIQUE (stage_id, fighter_id)
);
CREATE INDEX idx_members_stage      ON stage.pool_members (stage_id);
CREATE INDEX idx_members_nomination ON stage.pool_members (nomination_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS stage.pool_members;
DROP TABLE IF EXISTS stage.pools;
DROP TABLE IF EXISTS stage.stages;
DROP SCHEMA IF EXISTS stage;
-- +goose StatementEnd
