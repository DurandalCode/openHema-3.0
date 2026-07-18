-- +goose Up
-- +goose StatementBegin
CREATE SCHEMA IF NOT EXISTS bout;

-- bouts — один бой = пара бойцов внутри пула + место в порядке проведения.
-- Без FK на pool.pools (кросс-схемные FK запрещены, ADR 0002) — pool_id
-- денормализован как обычный UUID; nomination_id тоже денормализован, чтобы
-- ReplaceForNomination мог удалять «все бои номинации» одним запросом без
-- join на схему pool. Имя/клуб бойца хранятся денормализованными прямо в
-- bouts (снапшот на момент формирования, спека решение №5) — отдельная
-- таблица дала бы только лишний join без выгоды.
CREATE TABLE bout.bouts (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_id          UUID NOT NULL,
    nomination_id    UUID NOT NULL,
    round_number     INTEGER NOT NULL,
    sequence_number  INTEGER NOT NULL,
    fighter_a_id     UUID NOT NULL,
    fighter_a_name   TEXT NOT NULL,
    fighter_a_club   TEXT NOT NULL DEFAULT '',
    fighter_b_id     UUID NOT NULL,
    fighter_b_name   TEXT NOT NULL,
    fighter_b_club   TEXT NOT NULL DEFAULT '',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_bouts_distinct_fighters CHECK (fighter_a_id <> fighter_b_id),
    CONSTRAINT chk_bouts_round_positive    CHECK (round_number >= 1),
    CONSTRAINT chk_bouts_sequence_positive CHECK (sequence_number >= 1),
    CONSTRAINT uq_bouts_pool_sequence UNIQUE (pool_id, sequence_number)
);
CREATE INDEX idx_bouts_pool_sequence ON bout.bouts (pool_id, sequence_number);
CREATE INDEX idx_bouts_nomination    ON bout.bouts (nomination_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS bout.bouts;
DROP SCHEMA IF EXISTS bout;
-- +goose StatementEnd
