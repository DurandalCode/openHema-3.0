-- +goose Up
-- +goose StatementBegin

-- merged_into_id — обратная проекция слияния дублей (спека 0040, FR-10):
-- ссылка на запись, в которую слит этот боец. NULL, пока боец не объединён.
-- Без FK на fighters(id) той же таблицы: cross-row self-reference без FK
-- допустим (не кросс-схемная граница ADR 0002), а сервис уже гарантирует
-- существование target — FK добавил бы только защиту от прямых SQL-правок
-- (plan.md, «modules/fighter»).
ALTER TABLE fighter.fighters
    ADD COLUMN merged_into_id UUID NULL;

-- chk_fighters_status (00001_init.sql) допускает только 'active'/'withdrawn'
-- и заблокирует запись status='merged'. Отклонение от буквального DDL
-- plan.md: там новый chk_fighters_status_merge просто добавляется поверх, но
-- старый одноимённый по смыслу констрейнт при этом не снимается — заменяем
-- его именно этим более широким констрейнтом, а не дублируем.
ALTER TABLE fighter.fighters
    DROP CONSTRAINT chk_fighters_status;

ALTER TABLE fighter.fighters
    ADD CONSTRAINT chk_fighters_status_merge
        CHECK (status IN ('active', 'withdrawn', 'merged')),
    ADD CONSTRAINT chk_fighters_merged_into_when
        CHECK ((status = 'merged') = (merged_into_id IS NOT NULL));

CREATE INDEX idx_fighters_merged_into ON fighter.fighters (merged_into_id)
    WHERE merged_into_id IS NOT NULL;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS fighter.idx_fighters_merged_into;

ALTER TABLE fighter.fighters
    DROP CONSTRAINT IF EXISTS chk_fighters_merged_into_when,
    DROP CONSTRAINT IF EXISTS chk_fighters_status_merge;

ALTER TABLE fighter.fighters
    ADD CONSTRAINT chk_fighters_status CHECK (status IN ('active', 'withdrawn'));

ALTER TABLE fighter.fighters
    DROP COLUMN IF EXISTS merged_into_id;
-- +goose StatementEnd
