-- +goose Up
-- +goose StatementBegin
-- Пресет формата (спека 0020, FR-11): библиотека вне турнира и вне
-- номинации — отдельная таблица без FK на что-либо. jsonb-документ, а не
-- таблица `preset_stages` с детьми: пресет — значение целиком (FR-16, копия
-- по значению), читается и пишется разом, не джойнится и не мутируется
-- частями. Контракт документа типизирован в domain.FormatSpec и проверяется
-- ValidateFormatSpec на входе и на выходе (тот же приём, что у
-- NominationMetadata, 0003, и undo-снапшотов, 0009).
CREATE TABLE stage.format_presets (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT        NOT NULL,
    stages     JSONB       NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_presets_name   CHECK (length(btrim(name)) > 0),
    CONSTRAINT chk_presets_stages CHECK (jsonb_typeof(stages) = 'array'
                                         AND jsonb_array_length(stages) > 0)
);

-- Имя пресета уникально без учёта регистра и краевых пробелов (FR-12, AC-17).
CREATE UNIQUE INDEX uq_presets_name ON stage.format_presets (lower(btrim(name)));
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS stage.format_presets;
-- +goose StatementEnd
