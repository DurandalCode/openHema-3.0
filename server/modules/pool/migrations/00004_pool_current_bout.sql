-- +goose Up
-- +goose StatementBegin
-- Инкремент 2026-07-20 (спека 0013): ведение текущего боя пула на арене.
--
-- current_bout_id — указатель текущего боя пула (FR-7/FR-8/FR-9): без
-- кросс-схемного FK на bout.bouts (ADR 0002, денормализованный uuid, как
-- arena_id денормализован без FK на схему arena). NULL — указатель не
-- задан, эффективный текущий бой резолвится сервисом как первый
-- непроведённый по порядку (лениво, план «Модуль pool»). Исполнительный
-- статус пула (preparing/active/finished) НЕ хранится отдельной колонкой —
-- вычисляется из (arena_id, прогресс боёв), см. ComputePoolStatus: нет
-- риска рассинхрона (0011 NFR-1).
ALTER TABLE pool.pools ADD COLUMN current_bout_id UUID NULL;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE pool.pools DROP COLUMN IF EXISTS current_bout_id;
-- +goose StatementEnd
