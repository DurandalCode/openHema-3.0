-- +goose Up
-- +goose StatementBegin
ALTER TABLE tournament.tournaments
    -- Идентификатор объекта в хранилище (см. ADR 0019), '' — файла нет.
    -- Не путь на диске: путь — деталь адаптера, домен знает только id.
    ADD COLUMN regulations_file_id   TEXT   NOT NULL DEFAULT '',
    -- Имя и размер — для интерфейса («Регламент.pdf · 2,4 МБ») и для
    -- заголовков отдачи; спрашивать их у хранилища на каждый показ
    -- профиля было бы лишним обращением к диску.
    ADD COLUMN regulations_file_name TEXT   NOT NULL DEFAULT '',
    ADD COLUMN regulations_file_size BIGINT NOT NULL DEFAULT 0,
    -- Эмблема файлом (FR-31, решение 10) — те же три колонки. Плоские
    -- колонки, а не дочерняя таблица «файлы турнира»: полей ровно два,
    -- они принадлежат самому профилю и живут его жизнью; таблица
    -- потребовалась бы, если бы файлы стали списком (галерея — вне
    -- скоупа).
    ADD COLUMN emblem_file_id        TEXT   NOT NULL DEFAULT '',
    ADD COLUMN emblem_file_name      TEXT   NOT NULL DEFAULT '',
    ADD COLUMN emblem_file_size      BIGINT NOT NULL DEFAULT 0,
    -- Глобальные переключатели уведомлений (FR-19, решение 7 спеки):
    -- активный турнир один, виды говорят о событиях турнира. Колонки по
    -- той же причине, что и в auth.users.
    ADD COLUMN notify_application_state BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN notify_pool_seated       BOOLEAN NOT NULL DEFAULT FALSE;

-- Источник ровно один у каждого поля (FR-34): ссылка и файл взаимно
-- исключаются. Существующие строки проходят: file_id по умолчанию ''.
ALTER TABLE tournament.tournaments
    ADD CONSTRAINT chk_regulations_one_of
        CHECK (regulations_url = '' OR regulations_file_id = ''),
    ADD CONSTRAINT chk_emblem_one_of
        CHECK (emblem_url = '' OR emblem_file_id = '');

-- Имя и размер имеют смысл только при заданном файле.
ALTER TABLE tournament.tournaments
    ADD CONSTRAINT chk_regulations_file_fields
        CHECK ((regulations_file_id = '') = (regulations_file_name = '' AND regulations_file_size = 0)),
    ADD CONSTRAINT chk_emblem_file_fields
        CHECK ((emblem_file_id = '') = (emblem_file_name = '' AND emblem_file_size = 0));
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE tournament.tournaments
    DROP CONSTRAINT IF EXISTS chk_regulations_one_of,
    DROP CONSTRAINT IF EXISTS chk_emblem_one_of,
    DROP CONSTRAINT IF EXISTS chk_regulations_file_fields,
    DROP CONSTRAINT IF EXISTS chk_emblem_file_fields;

ALTER TABLE tournament.tournaments
    DROP COLUMN IF EXISTS regulations_file_id,
    DROP COLUMN IF EXISTS regulations_file_name,
    DROP COLUMN IF EXISTS regulations_file_size,
    DROP COLUMN IF EXISTS emblem_file_id,
    DROP COLUMN IF EXISTS emblem_file_name,
    DROP COLUMN IF EXISTS emblem_file_size,
    DROP COLUMN IF EXISTS notify_application_state,
    DROP COLUMN IF EXISTS notify_pool_seated;
-- +goose StatementEnd
