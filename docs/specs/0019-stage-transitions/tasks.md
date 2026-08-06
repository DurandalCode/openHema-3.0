# Tasks: Переходы между этапами (stage transitions)

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: draft
- Дата: 2026-08-06
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах.

## Треки и параллельность

| Волна | Трек | Задачи | Файлы (не пересекаются внутри волны) | Зависит от |
| ----- | ---- | ------ | ------------------------------------- | ---------- |
| 0     | —    | T1–T2  | `proto/hema/v1/stage.proto`, `server/modules/stage/migrations/` | — |
| 1     | A    | T3–T5  | `server/modules/stage/domain/**`      | волна 0    |
| 1     | B    | T6–T7  | `web/src/entities/stage/**`, `web/src/widgets/nomination-schema/**` | волна 0 |
| 2     | join | T8–T13 | `server/modules/stage/{repo,service,api,testutil,integration}/**` | трек A смержен |
| 3     | C    | T14–T15 | `web/src/app/api/**`, `web/src/lib/grpc/serialize.ts` | волна 2 |
| 3     | D    | T16–T18 | `web/src/features/**`                 | волна 2 (типы) + трек B |
| 4     | join | T19–T24 | страницы `web/src/app/**`, демо-сид, проверка | треки C и D смержены |

Трек B стартует на фикстурах: виджет схемы — чистое отображение пропсов, ему
нужны только сгенерированные типы (волна 0). Серверная волна 2 не разбита на
треки: `service/seeding.go`, `service/bracket.go` (CreateStage/DeleteStage) и
`service/service.go` (Undo) правятся согласованно, а `repo`/`api` тянут за
собой те же сигнатуры порта.

## Контракты

- [x] T1. `proto/hema/v1/stage.proto` — enum `StageSourceKind`/
      `StageSelectorKind`/`StageLayoutMethod`; сообщения `SeedingRule`,
      `GroupsConfig`, `StageBuildEntry`, `StageBuildTie`, `TieResolution`,
      `StageBuildPreview`; `Stage.groups`/`Stage.rule`;
      `CreateStageRequest.groups`/`.rule` (+ разрешён `type = GROUPS`); три
      RPC — `SetStageRule`, `PreviewStageBuild`, `BuildStage` (ответ —
      `oneof {PoolLayout, Bracket}`). Затем `make generate`.
      _(контракты — не TDD-шаг, но идут первыми: от них зависят типы.)_
- [x] T2. `server/modules/stage/migrations/00003_seeding.sql` (goose) —
      колонки правила и `group_count`, шесть `CHECK`-ов, самоссылающийся FK
      `source_stage_id` с `ON DELETE RESTRICT`, индекс `idx_stages_source`,
      расширение `chk_stages_undo` значением `build`. Прогнать `make migrate`
      и откат `make migrate-down` на локальной БД.

## Server — трек A (чистое ядро отбора)

- [x] T3. **domain — сводный порядок (red→green)** —
      `modules/stage/domain/seeding_test.go` → `seeding.go`: типы правила
      (`SourceKind`/`SelectorKind`/`LayoutMethod`/`SeedingRule`/
      `GroupsConfig`), `SourceGroup`/`SelectedFighter`,
      `ComputeOverallOrder` (FR-5). Таблица: порядок сквозь группы, дележ
      (общий `OverallPlace`), группы разного размера (NFR-2), пустая группа,
      боец без завершённых боёв.
- [x] T4. **domain — селекторы и дележ (red→green)** — там же: `TieAsk`,
      `TieResolution`, `SelectByRule` (FR-3, FR-22), `Overlap` (FR-11),
      `SeedingRule.Validate` (FR-2..FR-4). Таблица: `ALL`, `GROUP_PLACES`
      с открытой/закрытой границей, `OVERALL_PLACES`, дележ строго на границе
      окна (даёт `TieAsk`), дележ внутри/вне окна (вопросов нет), применение
      `TieResolution`, невалидные правила.
- [x] T5. **domain — раскладка и типы модуля (red→green)** —
      `seeding_test.go` → `seeding.go`: `BracketSeedOrder` (свойства «1 и 2
      только в финале», «1 и 4 не раньше полуфинала», полная перестановка для
      4/8/16/32), `PlanBracketSeeds` (полный набор / недобор /
      `ErrCapacityExceeded`), `PlanGroupAssignments` поверх `AutoDistribute`;
      затем `domain/domain.go` — `Stage.Rule`/`Stage.Groups`, `UndoBuild`,
      новые ошибки (`ErrNoSeedingRule`, `ErrInvalidRule`,
      `ErrSourceNotAllowed`, `ErrSelectorOverlap`, `ErrCapacityExceeded`,
      `ErrTieUnresolved`, `ErrStageNotEmpty`, `ErrRuleLocked`,
      `ErrStageIsSource`), расширение порта `Repository`
      (`SetSeedingRule`/`ApplyStageBuild`/`StagesBySource`, `CreateStage`).
      Red — несобирающийся `service` на волне 2.

## Web — трек B (типы и виджет схемы, на фикстурах)

- [x] T6. **entities/stage (red→green)** — `web/src/entities/stage/`: типы
      `SeedingRule`/`GroupsConfig`/`StageBuildPreview`, хелперы подписи
      правила («Места 1–2 каждой группы · Групповой этап») и уровней схемы
      (группировка этапов по `position`); тесты на хелперы (Vitest).
- [x] T7. **widgets/nomination-schema (red→green)** —
      `web/src/widgets/nomination-schema/`: схема уровнями и ветками
      (FR-25/FR-26), режимы admin/read-only, тест на фикстурах — две
      параллельные ветки, несимметричные ветки, этап без правила.

## Server — волна 2 (join)

- [x] T8. **testutil** — `modules/stage/testutil/fake_repo.go`: реализация
      новых методов порта (`SetSeedingRule`, `ApplyStageBuild`,
      `StagesBySource`), правило/конфиг в фейковых этапах
      (`var _ domain.Repository = (*FakeRepo)(nil)`).
- [x] T9. **service — правило (red→green)** —
      `service/seeding_test.go` → `service/seeding.go`: `SetStageRule` —
      валидация, проверка источника (та же номинация, `type = groups`, раньше
      по порядку), гейт «состав пуст» (`ErrRuleLocked`, FR-6), гейт
      «групповой этап без числа групп» (FR-9a, AC-20), позиция ветки от
      источника — включая тест-регресс «этап **без правила** встаёт под
      `max+1`, а не под 0» (FR-10, AC-18).
- [x] T10. **service — превью (red→green)** — там же: `PreviewStageBuild` —
      сбор итогов источника (`BoutsByPool` + `ComputeStandings`), исключение
      неактивных **после** ранжирования с добором окна следующими (FR-20,
      AC-13), `entries`/`unselected`/`ties`/`overlaps`/
      `source_unfinished_bouts` (FR-14, FR-15).
- [x] T11. **service — формирование (red→green)** — там же: `BuildStage` —
      гейты (`ErrStageNotEmpty`, `ErrTieUnresolved`, `ErrSelectorOverlap`,
      `ErrCapacityExceeded`), применение через `ApplyStageBuild`,
      `SyncRegistrationState` + `PublishNominationChanged`, возврат
      `Layout`/`Bracket`; правки `service/service.go` (`Undo` → ветка
      `UndoBuild`, FR-21) и `service/bracket.go` (`CreateStage` с `groups`/
      правилом, `DeleteStage` с гейтом `ErrStageIsSource`, FR-7/FR-7a).
- [x] T12. **repo** — `repo/queries/stage.sql`: `SetStageRule`,
      `ListStagesBySource`, батч-вставки пулов и членств для
      `ApplyStageBuild`; расширение существующих запросов новыми колонками;
      `make sqlc`; `repo/repo.go` — реализация порта, `ApplyStageBuild` одной
      транзакцией.
- [x] T13. **api (red→green)** — `api/handler_test.go` → `api/handler.go`:
      `SetStageRule`/`PreviewStageBuild`/`BuildStage` + `CreateStage` с
      `type = GROUPS`; маппинг доменных ошибок в `connect.Code`
      (`InvalidArgument` / `FailedPrecondition` / `NotFound`, таблица в
      плане). Плюс `integration/stage_integration_test.go`: миграция 00003 и
      её откат, `CHECK` частичного правила, `ON DELETE RESTRICT` на
      источнике, путь «группы с боями → BuildStage сетки → посев в БД».

## Web — трек C (BFF)

- [ ] T14. **BFF (red→green)** — `app/api/stages/[stageId]/rule/route.ts`
      (PUT), `app/api/stages/[stageId]/build/preview/route.ts` (POST),
      `app/api/stages/[stageId]/build/route.ts` (POST) + `*.test.ts`: тело
      `ties`, маппинг `connect.Code` → HTTP.
- [ ] T15. **BFF — создание этапа** — расширение
      `app/api/nominations/[id]/stages/route.ts` (тип, `group_count`,
      правило) + сериализация новых сообщений в `lib/grpc/serialize.ts`,
      тесты.

## Web — трек D (features)

- [ ] T16. **features/stage-management** — диалог создания этапа: выбор типа
      (группы/сетка), число групп (FR-8), правило (источник из этапов
      номинации либо ростер, селектор, границы мест); хук
      `use-set-stage-rule.ts` (FR-6); тесты (Vitest).
- [ ] T17. **features/stage-build — api** —
      `features/stage-build/api/{keys,requests,use-build-preview,
      use-build-stage}.ts`: fetchers + RQ-хуки, инвалидация ключей этапов/
      раскладки/сетки после формирования; тесты fetchers.
- [ ] T18. **features/stage-build — ui (red→green)** —
      `ui/build-stage-dialog.tsx` + `lib/tie-resolution.ts`: превью-таблица
      «боец → откуда → куда», предупреждения (FR-11/FR-14), блок разрешения
      дележа с показателями претендентов (FR-22), блокировка кнопки при
      `overlaps`/переполнении; тесты на фикстурах.

## Волна 4 (join) — страницы и проверка

- [ ] T19. **Админская страница этапов** —
      `app/(admin)/admin/nominations/[id]/stages/page.tsx`: схема
      (`widgets/nomination-schema`) вместо плоского списка, кнопка
      «Сформировать» и «Расформировать» (существующий сброс состава, FR-17).
- [ ] T20. **Публичный экран** — `app/nominations/[id]/page.tsx`: схема в
      read-only виде (FR-26), проверка живого обновления (0014).
- [ ] T21. **Демо-сид** — сценарий с двумя ветками: «группы → сетка за 1-е
      место + утешительная» и «группы → двойная сетка групп»
      (`make demo-*`), чтобы сценарии AC-2/AC-14 воспроизводились одной
      командой.
- [ ] T22. `make test-all` зелёный + `make test-integration`.
- [ ] T23. `go build ./...`, `pnpm exec tsc --noEmit`, `pnpm build`.
- [ ] T24. Регресс на реальном стеке (`make dev` после
      `docker compose down -v`): сценарий 0018 не изменился (AC-18),
      формирование обеих схем проходит; обновить статусы спеки/плана/задач,
      строку 0019 в `docs/specs/README.md` и пометку у строки 0018 —
      «done (изменён 0019)»: правило отбора стало исключением из её FR-4
      (параметры созданного этапа не редактируются).
