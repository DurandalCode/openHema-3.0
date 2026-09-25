# Tasks: Импорт бойцов из файла

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: done
- Дата: 2026-09-17
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах.

## Треки и параллельность

После генерации контрактов (T1) серверная и клиентская части не имеют общих
файлов: сервер живёт в `server/pkg/tabular` + `server/modules/fighter/**` +
`server/internal/platform/fighter_provider.go`, клиент — в
`web/src/app/api/fighters/import/**`, `web/src/entities/fighter/**`,
`web/src/features/fighter-management/**`, `web/public/`. Клиент работает от
сгенерированного TS-клиента и моков `fetch`, реального сервера не ждёт.

| Волна | Трек | Задачи  | Файлы (не пересекаются внутри волны)                | Зависит от          |
| ----- | ---- | ------- | --------------------------------------------------- | ------------------- |
| 0     | —    | T1      | `proto/hema/v1/fighter.proto` + генерация            | —                   |
| 1     | A    | T2–T8   | `server/pkg/tabular/**`, `server/modules/fighter/**`, `server/internal/platform/fighter_provider.go` | волна 0 |
| 1     | B    | T9–T13  | `web/src/app/api/fighters/import/**`, `web/src/entities/fighter/**`, `web/src/features/fighter-management/**`, `web/public/` | волна 0 |
| 2     | join | T14–T18 | проверка целиком, индекс спек                        | треки A и B смержены |

Единственная точка касания внутри волны 1 — `fighters-screen.tsx` (кнопка
«Импорт из файла») — целиком в треке B.

## Контракты

- [x] T1. `proto/hema/v1/fighter.proto` — `ImportFighters` в
      `FighterAdminService`, enum'ы `ImportRowOutcome`/`ImportRowError`,
      сообщения `ImportRowReport`, `ImportSummary`,
      `ImportFightersRequest`/`Response` (DDL контракта — в `plan.md`);
      `make generate`.
      _(контракты — не TDD-шаг, но идут первыми: от них зависят типы.)_

## Server (трек A)

- [x] T2. **`pkg/tabular` (red→green)** — `pkg/tabular/tabular_test.go`:
      CSV UTF-8 / UTF-8 c BOM / windows-1251, разделители `;` и `,`, XLSX
      (книга собирается `excelize` в самом тесте), пустой файл, неизвестное
      расширение, превышение `MaxRows` → затем `pkg/tabular/tabular.go`
      (`Read`, `Table`, ошибки пакета).
      **На этой задаче принимается решение по `excelize`** (риск в
      `plan.md`): если вес зависимости неприемлем — XLSX выпадает, спека
      правится, тесты XLSX удаляются.
- [x] T3. **domain: ключ и модель (red→green)** —
      `modules/fighter/domain/import_test.go` на `NormalizeKey` (регистр,
      trim, внутренние пробелы) → затем `domain/import.go` с типами
      `ImportRow`, `RowOutcome`, `RowError`, `RowResult`, `ImportSummary`.
- [x] T4. **domain: `PlanImport` (red→green)** — таблица кейсов по одному
      на AC спеки: AC-1 (новые), AC-3 (неизвестная номинация), AC-4
      (пустое имя), AC-5 (дополнение), AC-6 (полный дубль), AC-7 (дубль
      внутри файла), AC-8 (повторный импорт), AC-11 (умолчания из UI),
      AC-12 (выведенный боец), AC-14 (без номинаций), плюс FR-8b
      (`merged` вне индекса) → затем реализация `PlanImport`. Чистая
      функция, ни БД, ни файлов.
- [x] T5. **порт `NominationProvider`** — добавить
      `NominationsByTournament(ctx, tournamentID) ([]NominationRef, error)`
      и тип `NominationRef`; обновить
      `testutil/fake_nomination_provider.go` (`var _ domain.
      NominationProvider = (*Fake...)(nil)` держит компиляционный red).
      Новые доменные ошибки в `domain/domain.go`: `ErrUnsupportedFile`,
      `ErrEmptyFile`, `ErrTooManyRows`, `ErrMissingNameColumn`,
      `ErrMalformedFile`.
- [x] T6. **service (red→green)** — `service/import_test.go` на fake-репо:
      `dry_run` не пишет (AC-2), не-`dry_run` пишет валидные и возвращает
      отклонённые (FR-9), резолв активного турнира при пустом
      `tournament_id`, чужой `default_nomination_id` → `ErrNominationNotFound`,
      ошибки уровня файла, распознавание колонок по заголовку в любом
      порядке и отсутствие колонки имени → затем `service/import.go`.
- [x] T7. **migrations** — **не потребовалась, миграции нет.** Точечного
      поиска по ключу «имя + клуб» в коде не появилось: сервис собирает
      снимок ростера страницами и строит индекс в памяти (`PlanImport`),
      так что `idx_fighters_name_club` остался бы индексом без читателя.
      Решение принято на реализации, как и предписывали план и задача.
- [x] T8. **api (red→green) + wiring** — `api/import_handler_test.go`
      (httptest + Connect, fake-репо): счастливый путь, `dry_run`,
      превышение `maxImportBytes`, маппинг доменных ошибок в
      `connect.Code`, отказ не-admin (AC-9) → затем
      `api/import_handler.go`; адаптер
      `internal/platform/fighter_provider.go` получает
      `NominationsByTournament` поверх `nomservice.List`.

## Web (трек B)

- [x] T9. **BFF (red→green)** — `app/api/fighters/import/route.test.ts`:
      `multipart/form-data` → gRPC, гейт расширения/MIME (`.csv`, `.xlsx`),
      гейт размера, `dryRun` и повторяемый `nominationIds`, 401 без токена,
      маппинг `connect.Code` → HTTP → затем `route.ts` +
      `app/api/fighters/to-import-report-dto.ts`.
- [x] T10. **entities/fighter** — типы отчёта (`ImportRowReport`,
      `ImportSummary`, исходы/причины как строковые литералы) рядом с
      существующим типом бойца.
- [x] T11. **features: api (red→green)** — `api/requests.test.ts` на
      `importFighters` (сборка `FormData`: файл, `dryRun`, повторяемые
      `nominationIds`) → затем `api/requests.ts` +
      `api/use-import-fighters.ts` (инвалидация ключей ростера только при
      `dryRun: false`).
- [x] T12. **features: ui (red→green)** —
      `ui/import-report-table.test.tsx` (исходы, причины, номер строки) и
      `ui/import-fighters-dialog.test.tsx` (три шага: выбор → предпросмотр
      → отчёт; «Импортировать» зовёт мутацию с `dryRun: false`; сводка
      FR-4) → затем компоненты.
- [x] T13. **экран и образец** — кнопка «Импорт из файла» в
      `ui/fighters-screen.tsx` (тест на открытие диалога) +
      `web/public/fighters-import-template.csv` и ссылка на него в диалоге
      (FR-11).

## Проверка (волна 2)

- [x] T14. **Интеграционный тест** —
      `modules/fighter/integration/fighter_import_integration_test.go`:
      импорт файла → повторный импорт того же файла на реальном Postgres,
      ростер не задваивается (AC-8).
- [x] T15. `make test-all` зелёный.
- [x] T16. `pnpm exec tsc --noEmit`.
- [x] T17. `go build ./...` + `pnpm build`.
- [x] T18. Обновить статус `spec.md`/`plan.md`/`tasks.md` на `done` и
      строку в `docs/specs/README.md`.
- [x] T19. **Дополнение формата колонок (FR-6a, AC-15/16)** — тест
      `service/import_test.go` на регистронезависимые заголовки, сборку
      «Фамилия Имя», старый формат полного имени и пустое имя при заполненной
      фамилии → затем `service/import.go`; обновить образец CSV и подсказку
      диалога.
