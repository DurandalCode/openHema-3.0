-- +goose Up
-- +goose StatementBegin
-- Доп. поля заявки (спека 0006): клуб бойца, признак нужды в экипировке и
-- переопределение отображаемого имени (админская правка). Журнал events не
-- меняется — новые данные едут в payload событий submitted/amended (jsonb);
-- меняется только инлайн-проекция, читаемая списками/счётчиками.
ALTER TABLE application.application_current
    ADD COLUMN club                    TEXT NOT NULL DEFAULT '',
    ADD COLUMN needs_equipment         BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN applicant_name_override TEXT NOT NULL DEFAULT '';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE application.application_current
    DROP COLUMN applicant_name_override,
    DROP COLUMN needs_equipment,
    DROP COLUMN club;
-- +goose StatementEnd
