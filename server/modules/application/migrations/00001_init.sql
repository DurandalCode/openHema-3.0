-- +goose Up
-- +goose StatementBegin
CREATE SCHEMA IF NOT EXISTS application;

-- events — журнал доменных событий заявки (источник истины, ADR 0011).
-- Append-only: строки никогда не изменяются и не удаляются.
CREATE TABLE application.events (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_id   UUID NOT NULL,
    -- Порядковый номер события в потоке (1-based); механизм оптимистичной
    -- конкуренции — см. UNIQUE ниже.
    version        INTEGER NOT NULL,
    event_type     TEXT NOT NULL,
    payload        JSONB NOT NULL DEFAULT '{}'::jsonb,
    actor_id       UUID NOT NULL,
    occurred_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_events_version CHECK (version >= 1),
    CONSTRAINT chk_events_payload_object CHECK (jsonb_typeof(payload) = 'object'),
    -- Оптимистичная конкуренция: две команды с одной ожидаемой версией не
    -- вставятся обе. Обслуживает и загрузку потока по (aggregate_id ORDER BY version).
    CONSTRAINT uq_events_stream_version UNIQUE (aggregate_id, version)
);

-- application_current — инлайн-проекция (read-model), обновляемая атомарно
-- (в одной транзакции) с вставкой события. Выводима из events; несёт
-- инвариант «нет активного дубля» через partial unique ниже (ADR 0011).
CREATE TABLE application.application_current (
    application_id    UUID PRIMARY KEY,
    nomination_id     UUID NOT NULL,
    tournament_id     UUID NOT NULL,
    applicant_user_id UUID NOT NULL,
    state             TEXT NOT NULL,
    version           INTEGER NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_current_state CHECK (state IN (
        'submitted',
        'awaiting_payment_confirmation',
        'paid',
        'registered',
        'withdrawn'
    ))
);

-- Не более одной активной (нетерминальной) заявки на пару (заявитель,
-- номинация). Терминальные состояния (withdrawn/registered) под индекс не
-- попадают — повторная заявка после отзыва возможна (FR-12/AC-12/AC-13).
CREATE UNIQUE INDEX uq_current_active_per_user_nomination
    ON application.application_current (applicant_user_id, nomination_id)
    WHERE state IN ('submitted', 'awaiting_payment_confirmation', 'paid');

-- Список заявок номинации, участники стартового листа, счётчики.
CREATE INDEX idx_current_nomination
    ON application.application_current (nomination_id, state);

-- «Мои заявки».
CREATE INDEX idx_current_applicant
    ON application.application_current (applicant_user_id);

-- Сводный экран заявок турнира с фильтром по статусу.
CREATE INDEX idx_current_tournament
    ON application.application_current (tournament_id, state);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS application.application_current;
DROP TABLE IF EXISTS application.events;
DROP SCHEMA IF EXISTS application;
-- +goose StatementEnd
