-- +goose Up
-- +goose StatementBegin
-- last_freed_at — момент последнего освобождения площадки (спека 0043,
-- FR-26): единственный факт, без которого предыдущие спеки отказались от
-- «Свободна · 4 мин» на табло. Проставляется сервисом stage при снятии пула
-- (UnseatPool) — единственном действии, которое площадку освобождает.
-- NULL = площадку никогда не освобождали (в сочетании с отсутствием пула на
-- ней сейчас — состояние «ждёт первый пул»).
ALTER TABLE arena.arenas ADD COLUMN last_freed_at TIMESTAMPTZ NULL;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE arena.arenas DROP COLUMN IF EXISTS last_freed_at;
-- +goose StatementEnd
