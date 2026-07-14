-- +goose Up
-- +goose StatementBegin
-- Инкремент 2026-07-14: undo для «Сбросить раскладку» (FR-4a/FR-7a).
-- Расширяем CHECK undo_kind третьим значением 'reset'. Существующие строки
-- undo_data корректны: 'reset' ещё никто не писал (его не было в CHECK).
-- Новой колонки нет — 'reset' использует существующую undo_data JSONB с новой
-- формой {"pools":[{"number":N,"fighter_ids":[...]},...]}.
ALTER TABLE pool.pool_layouts
    DROP CONSTRAINT chk_layouts_undo,
    ADD CONSTRAINT chk_layouts_undo CHECK (undo_kind IN ('','auto','delete_pool','reset'));
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE pool.pool_layouts
    DROP CONSTRAINT chk_layouts_undo,
    ADD CONSTRAINT chk_layouts_undo CHECK (undo_kind IN ('','auto','delete_pool'));
-- +goose StatementEnd
