-- +goose Up
-- +goose StatementBegin
-- Спека 0047 (FR-7): журнал заведения записей встроенного каталога
-- пресетов формата. Отдельная таблица, не колонка на
-- stage.format_presets, — журнал обязан пережить удаление самого пресета
-- (иначе удалённая встроенная запись заводилась бы заново при каждом
-- старте сервера). Данными миграция не сеет: каталог — Go-константа
-- (domain.BuiltinPresets), дублировать его текст в SQL значило бы завести
-- второй источник истины.
CREATE TABLE stage.builtin_preset_seeds (
    preset_key TEXT PRIMARY KEY,
    seeded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_seed_key CHECK (length(btrim(preset_key)) > 0)
);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS stage.builtin_preset_seeds;
-- +goose StatementEnd
