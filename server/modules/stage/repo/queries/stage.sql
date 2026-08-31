-- Спека 0017: этапы номинации. Расширено спекой 0018 (этап-сетка):
-- bracket_size/third_place в stages, slot в pool_members. Расширено спекой
-- 0019 (переходы между этапами): source_kind/source_stage_id/
-- selector_kind/place_from/place_to/layout_method (правило отбора) и
-- group_count (число групп явно созданного группового этапа) в stages.
-- Расширено спекой 0020 (конструктор схемы + пресеты формата):
-- UpdateStage/SetStagePosition/CountMembersByNomination/
-- DeleteStagesByNomination (редактирование и замена схемы целиком) и
-- пять запросов stage.format_presets (библиотека пресетов).

-- stageColumns — общий список колонок этапа, переиспользуется во всех
-- запросах ниже (GetStageByNomination/InsertStage/CreateStage/
-- ListStagesByNomination/GetStageByID/SetStageRule/ListStagesBySource):
-- id, nomination_id, position, title, type, status, undo_kind, undo_data,
-- bracket_size, third_place, source_kind, source_stage_id, selector_kind,
-- place_from, place_to, layout_method, group_count.

-- name: GetStageByNomination :one
-- Канонический этап номинации (в этой спеке — не более одного). LIMIT 1 +
-- ORDER BY страхует :one от паники sqlc, если данные когда-нибудь окажутся
-- в состоянии "несколько этапов" (спека 0018) — на выборку самого раннего.
SELECT id, nomination_id, position, title, type, status, undo_kind, undo_data, bracket_size, third_place,
       source_kind, source_stage_id, selector_kind, place_from, place_to, layout_method, group_count
FROM stage.stages
WHERE nomination_id = $1
ORDER BY position, created_at
LIMIT 1;

-- name: InsertStage :one
-- Создаёт КАНОНИЧЕСКИЙ (групповой) этап номинации (пара к
-- GetStageByNomination под EnsureStage — get-or-create делается в Go:
-- SELECT, если не найдено — INSERT). bracket_size/third_place/group_count
-- остаются дефолтами (0/false/0) — авто-этап их не использует
-- (chk_stages_bracket/chk_stages_group_count) и правила не имеет (FR-9a).
INSERT INTO stage.stages (nomination_id, position, title, type, status)
VALUES ($1, $2, $3, $4, 'draft')
RETURNING id, nomination_id, position, title, type, status, undo_kind, undo_data, bracket_size, third_place,
          source_kind, source_stage_id, selector_kind, place_from, place_to, layout_method, group_count;

-- name: CreateStage :one
-- Создаёт явный этап — сетку (спека 0018, FR-2) либо групповой этап (спека
-- 0019, FR-7): position/title/конфиг/правило передаёт вызывающий
-- (service.CreateStage вычисляет позицию — MaxStagePosition+1 либо от
-- источника правила, FR-10). source_stage_id — NULL у правил с
-- источником-ростером и у этапов без правила (sqlc.narg).
INSERT INTO stage.stages (
    nomination_id, position, title, type, status, bracket_size, third_place, group_count,
    source_kind, source_stage_id, selector_kind, place_from, place_to, layout_method
)
VALUES (
    sqlc.arg(nomination_id)::uuid, sqlc.arg(position)::int, sqlc.arg(title)::text, sqlc.arg(type)::text, 'draft',
    sqlc.arg(bracket_size)::int, sqlc.arg(third_place)::bool, sqlc.arg(group_count)::int,
    sqlc.arg(source_kind)::text, sqlc.narg(source_stage_id)::uuid, sqlc.arg(selector_kind)::text,
    sqlc.arg(place_from)::int, sqlc.arg(place_to)::int, sqlc.arg(layout_method)::text
)
RETURNING id, nomination_id, position, title, type, status, undo_kind, undo_data, bracket_size, third_place,
          source_kind, source_stage_id, selector_kind, place_from, place_to, layout_method, group_count;

-- name: DeleteStage :exec
-- Удаляет этап (спека 0018, FR-3): контейнеры (stage.pools, ON DELETE
-- CASCADE) и членства (через pools, ON DELETE CASCADE) уходят каскадом БД.
-- Гейты (тип bracket, нет начатых боёв, не источник другого этапа — спека
-- 0019 FR-7a) проверяет вызывающий (service).
DELETE FROM stage.stages WHERE id = $1;

-- name: MaxStagePosition :one
-- Наибольшая position среди этапов номинации (0, если этапов ещё нет) —
-- CreateStage без правила встаёт под max+1 (0018, FR-2; 0019, FR-10).
SELECT COALESCE(MAX(position), 0)::int FROM stage.stages WHERE nomination_id = $1;

-- name: ListStagesByNomination :many
-- Все этапы номинации (для публичных ответов, repeated stages).
SELECT id, nomination_id, position, title, type, status, undo_kind, undo_data, bracket_size, third_place,
       source_kind, source_stage_id, selector_kind, place_from, place_to, layout_method, group_count
FROM stage.stages
WHERE nomination_id = $1
ORDER BY position, id;

-- name: GetStageByID :one
-- Резолв этапа по id (используется там, где этап известен через пул —
-- pool.StageID, а не через nomination_id, напр. SeatPoolOnArena) — или
-- напрямую по stage_id (спека 0018, FR-18: адресация раскладки этапом).
SELECT id, nomination_id, position, title, type, status, undo_kind, undo_data, bracket_size, third_place,
       source_kind, source_stage_id, selector_kind, place_from, place_to, layout_method, group_count
FROM stage.stages
WHERE id = $1;

-- name: SetStageRule :one
-- Пишет правило отбора этапа и пересчитанную позицию, очищает undo (спека
-- 0019, FR-6/FR-10). Пустое правило (все source_kind/selector_kind/
-- layout_method = '') снимает правило — вызывающий (service.SetStageRule)
-- передаёт нулевые значения, а не отдельный код "удалить правило".
UPDATE stage.stages
SET position = sqlc.arg(position)::int,
    source_kind = sqlc.arg(source_kind)::text,
    source_stage_id = sqlc.narg(source_stage_id)::uuid,
    selector_kind = sqlc.arg(selector_kind)::text,
    place_from = sqlc.arg(place_from)::int,
    place_to = sqlc.arg(place_to)::int,
    layout_method = sqlc.arg(layout_method)::text,
    undo_kind = '', undo_data = '{}'::jsonb, updated_at = now()
WHERE id = sqlc.arg(id)::uuid
RETURNING id, nomination_id, position, title, type, status, undo_kind, undo_data, bracket_size, third_place,
          source_kind, source_stage_id, selector_kind, place_from, place_to, layout_method, group_count;

-- name: ListStagesBySource :many
-- Соседние этапы, чьё правило ссылается на sourceStageID (спека 0019):
-- проверка пересечения селекторов (FR-11) и гейт удаления источника, пока
-- ветка существует (FR-7a).
SELECT id, nomination_id, position, title, type, status, undo_kind, undo_data, bracket_size, third_place,
       source_kind, source_stage_id, selector_kind, place_from, place_to, layout_method, group_count
FROM stage.stages
WHERE source_kind = 'stage' AND source_stage_id = $1
ORDER BY id;

-- name: UpdateStage :exec
-- Пишет название и конфиг этапа (спека 0020, FR-2). Гейты («конфиг правится
-- только пока состав пуст») и решение, реально ли изменился конфиг —
-- забота вызывающего (service.UpdateStage); позиций не трогает.
UPDATE stage.stages
SET title = sqlc.arg(title)::text,
    bracket_size = sqlc.arg(bracket_size)::int,
    third_place = sqlc.arg(third_place)::bool,
    group_count = sqlc.arg(group_count)::int,
    updated_at = now()
WHERE id = sqlc.arg(id)::uuid;

-- name: SetStagePosition :exec
-- Пишет позицию одного этапа — вызывается в цикле внутри транзакции
-- SetStagePositions (спека 0020, FR-3, каскад ResolveStagePositions).
UPDATE stage.stages SET position = sqlc.arg(position)::int, updated_at = now()
WHERE id = sqlc.arg(id)::uuid;

-- name: CountMembersByNomination :one
-- Сколько всего членств по всем этапам номинации — гейт «схема не тронута»
-- (спека 0020, FR-13): 0 необходимо, но не достаточно (см. также
-- ExistsSeatedInStage/AnyStartedInPools).
SELECT count(*)::int FROM stage.pool_members WHERE nomination_id = $1;

-- name: DeleteStagesByNomination :exec
-- Удаляет ВСЕ этапы номинации разом (спека 0020, ReplaceSchema, FR-13/
-- NFR-1) — контейнеры и членства уходят каскадом БД (ON DELETE CASCADE),
-- самоссылающийся FK source_stage_id (ON DELETE RESTRICT, миграция 00003)
-- не мешает: в одном DML-операторе PostgreSQL проверяет RESTRICT против
-- итогового состояния таблицы, а не построчно, так что удаление источника
-- вместе с его веткой в одном запросе безопасно (проверено эмпирически).
DELETE FROM stage.stages WHERE nomination_id = $1;

-- Спека 0020: библиотека пресетов формата (FR-11/FR-12) — отдельная
-- таблица без FK на turnир/номинацию/этап (миграция 00004).

-- name: ListFormatPresets :many
SELECT id, name, stages, created_at, updated_at FROM stage.format_presets ORDER BY name;

-- name: GetFormatPresetByID :one
SELECT id, name, stages, created_at, updated_at FROM stage.format_presets WHERE id = $1;

-- name: InsertFormatPreset :one
-- Уникальность имени без учёта регистра/краевых пробелов — уникальный
-- индекс uq_presets_name (миграция 00004); нарушение мапится repo в
-- domain.ErrPresetNameTaken (AC-17).
INSERT INTO stage.format_presets (name, stages)
VALUES (sqlc.arg(name)::text, sqlc.arg(stages)::jsonb)
RETURNING id, name, stages, created_at, updated_at;

-- name: RenameFormatPreset :one
UPDATE stage.format_presets
SET name = sqlc.arg(name)::text, updated_at = now()
WHERE id = sqlc.arg(id)::uuid
RETURNING id, name, stages, created_at, updated_at;

-- name: DeleteFormatPreset :execrows
DELETE FROM stage.format_presets WHERE id = $1;

-- Спека 0047: журнал заведения встроенного каталога пресетов формата
-- (FR-7) — отдельная таблица, переживающая удаление самого пресета
-- (миграция 00006).

-- name: ListSeededPresetKeys :many
SELECT preset_key FROM stage.builtin_preset_seeds;

-- name: MarkPresetSeeded :exec
INSERT INTO stage.builtin_preset_seeds (preset_key) VALUES ($1)
ON CONFLICT (preset_key) DO NOTHING;

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

-- Спека 0040: гейт на удаление номинации (сценарий 1), память посева при
-- возврате выведенного бойца (сценарий 2), репойнт при слиянии дублей
-- бойца (сценарий 3).

-- name: ExistsDistributedFighterForNomination :one
-- Есть ли в номинации хотя бы один боец, распределённый в пул любой её
-- стадии (FR-1 гейта удаления номинации) — денормализация nomination_id в
-- pool_members (см. migrations/00001_init.sql) позволяет обойтись без join.
SELECT EXISTS(SELECT 1 FROM stage.pool_members WHERE nomination_id = $1);

-- name: DraftMembershipsByFighter :many
-- Членства бойца в пулах ЭТАПОВ, ещё в draft (FR-4) — вход
-- OnFighterWithdrawn: только они запоминаются в withdrawn_seeds при
-- выводе, членства вне draft остаются как есть (посев там уже
-- зафиксирован, тот же порог, что у DeletePool/ResetLayout).
SELECT m.nomination_id, m.stage_id, m.pool_id
FROM stage.pool_members m
JOIN stage.stages s ON s.id = m.stage_id
WHERE m.fighter_id = sqlc.arg(fighter_id)::uuid AND s.status = 'draft';

-- name: MemberByStageFighter :one
-- Пул + номинация членства бойца в конкретном этапе (уникальность —
-- uq_members_stage_fighter) — вход CaptureWithdrawnSeed перед переносом
-- строки в withdrawn_seeds.
SELECT pool_id, nomination_id FROM stage.pool_members
WHERE stage_id = sqlc.arg(stage_id)::uuid AND fighter_id = sqlc.arg(fighter_id)::uuid;

-- name: InsertWithdrawnSeed :exec
-- Записывает «память» о членстве бойца в пуле draft-этапа, откуда он
-- выведен (FR-4). ON CONFLICT — идемпотентность на случай повторного
-- вывода без возврата между ними (PK — (fighter_id, nomination_id)).
INSERT INTO stage.withdrawn_seeds (fighter_id, nomination_id, stage_id, pool_id)
VALUES (sqlc.arg(fighter_id)::uuid, sqlc.arg(nomination_id)::uuid, sqlc.arg(stage_id)::uuid, sqlc.arg(pool_id)::uuid)
ON CONFLICT (fighter_id, nomination_id) DO UPDATE
SET stage_id = excluded.stage_id, pool_id = excluded.pool_id, withdrawn_at = now();

-- name: WithdrawnSeedsByFighter :many
-- Запомненные посевы бойца по всем номинациям (FR-5) — restorable говорит,
-- жива ли ещё draft-стадия и существует ли ещё сам пул: LEFT JOIN даёт
-- NULL (⇒ restorable=false), если стадия или пул к моменту возврата уже
-- удалены (FR-6).
SELECT w.fighter_id, w.nomination_id, w.stage_id, w.pool_id,
       (s.status = 'draft' AND p.id IS NOT NULL) AS restorable
FROM stage.withdrawn_seeds w
LEFT JOIN stage.stages s ON s.id = w.stage_id
LEFT JOIN stage.pools p ON p.id = w.pool_id
WHERE w.fighter_id = sqlc.arg(fighter_id)::uuid;

-- name: DeleteWithdrawnSeed :exec
-- Освобождает память об одном запомненном посеве (успешно восстановлен
-- либо истёк — best-effort, FR-6).
DELETE FROM stage.withdrawn_seeds WHERE fighter_id = sqlc.arg(fighter_id)::uuid AND nomination_id = sqlc.arg(nomination_id)::uuid;

-- name: RepointFighter :execrows
-- Переносит членства source в target по всем этапам, где target ещё не
-- состоит (сценарий 3, слияние дублей бойца). Коллизия по
-- uq_members_stage_fighter (target уже сидит в той же стадии) не
-- репойнтится молча: source-строка в этом редком случае остаётся за
-- source — слияние не теряет данные, но и не разрешает конфликт
-- автоматически (снятие — отдельное ручное действие admin, не merge).
UPDATE stage.pool_members SET fighter_id = sqlc.arg(target_id)::uuid
WHERE fighter_id = sqlc.arg(source_id)::uuid
  AND NOT EXISTS (
    SELECT 1 FROM stage.pool_members m2
    WHERE m2.stage_id = stage.pool_members.stage_id AND m2.fighter_id = sqlc.arg(target_id)::uuid
  );

-- name: RepointWithdrawnSeed :execrows
-- Аналогично RepointFighter для withdrawn_seeds — защита от коллизии по PK
-- (fighter_id, nomination_id): если target уже имеет запомненный посев той
-- же номинации, строка source не репойнтится молча.
UPDATE stage.withdrawn_seeds SET fighter_id = sqlc.arg(target_id)::uuid
WHERE fighter_id = sqlc.arg(source_id)::uuid
  AND NOT EXISTS (
    SELECT 1 FROM stage.withdrawn_seeds w2
    WHERE w2.nomination_id = stage.withdrawn_seeds.nomination_id AND w2.fighter_id = sqlc.arg(target_id)::uuid
  );
