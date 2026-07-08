-- +goose Up
-- +goose StatementBegin
-- Переход к многодневным турнирам: переименование event_at → event_start_at
-- (wire-совместимо — поле 4 proto) + добавление event_end_at (поле 10 proto).
ALTER TABLE tournament.tournaments
    RENAME COLUMN event_at TO event_start_at;

ALTER TABLE tournament.tournaments
    ADD COLUMN event_end_at TIMESTAMPTZ NULL;

-- CHECK: конец проведения не раньше начала. Допускает NULL (однодневный или
-- без даты) и равенство (то же мгновение — корректный вырожденный диапазон).
-- Изменяем constraint (в 00001 был chk_contacts_* — отдельная таблица).
ALTER TABLE tournament.tournaments
    ADD CONSTRAINT chk_event_range
        CHECK (event_end_at IS NULL OR event_start_at IS NULL OR event_end_at >= event_start_at);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE tournament.tournaments DROP CONSTRAINT IF EXISTS chk_event_range;
ALTER TABLE tournament.tournaments DROP COLUMN IF EXISTS event_end_at;
ALTER TABLE tournament.tournaments RENAME COLUMN event_start_at TO event_at;
-- +goose StatementEnd