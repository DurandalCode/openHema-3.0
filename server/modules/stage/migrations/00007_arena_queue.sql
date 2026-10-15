-- +goose Up
-- +goose StatementBegin
-- Очередь пулов на арену (спека 0063, ADR 0024). Отдельная таблица, а не
-- колонки stage.pools: позиция уникальна в пределах арены и при
-- переупорядочивании/уплотнении временно дублируется — для этого нужен
-- DEFERRABLE UNIQUE, который недоступен partial-индексу pools. PK по pool_id
-- держит инвариант «пул — не более чем в одной очереди» (FR-2). arena_id без
-- кросс-схемного FK на arena (ADR 0002), как pools.arena_id. position — 1..N
-- без пропусков в пределах арены (инвариант repo: каждое удаление уплотняет
-- очередь). Инвариант «стоящий на арене пул не в очереди» держит транзакция
-- SeatPool, а не CHECK между таблицами.
CREATE TABLE stage.arena_queue (
    pool_id    UUID PRIMARY KEY REFERENCES stage.pools(id) ON DELETE CASCADE,
    arena_id   UUID NOT NULL,
    position   INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_arena_queue_position CHECK (position >= 1),
    CONSTRAINT uq_arena_queue_position UNIQUE (arena_id, position) DEFERRABLE INITIALLY DEFERRED
);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS stage.arena_queue;
-- +goose StatementEnd
