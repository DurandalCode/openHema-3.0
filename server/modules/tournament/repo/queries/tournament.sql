-- name: GetActiveTournament :one
SELECT id, title, description, event_start_at, event_end_at, emblem_url, is_active, created_at, updated_at,
       chief_judge, regulations_url, venue_name, venue_address, entry_fee_minor, entry_fee_currency,
       regulations_file_id, regulations_file_name, regulations_file_size,
       emblem_file_id, emblem_file_name, emblem_file_size,
       notify_application_state, notify_pool_seated
FROM tournament.tournaments
WHERE is_active = TRUE
LIMIT 1;

-- name: ListContactsByTournament :many
SELECT id, tournament_id, type, value, position
FROM tournament.contacts
WHERE tournament_id = $1
ORDER BY position ASC;

-- name: UpdateActiveTournament :one
UPDATE tournament.tournaments
SET
    title               = $1,
    description         = $2,
    event_start_at      = $3,
    event_end_at        = $4,
    emblem_url          = $5,
    chief_judge         = $6,
    regulations_url     = $7,
    venue_name          = $8,
    venue_address       = $9,
    entry_fee_minor     = $10,
    entry_fee_currency  = $11,
    notify_application_state = $12,
    notify_pool_seated       = $13,
    -- Инвариант «файл ⊕ ссылка» (ADR 0019 п.5, FR-34): непустая ссылка
    -- атомарно освобождает поле файла того же вида в этом же UPDATE —
    -- иначе CHECK chk_regulations_one_of/chk_emblem_one_of отклонит
    -- запись. Пустая ссылка поля файла не трогает: загрузка/удаление
    -- файла идут отдельными узкими запросами (SetRegulationsFile,
    -- ClearRegulationsFile, SetEmblemFile, ClearEmblemFile ниже) —
    -- обычная правка профиля через эту ручку не должна молча стирать
    -- ранее загруженный файл, если ссылку никто не задавал.
    regulations_file_id   = CASE WHEN $7 <> '' THEN '' ELSE regulations_file_id END,
    regulations_file_name = CASE WHEN $7 <> '' THEN '' ELSE regulations_file_name END,
    regulations_file_size = CASE WHEN $7 <> '' THEN 0 ELSE regulations_file_size END,
    emblem_file_id         = CASE WHEN $5 <> '' THEN '' ELSE emblem_file_id END,
    emblem_file_name       = CASE WHEN $5 <> '' THEN '' ELSE emblem_file_name END,
    emblem_file_size       = CASE WHEN $5 <> '' THEN 0 ELSE emblem_file_size END,
    updated_at          = now()
WHERE is_active = TRUE
RETURNING id, title, description, event_start_at, event_end_at, emblem_url, is_active, created_at, updated_at,
          chief_judge, regulations_url, venue_name, venue_address, entry_fee_minor, entry_fee_currency,
          regulations_file_id, regulations_file_name, regulations_file_size,
          emblem_file_id, emblem_file_name, emblem_file_size,
          notify_application_state, notify_pool_seated;

-- name: SetRegulationsFile :one
-- Загружает новый файл регламента и атомарно освобождает ссылку (FR-34).
-- Контакты/программу/остальные поля профиля не трогает — узкая операция,
-- в отличие от UpdateActiveTournament (полная форма профиля).
UPDATE tournament.tournaments
SET regulations_file_id   = $1,
    regulations_file_name = $2,
    regulations_file_size = $3,
    regulations_url       = '',
    updated_at            = now()
WHERE is_active = TRUE
RETURNING id, title, description, event_start_at, event_end_at, emblem_url, is_active, created_at, updated_at,
          chief_judge, regulations_url, venue_name, venue_address, entry_fee_minor, entry_fee_currency,
          regulations_file_id, regulations_file_name, regulations_file_size,
          emblem_file_id, emblem_file_name, emblem_file_size,
          notify_application_state, notify_pool_seated;

-- name: ClearRegulationsFile :one
UPDATE tournament.tournaments
SET regulations_file_id   = '',
    regulations_file_name = '',
    regulations_file_size = 0,
    updated_at            = now()
WHERE is_active = TRUE
RETURNING id, title, description, event_start_at, event_end_at, emblem_url, is_active, created_at, updated_at,
          chief_judge, regulations_url, venue_name, venue_address, entry_fee_minor, entry_fee_currency,
          regulations_file_id, regulations_file_name, regulations_file_size,
          emblem_file_id, emblem_file_name, emblem_file_size,
          notify_application_state, notify_pool_seated;

-- name: SetEmblemFile :one
-- Загружает новый файл эмблемы и атомарно освобождает ссылку (FR-34).
UPDATE tournament.tournaments
SET emblem_file_id   = $1,
    emblem_file_name = $2,
    emblem_file_size = $3,
    emblem_url       = '',
    updated_at       = now()
WHERE is_active = TRUE
RETURNING id, title, description, event_start_at, event_end_at, emblem_url, is_active, created_at, updated_at,
          chief_judge, regulations_url, venue_name, venue_address, entry_fee_minor, entry_fee_currency,
          regulations_file_id, regulations_file_name, regulations_file_size,
          emblem_file_id, emblem_file_name, emblem_file_size,
          notify_application_state, notify_pool_seated;

-- name: ClearEmblemFile :one
UPDATE tournament.tournaments
SET emblem_file_id   = '',
    emblem_file_name = '',
    emblem_file_size = 0,
    updated_at       = now()
WHERE is_active = TRUE
RETURNING id, title, description, event_start_at, event_end_at, emblem_url, is_active, created_at, updated_at,
          chief_judge, regulations_url, venue_name, venue_address, entry_fee_minor, entry_fee_currency,
          regulations_file_id, regulations_file_name, regulations_file_size,
          emblem_file_id, emblem_file_name, emblem_file_size,
          notify_application_state, notify_pool_seated;

-- name: DeleteContactsByTournament :exec
DELETE FROM tournament.contacts
WHERE tournament_id = $1;

-- name: InsertContact :one
INSERT INTO tournament.contacts (tournament_id, type, value, position)
VALUES ($1, $2, $3, $4)
RETURNING id, tournament_id, type, value, position;

-- name: ListProgramDaysByTournament :many
SELECT id, tournament_id, event_date, position
FROM tournament.program_days
WHERE tournament_id = $1
ORDER BY position ASC;

-- name: ListProgramItemsByTournament :many
SELECT pi.id, pi.day_id, pi.position, pi.time_label, pi.text
FROM tournament.program_items pi
JOIN tournament.program_days pd ON pd.id = pi.day_id
WHERE pd.tournament_id = $1
ORDER BY pd.position ASC, pi.position ASC;

-- name: DeleteProgramDaysByTournament :exec
DELETE FROM tournament.program_days
WHERE tournament_id = $1;

-- name: InsertProgramDay :one
INSERT INTO tournament.program_days (tournament_id, event_date, position)
VALUES ($1, $2, $3)
RETURNING id, tournament_id, event_date, position;

-- name: InsertProgramItem :one
INSERT INTO tournament.program_items (day_id, position, time_label, text)
VALUES ($1, $2, $3, $4)
RETURNING id, day_id, position, time_label, text;