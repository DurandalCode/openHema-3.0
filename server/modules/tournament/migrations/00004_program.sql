-- +goose Up
-- +goose StatementBegin
-- program_days / program_items — программа турнира по дням (спека 0040,
-- FR-14). Дочерние таблицы (не jsonb): пункты упорядочены и редактируются
-- по одному в форме админки, jsonb-блоб усложнил бы точечную правку
-- порядка без пользы (в отличие от contacts, здесь есть вложенный уровень
-- день→пункты, поэтому решение — не «buttom как в 0037», а отдельные
-- таблицы).
CREATE TABLE tournament.program_days (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID NOT NULL,
    event_date    DATE NOT NULL,
    position      INTEGER NOT NULL,
    CONSTRAINT uq_program_days_tournament_position UNIQUE (tournament_id, position)
);
CREATE INDEX idx_program_days_tournament ON tournament.program_days (tournament_id, position);

CREATE TABLE tournament.program_items (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    day_id     UUID NOT NULL REFERENCES tournament.program_days(id) ON DELETE CASCADE,
    position   INTEGER NOT NULL,
    time_label TEXT NOT NULL DEFAULT '',
    text       TEXT NOT NULL,
    CONSTRAINT chk_program_items_text CHECK (length(btrim(text)) > 0),
    CONSTRAINT uq_program_items_day_position UNIQUE (day_id, position)
);
CREATE INDEX idx_program_items_day ON tournament.program_items (day_id, position);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS tournament.program_items;
DROP TABLE IF EXISTS tournament.program_days;
-- +goose StatementEnd
