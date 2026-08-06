# Tasks: Конструктор схемы номинации + пресеты форматов

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: in progress
- Дата: 2026-08-06
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах.

## Треки и параллельность

| Волна | Трек | Задачи | Файлы (не пересекаются внутри волны) | Зависит от |
| ----- | ---- | ------ | ------------------------------------- | ---------- |
| 0     | —    | T1–T2  | `proto/hema/v1/stage.proto`, `server/modules/stage/migrations/` | — |
| 1     | A    | T3–T6  | `server/modules/stage/domain/**`      | волна 0    |
| 1     | B    | T7–T8  | `web/src/entities/stage/**`, `web/src/widgets/nomination-schema/**` | волна 0 |
| 2     | join | T9–T15 | `server/modules/stage/{repo,service,api,testutil,integration}/**` | трек A смержен |
| 3     | C    | T16–T17 | `web/src/app/api/**`, `web/src/lib/grpc/serialize.ts` | волна 2 |
| 3     | D    | T18–T20 | `web/src/features/**`                 | волна 2 (типы) + трек B |
| 4     | join | T21–T26 | страницы и навигация `web/src/app/**`, демо, проверка | треки C и D смержены |

Трек B стартует на фикстурах: виджет схемы (0019) — чистое отображение
пропсов, диагностика приходит готовыми строками с сервера (FR-8), поэтому
нужны только сгенерированные типы (волна 0). Серверная волна 2 не разбита:
`service/schema.go`, `service/seeding.go` (каскад позиций) и
`service/bracket.go` (`DeleteStage`) правятся согласованно, а `repo`/`api`
тянут те же сигнатуры порта.

## Контракты

- [x] T1. `proto/hema/v1/stage.proto` — enum `SchemaIssueSeverity`/
      `SchemaIssueCode`; сообщения `SchemaIssue`, `FormatStageSpec`,
      `FormatPreset`; `ListStagesResponse.issues`; шесть RPC — `UpdateStage`,
      `ListFormatPresets`, `SaveFormatPreset`, `RenameFormatPreset`,
      `DeleteFormatPreset`, `ApplyFormat` (источник — `oneof {preset_id,
      source_nomination_id}`). Затем `make generate`.
      _(контракты — не TDD-шаг, но идут первыми: от них зависят типы.)_
- [x] T2. `server/modules/stage/migrations/00004_format_presets.sql` (goose) —
      таблица `stage.format_presets` (`id`/`name`/`stages jsonb`/таймстемпы),
      `CHECK` на непустое имя и непустой массив этапов, уникальный индекс
      `uq_presets_name` по `lower(btrim(name))`. Прогнать `make migrate` и
      откат `make migrate-down` на локальной БД.

## Server — трек A (чистое ядро схемы)

- [x] T3. **domain — спецификация формата (red→green)** —
      `modules/stage/domain/schema_test.go` → `schema.go`: типы
      `FormatStageSpec`/`FormatSpec`/`FormatPreset`, `SpecFromStages` (FR-11,
      FR-15) и `ValidateFormatSpec`. Таблица: UUID источников → индексы,
      порядок этапов, две ветки от одного источника, этап без правила,
      осиротевшая ссылка (правило теряется), индекс вне границ, ссылка вперёд,
      групповой этап с правилом без числа групп, пустая спецификация.
- [x] T4. **domain — позиции и циклы (red→green)** — там же:
      `ResolveStagePositions` (FR-3) и `DetectSourceCycle` (FR-4). Таблица:
      цепочка A→B→C, две ветки от одного источника (равные позиции), **этап
      без правила сохраняет свою позицию** (регресс AC-18 спеки 0019), смена
      источника в середине цепочки, источник-ростер → 0, прямой
      self-reference, цикл длиной 3 → `ErrSourceCycle`.
- [x] T5. **domain — диагностика схемы (red→green)** —
      `modules/stage/domain/diagnose_test.go` → `diagnose.go`:
      `SchemaIssue`/`SchemaIssueSeverity`/`SchemaIssueCode`, `DiagnoseSchema`
      (FR-8). Таблица: по одному кейсу на каждый из девяти кодов, валидная
      схема → пустой срез, детерминированный порядок выдачи, «оценка
      невозможна» при открытой границе / селекторе `ALL` / источнике-ростере
      (NFR-2, AC-11), покрытие источника (хвост, разрыв, окна разных видов),
      **класс каждого кода** (`CAPACITY_EXCEEDED` — ошибка, `UNDERFILL`/`GAP`/
      `OVERLAP_UNKNOWN` — предупреждение, `TAIL_UNCOVERED` — информация), **три
      ветки от одного источника — ни ошибок, ни предупреждений** (FR-8a,
      AC-20), **одна группа проблемой не считается** (AC-21) и **финал от того
      же источника, что и сетка, даёт пересечение** (AC-21a).
- [x] T6. **domain — порт и ошибки** — `modules/stage/domain/domain.go`:
      новые ошибки (`ErrStageLocked`, `ErrSourceCycle`,
      `ErrSchemaNotEmpty`, `ErrPresetNameTaken`, `ErrInvalidSpec`),
      расширение порта `Repository` (`UpdateStage`, `SetStagePositions`,
      `MembersCountByNomination`, `ReplaceSchema`, пять preset-методов);
      комментарий у `ErrStageNotDeletable` — теперь только «есть начатые бои»
      (FR-5). Red — несобирающийся `service` на волне 2.

## Web — трек B (типы и диагностика в виджете, на фикстурах)

- [x] T7. **entities/stage (red→green)** — `web/src/entities/stage/`: типы
      `SchemaIssue`/`FormatStageSpec`/`FormatPreset`, хелпер краткой подписи
      схемы пресета («Группы (2) → 2 сетки по 8») с тестом на фикстурах.
- [x] T8. **widgets/nomination-schema (red→green)** — тест рендера `issues`:
      плашка ошибки/предупреждения/информации у нужного этапа (по `stage_ids`,
      три визуально различимых класса — FR-8), общий
      блок над схемой, отсутствие блока при пустом списке; виджет остаётся
      read-only (тексты — с сервера, FR-8). Затем — код.

## Server — волна 2 (join, после мержа трека A)

- [x] T9. **testutil** — `modules/stage/testutil/fake_repo.go`: реализация
      новых методов порта + in-memory библиотека пресетов с уникальностью
      имени без учёта регистра (`var _ domain.Repository = (*FakeRepo)(nil)`).
- [x] T10. **service — редактирование этапа (red→green)** —
      `service/schema_test.go` → `service/schema.go`: `UpdateStage` (FR-2,
      FR-7). Кейсы: переименование при непустом составе — можно; смена конфига
      при непустом составе — `ErrStageLocked`; смена конфига в `ready` —
      `ErrStageLocked`; `group_count → 0` при наличии правила —
      `ErrInvalidRule`; конфиг, не соответствующий типу — `ErrInvalidInput`;
      `PublishNominationChanged` вызван.
- [x] T11. **service — авто-этап и каскад позиций (red→green)** —
      `service/bracket_test.go`/`service/seeding_test.go`: удаление авто-этапа
      разрешено (FR-5), гейты «этап-источник» и «есть начатые бои» остаются;
      `SetStageRule` детектит цикл (FR-4) и пишет позиции каскадом (FR-3) →
      правки `service/bracket.go` и `service/seeding.go`.
- [x] T12. **service — пресеты и применение формата (red→green)** —
      `service/schema_test.go` → `service/schema.go`: `SaveFormatPreset`
      (`ErrPresetNameTaken`), `ListFormatPresets`/`RenameFormatPreset`/
      `DeleteFormatPreset`, `ApplyFormat` — из пресета и из номинации-донора
      (FR-13, FR-15). Кейсы гейтов: есть членства → `ErrSchemaNotEmpty`; пул на
      арене → `ErrSchemaNotEmpty`; есть начатые бои → `ErrSchemaNotEmpty`; оба
      источника или ни одного → `ErrInvalidInput`; донор = целевая номинация →
      `ErrInvalidInput`; успешное применение восстанавливает ссылки
      «источник → ветка», зовёт `ClearForPools`, `SyncRegistrationState` и
      `PublishNominationChanged`. Отдельный кейс на позиции (FR-8a, AC-22):
      пресет «группы → три сетки → завершающий этап **без правила**» — этап без
      правила встаёт последним уровнем, а не параллельно сеткам (AC-22).
- [x] T13. **service — диагностика в чтении (red→green)** — `ListStages`
      возвращает `DiagnoseSchema` (FR-8) + тест «схема с ошибкой ⇒
      формирование отклонено тем же гейтом» (FR-9).
- [x] T14. **repo** — `repo/queries/stage.sql` (`UpdateStage`,
      `SetStagePosition`, `CountMembersByNomination`, `DeleteStagesByNomination`,
      `InsertStageReturning`, `SetStageSource`, пять preset-запросов);
      `make sqlc`; `repo/repo.go` — реализация порта, включая ручные
      транзакции `ReplaceSchema` (удаление + вставка + резолв
      `SourceIndex → source_stage_id` + контейнеры первого круга сеткам) и
      `SetStagePositions`.
- [x] T15. **api (red→green)** — `api/handler_test.go` (httptest + Connect,
      fake-репо): шесть новых RPC — счастливый путь и маппинг каждой доменной
      ошибки в `connect.Code` (`ErrPresetNameTaken` → `AlreadyExists`,
      `ErrSourceCycle`/`ErrStageLocked`/`ErrSchemaNotEmpty` →
      `FailedPrecondition`), `issues` в `ListStages` → затем `api/handler.go`.
      Ответ `UpdateStage` — `{Stage stage}` (позиций не меняет).
      Wiring не трогаем: новые RPC — в существующем `StageAdminService`.

## Web — трек C (BFF)

- [x] T16. **BFF — этап и формат (red→green)** — `app/api/stages/[stageId]/
      route.ts` (`PATCH` → `UpdateStage`), `app/api/nominations/[id]/format/
      route.ts` (`POST`, тело `{presetId}` либо `{sourceNominationId}` →
      `ApplyFormat`) + `*.test.ts` (маппинг `connect.Code` → HTTP, валидация
      тела: ровно один источник).
- [x] T17. **BFF — библиотека пресетов (red→green)** — `app/api/formats/
      route.ts` (`GET`/`POST`), `app/api/formats/[presetId]/route.ts`
      (`PATCH`/`DELETE`) + тесты; сериализация `SchemaIssue`/`FormatPreset` в
      `web/src/lib/grpc/serialize.ts`; `issues` в существующем
      `app/api/nominations/[id]/stages/route.ts`.

## Web — трек D (features)

- [x] T18. **features/stage-management (red→green)** — `api/use-update-stage.ts`
      + `api/requests.ts`/`keys.ts`; `ui/edit-stage-dialog.tsx`: название +
      конфиг, поля конфига заблокированы с подсказкой при непустом составе,
      тип не показывается вовсе (FR-2). Тесты — fetchers и диалог (Vitest).
- [x] T19. **features/format-presets — библиотека (red→green)** — новая фича:
      `api/{keys,requests,use-presets,use-save-preset,use-rename-preset,
      use-delete-preset}.ts`, `ui/preset-library.tsx`, `ui/save-preset-dialog.tsx`.
      Тесты: fetchers, список, переименование, удаление, ошибка занятого имени
      (AC-17).
- [x] T20. **features/format-presets — применение (red→green)** —
      `api/use-apply-format.ts`, `ui/apply-format-dialog.tsx`: выбор «пресет из
      библиотеки» либо «номинация-донор», явное предупреждение о замене схемы
      целиком, объяснение отказа при непустой схеме (FR-14). Тесты — оба
      источника и обработка `FailedPrecondition`.

## Волна 4 (join, после мержа треков C и D)

- [ ] T21. **Страница схемы** — `app/(admin)/admin/nominations/[id]/stages/
      page.tsx`: диагностика над схемой, действия «Изменить этап»,
      «Применить формат», «Сохранить как пресет»; `get-stages.ts` тянет
      `issues`.
- [ ] T22. **Библиотека форматов** — `app/(admin)/admin/formats/page.tsx` +
      пункт «Форматы» в `app/(admin)/admin/admin-nav.tsx` (после «Номинации»);
      тест навигации на активный раздел.
- [ ] T23. **Интеграционные (`integration/`, testcontainers)** — миграция
      `00004` вверх/вниз; уникальность имени пресета без учёта регистра;
      `ReplaceSchema`: атомарность (сбой на середине не оставляет полусхемы),
      каскад пулов/членств, восстановленный `source_stage_id`; полный путь
      «схема из трёх этапов → пресет → применение к другой номинации →
      формирование этапа по 0019» через реальный Connect.
- [ ] T24. **Ручная проверка** — на демо-сиде собрать «группы (2) → двойной
      плейофф», сохранить пресетом, применить к соседней номинации, довести до
      боёв; убедиться, что публичный экран номинации не изменился (FR-19) и
      сценарий 0018/0019 не сломан (AC-18).
- [ ] T25. **Проверка сборки** — `make test-all` зелёный;
      `pnpm exec tsc --noEmit`; `go build ./...` + `pnpm build`.
- [ ] T26. **Документы** — статусы `spec.md`/`plan.md`/`tasks.md` → `done`,
      строка 0020 в `docs/specs/README.md`; проставить пометки об изменении в
      соседних спеках: **0018 FR-4** (параметры этапа теперь редактируются,
      пока состав пуст — отменено), **0019 FR-7a** (авто-этап удаляется —
      снято), **0019 FR-9a** (гейт «правило требует числа групп» остаётся, но
      перестал быть вечным для авто-этапа), **0017 FR-4** (этап
      восстанавливается при следующем обращении, а не существует всегда).
