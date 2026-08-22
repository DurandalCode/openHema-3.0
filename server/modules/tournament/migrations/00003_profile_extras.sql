-- +goose Up
-- +goose StatementBegin
-- Расширение профиля турнира: главный судья, регламент, место проведения,
-- взнос за участие в одной номинации (спека 0037, FR-18..FR-22).
ALTER TABLE tournament.tournaments
    ADD COLUMN chief_judge        TEXT   NOT NULL DEFAULT '',
    ADD COLUMN regulations_url    TEXT   NOT NULL DEFAULT '',
    ADD COLUMN venue_name         TEXT   NOT NULL DEFAULT '',
    ADD COLUMN venue_address      TEXT   NOT NULL DEFAULT '',
    -- NULL = «взнос не задан», 0 = «участие бесплатное» (FR-21).
    ADD COLUMN entry_fee_minor    BIGINT NULL,
    ADD COLUMN entry_fee_currency TEXT   NOT NULL DEFAULT '';

-- Симметрично в обе стороны: NULL >= 0 в SQL — unknown, не false, поэтому
-- «валюта без суммы» без явного IS NOT NULL молча проходило бы CHECK
-- (three-valued logic: OR с NULL даёт NULL, а не false — констрейнт
-- пропускает). entry_fee_minor IS NOT NULL делает обе стороны явными.
ALTER TABLE tournament.tournaments
    ADD CONSTRAINT chk_entry_fee CHECK (
        (entry_fee_minor IS NULL AND entry_fee_currency = '')
        OR (entry_fee_minor IS NOT NULL AND entry_fee_minor >= 0 AND entry_fee_currency <> '')
    );
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE tournament.tournaments DROP CONSTRAINT IF EXISTS chk_entry_fee;
ALTER TABLE tournament.tournaments
    DROP COLUMN IF EXISTS entry_fee_currency,
    DROP COLUMN IF EXISTS entry_fee_minor,
    DROP COLUMN IF EXISTS venue_address,
    DROP COLUMN IF EXISTS venue_name,
    DROP COLUMN IF EXISTS regulations_url,
    DROP COLUMN IF EXISTS chief_judge;
-- +goose StatementEnd
