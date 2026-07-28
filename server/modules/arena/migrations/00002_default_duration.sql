-- +goose Up
-- +goose StatementBegin
ALTER TABLE arena.arenas
    ADD COLUMN default_duration_seconds INTEGER NOT NULL DEFAULT 90
        CONSTRAINT chk_arenas_default_duration CHECK (default_duration_seconds BETWEEN 1 AND 3600);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE arena.arenas DROP COLUMN IF EXISTS default_duration_seconds;
-- +goose StatementEnd
