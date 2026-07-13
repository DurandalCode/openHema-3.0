-- +goose Up
-- +goose StatementBegin
CREATE SCHEMA IF NOT EXISTS fighter;

-- fighters — агрегат-корень «боец-персона турнира» (спека 0007): отвязан от
-- пользователей системы, один боец = один человек на турнир.
CREATE TABLE fighter.fighters (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Ссылка на турнир. Без FK на tournament.tournaments — кросс-схемные
    -- границы модулей (ADR 0002); целостность держит сервис.
    tournament_id      UUID NOT NULL,
    -- Снапшот на момент создания (из заявки либо введён admin), не резолвится
    -- на лету.
    name               TEXT NOT NULL,
    club               TEXT NOT NULL DEFAULT '',
    -- Технический ключ происхождения из заявки (applicant_user_id).
    -- NULL — боец заведён вручную, дедупу не подлежит.
    origin_user_id     UUID NULL,
    status             TEXT NOT NULL DEFAULT 'active',
    -- Заполнена только при status='withdrawn'.
    withdrawal_reason  TEXT NOT NULL DEFAULT '',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_fighters_name        CHECK (length(btrim(name)) > 0),
    CONSTRAINT chk_fighters_status      CHECK (status IN ('active', 'withdrawn')),
    CONSTRAINT chk_fighters_reason      CHECK (withdrawal_reason IN ('', 'injury', 'ban', 'other')),
    CONSTRAINT chk_fighters_reason_when CHECK (
        (status = 'withdrawn') OR (withdrawal_reason = '')
    )
);

-- Дедупликация: один боец на человека в пределах турнира (только для
-- пришедших из заявки; ручные — NULL, под констрейнт не попадают). Финальный
-- арбитр гонки параллельных регистраций (спека 0007, FR-5/NFR-4).
CREATE UNIQUE INDEX uq_fighters_origin_per_tournament
    ON fighter.fighters (tournament_id, origin_user_id)
    WHERE origin_user_id IS NOT NULL;

-- Ростер турнира (admin).
CREATE INDEX idx_fighters_tournament
    ON fighter.fighters (tournament_id);

-- participations — участие бойца в номинации (дочерняя сущность агрегата).
-- Одна строка на пару (боец, номинация); снятие с номинации — обратимое
-- переключение status, а не удаление строки (спека 0007, FR-8).
CREATE TABLE fighter.participations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fighter_id    UUID NOT NULL REFERENCES fighter.fighters(id) ON DELETE CASCADE,
    -- Без FK на nomination.nominations — кросс-схемные границы (ADR 0002).
    nomination_id UUID NOT NULL,
    status        TEXT NOT NULL DEFAULT 'active',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_participations_status CHECK (status IN ('active', 'removed')),
    CONSTRAINT uq_participations_fighter_nomination UNIQUE (fighter_id, nomination_id)
);

-- Публичный состав номинации.
CREATE INDEX idx_participations_nomination
    ON fighter.participations (nomination_id, status);

-- Join по бойцу (загрузка агрегата целиком).
CREATE INDEX idx_participations_fighter
    ON fighter.participations (fighter_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS fighter.participations;
DROP TABLE IF EXISTS fighter.fighters;
DROP SCHEMA IF EXISTS fighter;
-- +goose StatementEnd
