# Tasks: Встроенный каталог пресетов формата

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: draft
- Дата: 2026-08-31
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах.

## Треки и параллельность

Дизъюнктных кусков ровно два, и оба после контрактов: сервер (`server/**`) и
web (`web/**`). Каталог (T2) нужен только серверу, но лежит в волне 0 вместе с
proto — он ни от чего не зависит и служит входом для трека A.

| Волна | Трек | Задачи   | Файлы (не пересекаются внутри волны)                                        | Зависит от           |
| ----- | ---- | -------- | --------------------------------------------------------------------------- | -------------------- |
| 0     | —    | T1, T2   | `proto/hema/v1/stage.proto`; `server/modules/stage/domain/catalogue*.go`      | —                    |
| 1     | A    | T3–T8    | `server/modules/stage/{domain/domain.go,service,testutil,repo,migrations,api,module.go}`, `server/internal/platform/platform.go` | волна 0              |
| 1     | B    | T9–T11   | `web/src/app/api/formats/restore/**`, `web/src/features/format-presets/**`    | волна 0 (`make generate`) |
| 2     | join | T12–T15  | общие: прогон тестов, сборка, индекс спек                                    | треки A и B смержены |

## Контракты

- [ ] T1. `proto/hema/v1/stage.proto` — `RestoreBuiltinPresets` в
      `StageAdminService` + `RestoreBuiltinPresetsRequest{}` /
      `RestoreBuiltinPresetsResponse{ repeated FormatPreset restored = 1;
      int32 skipped = 2; }`; комментарии со ссылкой на спеку 0047 (FR-10).
      `make generate`. _(контракты — не TDD-шаг, но идут первыми.)_

## Server

- [ ] T2. **domain: каталог (red→green)** — `domain/catalogue_test.go`:
      десять записей, уникальные ключи и имена, каждая проходит
      `ValidateFormatSpec`; форма целевой схемы (три этапа, два `bracket` от
      индекса 0 с окнами 1–2 и 3–0, `2 × groupCount == bracketSize`); имена
      содержат вариант масштаба → затем `domain/catalogue.go`
      (`BuiltinPreset`, `BuiltinPresets()`, приватные конструкторы
      `groupsDoublePlayoff`/`groupsPlayoff`/`singleBracket`/`roundRobin`).
      _(NFR-1, FR-2, FR-3, FR-4; AC-1, AC-3, AC-4.)_
- [ ] T3. **domain: порт** — `domain/domain.go`: `SeededPresetKeys` и
      `MarkPresetSeeded` в `Repository` (рядом с пресетными методами 0020).
      Новых доменных ошибок нет. Red — несобирающийся `testutil` на следующем
      шаге.
- [ ] T4. **testutil** — `modules/stage/testutil/fake_repo.go`: журнал
      заведённых ключей в памяти + две новые операции порта (`var _
      domain.Repository = (*FakeRepo)(nil)` должен снова компилироваться).
- [ ] T5. **service (red→green)** — `service/catalogue_test.go` на fake-репо:
      пустая библиотека → 10 заведено и 10 ключей в журнале; повторный вызов →
      0; ключ в журнале без пресета (удалён) → не воскресает; новый ключ при
      непустом журнале → заводится только он; занятое имя →
      `Skipped++`, чужой пресет цел, проход продолжается, ключ отмечен;
      `RestoreBuiltinPresets` игнорирует журнал и не трогает существующие;
      ошибка репо (не `ErrPresetNameTaken`) прерывает проход → затем
      `service/catalogue.go` (`SeedReport`, `SeedBuiltinPresets`,
      `RestoreBuiltinPresets`, общий внутренний проход).
      _(FR-6…FR-10; AC-1, AC-6, AC-7, AC-8, AC-9, AC-10, AC-11, AC-13.)_
- [ ] T6. **service: применимость каталога (red→green)** — дополнение
      `service/schema_test.go`: `ApplyFormat` спецификацией записи
      `groups-double-playoff-16` даёт три этапа с ожидаемыми позициями и
      правилами, а `Diagnose` по ним не содержит проблем класса `ERROR`.
      Кода, скорее всего, не требует (проверка существующего пути) — если
      требует, правится **запись каталога**, не диагностика (план, «Риски»).
      _(FR-11; AC-2, AC-3.)_
- [ ] T7. **repo + migrations** — `migrations/00006_builtin_presets.sql`
      (таблица `stage.builtin_preset_seeds`, DDL — в плане);
      `repo/queries/stage.sql` (`ListSeededPresetKeys`, `MarkPresetSeeded` с
      `ON CONFLICT DO NOTHING`); `make sqlc`; `repo/repo.go` — реализация двух
      методов порта. Интеграционный тест (`integration/`): миграция
      применяется; запись журнала переживает `DeleteFormatPreset`; повторный
      `MarkPresetSeeded` идемпотентен. _(FR-7.)_
- [ ] T8. **api + wiring (red→green)** — `api/handler_test.go` (httptest +
      Connect, fake-репо): `RestoreBuiltinPresets` отдаёт `restored`/`skipped`
      → затем `api/handler.go`; `module.go` — `BootstrapPresets(ctx, deps,
      log)` по образцу `auth.Bootstrap` (ошибку только логирует);
      вызов в `internal/platform/platform.go` рядом с `auth.Bootstrap`.
      _(FR-6, FR-10, NFR-2; AC-13.)_

## Web

- [ ] T9. **BFF (red→green)** — `app/api/formats/restore/route.test.ts`: 401
      без access-токена, проксирование `{restored, skipped}`, маппинг
      `connect.Code` → HTTP через `errorResponse` → затем
      `app/api/formats/restore/route.ts` (Node runtime, `stageAdminClient`,
      `formatPresetsToJson`).
- [ ] T10. **feature (red→green)** — `features/format-presets/api/requests.test.ts`
      на `restoreBuiltinPresets()` → затем `requests.ts` +
      `use-restore-builtin-presets.ts` (мутация, инвалидация ключа библиотеки
      из `keys.ts`, отказ через существующий `presetErrorMessage`).
- [ ] T11. **ui (red→green)** — `features/format-presets/ui/preset-library.test.tsx`:
      кнопка «Восстановить встроенные» вызывает мутацию; тост с числами
      («Восстановлено 3, пропущено 1»); тост «уже в библиотеке» при
      `restored = 0`; отказ → `toastError` → затем правка
      `preset-library.tsx` (кнопка в действиях `PageHeader`).
      _(FR-10; AC-10.)_

## Проверка

- [ ] T12. `make test-all` зелёный (server + web).
- [ ] T13. `pnpm exec tsc --noEmit` (контракт менялся — protobuf-типы web
      перегенерированы).
- [ ] T14. `go build ./...` + `pnpm build`; ручная проверка на чистой БД
      (`docker compose down -v && make dev`): библиотека содержит десять
      пресетов, целевой применяется к номинации, удалённый не возвращается
      после перезапуска (AC-1, AC-2, AC-6).
- [ ] T15. Обновить статус спеки/плана/тасков и строку в индексе
      `docs/specs/README.md`.
