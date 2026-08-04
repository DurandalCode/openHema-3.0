-- Спека 0017: этапы номинации. Расширено спекой 0018 (этап-сетка):
-- bracket_size/third_place в stages, slot в pool_members.

-- name: GetStageByNomination :one
-- Канонический этап номинации (в этой спеке — не более одного). LIMIT 1 +
-- ORDER BY страхует :one от паники sqlc, если данные когда-нибудь окажутся
-- в состоянии "несколько этапов" (спека 0018) — на выборку самого раннего.
SELECT id, nomination_id, position, title, type, status, undo_kind, undo_data, bracket_size, third_place
FROM stage.stages
WHERE nomination_id = $1
ORDER BY position, created_at
LIMIT 1;

-- name: InsertStage :one
-- Создаёт КАНОНИЧЕСКИЙ (групповой) этап номинации (пара к
-- GetStageByNomination под EnsureStage — get-or-create делается в Go:
-- SELECT, если не найдено — INSERT). bracket_size/third_place остаются
-- дефолтами (0/false) — групповой этап их не использует (chk_stages_bracket).
INSERT INTO stage.stages (nomination_id, position, title, type, status)
VALUES ($1, $2, $3, $4, 'draft')
RETURNING id, nomination_id, position, title, type, status, undo_kind, undo_data, bracket_size, third_place;

-- name: CreateStage :one
-- Создаёт этап-сетку (спека 0018, FR-2): position/title/bracket передаёт
-- вызывающий (service вычисляет position = MaxStagePosition+1). type в
-- этом инкременте всегда 'bracket' — групповой этап создаёт только
-- InsertStage/EnsureStage.
INSERT INTO stage.stages (nomination_id, position, title, type, status, bracket_size, third_place)
VALUES (sqlc.arg(nomination_id)::uuid, sqlc.arg(position)::int, sqlc.arg(title)::text, sqlc.arg(type)::text, 'draft', sqlc.arg(bracket_size)::int, sqlc.arg(third_place)::bool)
RETURNING id, nomination_id, position, title, type, status, undo_kind, undo_data, bracket_size, third_place;

-- name: DeleteStage :exec
-- Удаляет этап (спека 0018, FR-3): контейнеры (stage.pools, ON DELETE
-- CASCADE) и членства (через pools, ON DELETE CASCADE) уходят каскадом БД.
-- Гейты (тип bracket, нет начатых боёв) проверяет вызывающий (service).
DELETE FROM stage.stages WHERE id = $1;

-- name: MaxStagePosition :one
-- Наибольшая position среди этапов номинации (0, если этапов ещё нет) —
-- CreateStage встаёт под max+1 (спека 0018, FR-2).
SELECT COALESCE(MAX(position), 0)::int FROM stage.stages WHERE nomination_id = $1;

-- name: ListStagesByNomination :many
-- Все этапы номинации (для публичных ответов, repeated stages).
SELECT id, nomination_id, position, title, type, status, undo_kind, undo_data, bracket_size, third_place
FROM stage.stages
WHERE nomination_id = $1
ORDER BY position, id;

-- name: GetStageByID :one
-- Резолв этапа по id (используется там, где этап известен через пул —
-- pool.StageID, а не через nomination_id, напр. SeatPoolOnArena) — или
-- напрямую по stage_id (спека 0018, FR-18: адресация раскладки этапом).
SELECT id, nomination_id, position, title, type, status, undo_kind, undo_data, bracket_size, third_place
FROM stage.stages
WHERE id = $1;

-- name: SetStageStatus :exec
-- Задаёт статус этапа (draft/ready), очищает undo (спека 0017, FR-9/FR-7a).
UPDATE stage.stages
SET status = $2, undo_kind = '', undo_data = '{}'::jsonb, updated_at = now()
WHERE id = $1;

-- name: ClearStageUndo :exec
-- Очищает undo этапа (без смены статуса) — вызывается мутациями раскладки
-- (CreatePool/AssignFighter/UnassignFighter/UndoAuto/UndoDeletePool/
-- UndoReset/SeedSlot), для которых этап на момент вызова уже гарантированно
-- существует.
UPDATE stage.stages
SET undo_kind = '', undo_data = '{}'::jsonb, updated_at = now()
WHERE id = $1;

-- name: SetStageUndo :exec
-- Записывает undo-снапшот этапа (DeletePool/ResetLayout/ApplyAutoDistribute).
UPDATE stage.stages
SET undo_kind = $2, undo_data = $3, updated_at = now()
WHERE id = $1;

-- Раскладка (спека 0009/0011/0013), переадресована на этап спекой 0017,
-- слот добавлен спекой 0018.

-- name: ListPoolsByStage :many
SELECT id, stage_id, nomination_id, number, arena_id, current_bout_id
FROM stage.pools
WHERE stage_id = $1
ORDER BY number;

-- name: ListMembersByStage :many
-- slot добавлен спекой 0018 — нужен ResetLayout для undo-снапшота со
-- слотами (AC-13a4, FR-8); MembersByStage (domain.Repository) его
-- игнорирует.
SELECT pool_id, fighter_id, slot
FROM stage.pool_members
WHERE stage_id = $1;

-- name: ListPoolsByNomination :many
-- Пулы номинации целиком, по всем её этапам (спека 0017, FR-9: публичный
-- экран/живой снапшот показывают номинацию целиком).
SELECT id, stage_id, nomination_id, number, arena_id, current_bout_id
FROM stage.pools
WHERE nomination_id = $1
ORDER BY number;

-- name: ListMembersByNomination :many
SELECT pool_id, fighter_id
FROM stage.pool_members
WHERE nomination_id = $1;

-- name: GetPoolByID :one
SELECT id, stage_id, nomination_id, number, arena_id, current_bout_id
FROM stage.pools
WHERE id = $1;

-- name: ListMembersByPool :many
SELECT fighter_id
FROM stage.pool_members
WHERE pool_id = $1;

-- name: InsertPool :one
-- Вставляет пул в этап; nomination_id денормализуется из stage.stages
-- (на чтении это избавляет от join через stages, см. миграция).
INSERT INTO stage.pools (stage_id, nomination_id, number)
SELECT sqlc.arg(stage_id)::uuid, s.nomination_id, sqlc.arg(number)::int
FROM stage.stages s
WHERE s.id = sqlc.arg(stage_id)::uuid
RETURNING id, stage_id, nomination_id, number;

-- name: DeletePoolByID :exec
DELETE FROM stage.pools WHERE id = $1;

-- name: DeleteAllPoolsByStage :exec
DELETE FROM stage.pools WHERE stage_id = $1;

-- name: DeleteContainers :exec
-- Удаляет контейнеры (пулы) по id, каскадом членства (спека 0018) —
-- расфиксация сетки удаляет так круги >= 2 (первый круг и посев остаются).
DELETE FROM stage.pools WHERE id = ANY(sqlc.arg(pool_ids)::uuid[]);

-- name: InsertMember :exec
-- stage_id/nomination_id денормализуются из stage.pools — вызывающему
-- достаточно знать pool_id + fighter_id. slot — номер слота сетки (спека
-- 0018, FR-7); NULL у членства без слота (группа) — sqlc.narg допускает
-- явный NULL.
INSERT INTO stage.pool_members (pool_id, stage_id, nomination_id, fighter_id, slot)
SELECT p.id, p.stage_id, p.nomination_id, sqlc.arg(fighter_id)::uuid, sqlc.narg(slot)::int
FROM stage.pools p
WHERE p.id = sqlc.arg(pool_id)::uuid;

-- name: DeleteMemberByFighter :exec
DELETE FROM stage.pool_members WHERE stage_id = $1 AND fighter_id = $2;

-- name: DeleteMembersByFighterIDs :exec
DELETE FROM stage.pool_members
WHERE stage_id = $1 AND fighter_id = ANY(sqlc.arg(fighter_ids)::uuid[]);

-- name: PruneMembers :exec
-- Остаётся номинационным (спека 0017, FR-9): чистит осиротевшие членства по
-- ВСЕМ этапам номинации, не по одному. Исключение (спека 0018, FR-22):
-- зафиксированные сетки (type=bracket, status=ready) не трогаются — снятие
-- бойца после фиксации не переигрывает сетку; в черновике реконсиляция
-- работает как раньше.
DELETE FROM stage.pool_members m
USING stage.stages s
WHERE m.stage_id = s.id
  AND m.nomination_id = sqlc.arg(nomination_id)::uuid
  AND m.fighter_id <> ALL(sqlc.arg(active_fighter_ids)::uuid[])
  AND NOT (s.type = 'bracket' AND s.status = 'ready');

-- Спека 0018: посев сетки (FR-7/FR-8).

-- name: MemberSlotInStage :one
-- Текущее место бойца в пределах этапа (контейнер + слот), если он уже
-- посеян — вход обмена местами (SeedSlot, FR-8). Не более одной строки:
-- уникальность слота на бойца в этапе гарантирована уникальностью строки
-- членства (pool_id, fighter_id) в пределах stage_id (uq_members_stage_fighter,
-- 0017) — боец состоит не более чем в одном пуле этапа.
SELECT pool_id, slot FROM stage.pool_members
WHERE stage_id = sqlc.arg(stage_id)::uuid
  AND fighter_id = sqlc.arg(fighter_id)::uuid
  AND slot IS NOT NULL
LIMIT 1;

-- name: MemberAtSlot :one
-- Боец, занимающий слот контейнера (если есть) — вход обмена местами
-- (SeedSlot, FR-8).
SELECT fighter_id FROM stage.pool_members
WHERE pool_id = sqlc.arg(pool_id)::uuid AND slot = sqlc.arg(slot)::int
LIMIT 1;

-- name: SeedsByStage :many
-- Текущий посев первого круга этапа (слот → боец, спека 0018, FR-7): сырые
-- членства с непустым slot, по обоим контейнерам первого круга (единственные
-- контейнеры, где slot когда-либо непуст).
SELECT fighter_id, slot FROM stage.pool_members
WHERE stage_id = sqlc.arg(stage_id)::uuid AND slot IS NOT NULL
ORDER BY slot;

-- Спека 0011: постановка пула на арену.

-- name: SeatPool :one
-- Закрепляет пул за площадкой. Уникальность arena_id (partial unique index
-- uq_pools_arena) отклонит гонку параллельной постановки на ту же арену —
-- repo мапит нарушение констрейнта в domain.ErrArenaBusy (FR-6, NFR-4).
UPDATE stage.pools SET arena_id = $2, updated_at = now()
WHERE id = $1
RETURNING id;

-- name: UnseatPool :exec
-- Снимает пул с площадки (идемпотентно — пул без арены просто не меняется).
UPDATE stage.pools SET arena_id = NULL, updated_at = now()
WHERE id = $1;

-- name: GetPoolByArena :one
-- Пул, стоящий на арене (не более одного, инвариант uq_pools_arena).
SELECT id, stage_id, nomination_id, number, arena_id, current_bout_id
FROM stage.pools
WHERE arena_id = $1;

-- name: ListReadyUnseatedPools :many
-- Пулы в статусе «готов» (раскладка их этапа ready), ещё не поставленные ни
-- на одну арену — кандидаты для постановки на странице арены (FR-9).
SELECT p.id, p.stage_id, p.nomination_id, p.number, p.arena_id, p.current_bout_id
FROM stage.pools p
JOIN stage.stages s ON s.id = p.stage_id
WHERE s.status = 'ready' AND p.arena_id IS NULL
ORDER BY p.nomination_id, p.number;

-- name: ExistsSeatedInStage :one
-- Стоит ли хотя бы один пул этапа на арене (гейт FR-8 спеки 0017: занятость
-- арены пулом ДРУГОГО этапа той же номинации не блокирует).
SELECT EXISTS (
    SELECT 1 FROM stage.pools WHERE stage_id = $1 AND arena_id IS NOT NULL
);

-- Спека 0013: ведение текущего боя пула на арене.

-- name: SetCurrentBout :exec
-- Записывает указатель текущего боя пула (FR-7/FR-8/FR-9). bout_id может
-- быть NULL (авто-продвижение после завершения последнего боя пула, AC-10) —
-- sqlc.narg допускает явный NULL.
UPDATE stage.pools SET current_bout_id = sqlc.narg(bout_id), updated_at = now()
WHERE id = $1;
