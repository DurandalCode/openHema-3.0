-- +goose Up
-- +goose StatementBegin
ALTER TABLE nomination.nominations
    ADD COLUMN status TEXT NOT NULL DEFAULT 'open',
    ADD COLUMN closed_reason TEXT NULL,
    ADD COLUMN has_distributed_fighters BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE nomination.nominations
    ADD CONSTRAINT chk_nominations_status
        CHECK (status IN ('open', 'closed', 'active', 'finished')),
    ADD CONSTRAINT chk_nominations_closed_reason
        CHECK (closed_reason IS NULL OR closed_reason IN ('manual', 'drawing')),
    -- Причина закрытия задана ⟺ статус closed (внутренний инвариант,
    -- спека «Замечание о сводном статусе CLOSED»).
    ADD CONSTRAINT chk_nominations_closed_reason_presence
        CHECK ((status = 'closed') = (closed_reason IS NOT NULL));
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE nomination.nominations
    DROP CONSTRAINT IF EXISTS chk_nominations_closed_reason_presence,
    DROP CONSTRAINT IF EXISTS chk_nominations_closed_reason,
    DROP CONSTRAINT IF EXISTS chk_nominations_status;

ALTER TABLE nomination.nominations
    DROP COLUMN IF EXISTS has_distributed_fighters,
    DROP COLUMN IF EXISTS closed_reason,
    DROP COLUMN IF EXISTS status;
-- +goose StatementEnd
