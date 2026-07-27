-- +goose Up
-- +goose StatementBegin
-- Инкремент 2026-07-20 (спека 0013): жизненный цикл боя и текущий бой на
-- арене. Модуль bout становится event-sourced (ADR 0011): bout.bouts
-- остаётся инлайн-проекцией (текущее состояние агрегата), источник истины —
-- новый журнал bout.bout_events.

-- Проекция боя расширяется состоянием/счётом/версией потока (ADR 0011 п.4:
-- одна строка = текущее состояние агрегата). state по умолчанию
-- not_started, счёт 0:0 — совпадает с состоянием сразу после scheduled
-- (спека 0013, FR-1/FR-2).
ALTER TABLE bout.bouts
    ADD COLUMN state    TEXT    NOT NULL DEFAULT 'not_started',
    ADD COLUMN score_a  INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN score_b  INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN version  INTEGER NOT NULL DEFAULT 0;

ALTER TABLE bout.bouts
    ADD CONSTRAINT chk_bouts_state CHECK (state IN ('not_started', 'in_progress', 'finished')),
    ADD CONSTRAINT chk_bouts_score_a_non_negative CHECK (score_a >= 0),
    ADD CONSTRAINT chk_bouts_score_b_non_negative CHECK (score_b >= 0);

-- bout_events — append-only журнал доменных фактов боя (источник истины,
-- ADR 0011 п.2): начат/введён счёт/завершён/переоткрыт/сброшен. Строки
-- никогда не изменяются и не удаляются (кроме каскада при регенерации боёв
-- пула, см. FK ниже).
CREATE TABLE bout.bout_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bout_id     UUID NOT NULL REFERENCES bout.bouts (id) ON DELETE CASCADE,
    -- Порядковый номер события в потоке (1-based) — механизм оптимистичной
    -- конкуренции, см. UNIQUE ниже (ADR 0011 п.3).
    version     INTEGER NOT NULL,
    event_type  TEXT NOT NULL CHECK (event_type IN (
        'scheduled', 'started', 'scored', 'finished', 'reopened', 'reset'
    )),
    payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- actor_id — кто (nullable: у scheduled нет человека-инициатора, его
    -- формирует система при генерации боёв пула, спека 0010).
    actor_id    UUID,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_bout_events_version CHECK (version >= 1),
    CONSTRAINT chk_bout_events_payload_object CHECK (jsonb_typeof(payload) = 'object'),
    CONSTRAINT uq_bout_events_version UNIQUE (bout_id, version)
);

-- Загрузка потока боя по версии (Load) — обслуживается тем же индексом,
-- что и UNIQUE выше, но именованный индекс на (bout_id, version) явно
-- документирует паттерн доступа.
CREATE INDEX idx_bout_events_bout ON bout.bout_events (bout_id, version);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS bout.bout_events;

ALTER TABLE bout.bouts
    DROP CONSTRAINT IF EXISTS chk_bouts_state,
    DROP CONSTRAINT IF EXISTS chk_bouts_score_a_non_negative,
    DROP CONSTRAINT IF EXISTS chk_bouts_score_b_non_negative;

ALTER TABLE bout.bouts
    DROP COLUMN IF EXISTS state,
    DROP COLUMN IF EXISTS score_a,
    DROP COLUMN IF EXISTS score_b,
    DROP COLUMN IF EXISTS version;
-- +goose StatementEnd
