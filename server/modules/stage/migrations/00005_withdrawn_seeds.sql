-- +goose Up
-- +goose StatementBegin
-- withdrawn_seeds — «память» о членстве в пуле бойца, выведенного с
-- турнира, пока стадия пула ещё draft (спека 0040, FR-4). Композитный
-- PK: боец может быть одновременно посеян в стадиях разных номинаций.
-- Вне draft запись не заводится — там членство и так не подчищается
-- лениво (assembleLayout фильтрует его только для чтения), и возврат
-- уже работает без этой таблицы.
CREATE TABLE stage.withdrawn_seeds (
    fighter_id    UUID NOT NULL,
    nomination_id UUID NOT NULL,
    stage_id      UUID NOT NULL,
    pool_id       UUID NOT NULL,
    withdrawn_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (fighter_id, nomination_id)
);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS stage.withdrawn_seeds;
-- +goose StatementEnd
