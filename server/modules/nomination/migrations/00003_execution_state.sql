-- +goose Up
-- +goose StatementBegin
-- Ось приёма заявок больше не может принимать значения фазы боёв: они
-- переехали в execution_state (спека 0021, NFR-4).
ALTER TABLE nomination.nominations
    ADD COLUMN execution_state TEXT NOT NULL DEFAULT 'none';

ALTER TABLE nomination.nominations
    ADD CONSTRAINT chk_nominations_execution_state
        CHECK (execution_state IN ('none', 'active', 'finished'));

ALTER TABLE nomination.nominations
    DROP CONSTRAINT chk_nominations_status,
    ADD CONSTRAINT chk_nominations_status CHECK (status IN ('open', 'closed'));
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE nomination.nominations
    DROP CONSTRAINT IF EXISTS chk_nominations_status,
    ADD CONSTRAINT chk_nominations_status
        CHECK (status IN ('open', 'closed', 'active', 'finished'));

ALTER TABLE nomination.nominations
    DROP CONSTRAINT IF EXISTS chk_nominations_execution_state,
    DROP COLUMN IF EXISTS execution_state;
-- +goose StatementEnd
