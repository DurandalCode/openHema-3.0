-- +goose Up
-- +goose StatementBegin
-- Спека 0047 (FR-7/FR-10): журнал заведения записей встроенного каталога
-- пресетов формата. Отдельная таблица, не колонка на
-- stage.format_presets, — журнал обязан пережить удаление самого пресета
-- (иначе удалённая встроенная запись заводилась бы заново при каждом
-- старте сервера). Данными миграция не сеет: каталог — Go-константа
-- (domain.BuiltinPresets), дублировать его текст в SQL значило бы завести
-- второй источник истины.
--
-- preset_id — id заведённого пресета (NULL, если заведение было пропущено
-- по занятому имени, FR-9). ON DELETE SET NULL — при удалении пресета
-- журнальная строка остаётся (ключ по-прежнему «когда-то заводился», FR-7),
-- обнуляется только ссылка. Это то, что отличает автоматическое заведение
-- при старте (SeededPresetKeys — все ключи журнала, без разбора preset_id)
-- от явного восстановления (LiveSeededPresetKeys — только с непустым
-- preset_id): переименованный пресет сохраняет свой id и остаётся «живым»,
-- поэтому восстановление видит его как уже существующий и не заводит
-- дубликат под старым именем (FR-10), а удалённый теряет ссылку и заводится
-- заново.
CREATE TABLE stage.builtin_preset_seeds (
    preset_key TEXT PRIMARY KEY,
    preset_id  UUID REFERENCES stage.format_presets(id) ON DELETE SET NULL,
    seeded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_seed_key CHECK (length(btrim(preset_key)) > 0)
);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS stage.builtin_preset_seeds;
-- +goose StatementEnd
