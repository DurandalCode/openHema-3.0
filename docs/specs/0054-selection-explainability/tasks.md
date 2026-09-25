# Tasks: Объяснимый отбор в следующий этап

- Статус: draft
- Дата: 2026-09-25
- План: `./plan.md`

> Условный чеклист, не разрешение реализации. D-0054-1/2 должны быть приняты;
> при ином ответе сначала пересмотреть spec/plan/tasks.

## Порядок

Каждая задача с кодом — red → green → refactor. Worktree отдельный на трек;
общий индекс/аудит обновляет координатор в join-волне.

## Треки и параллельность

| Волна | Трек | Задачи | Файлы | Зависит от |
| --- | --- | --- | --- | --- |
| 0 | согласование | T0 | эти документы, эталон приёмки | D-0054-1/2 |
| 1 | контракт | T1 | stage.proto, entities/stage/lib/types.ts | T0, слот владельца общих контрактов |
| 2 | backend | T2–T4 | stage/domain,service,api | T1 смержен |
| 2 | frontend | T5–T6 | lib/grpc, BFF build/preview, features/stage-build | T1 смержен |
| 3 | join | T7–T9 | интеграционные проверки, общие документы | оба трека волны 2 смержены |

Не запускать backend одновременно с другими владельцами stage seeding/api;
serialize.ts не правится соседним BFF-треком в этой волне. Генерацию каждый
worktree выполняет сам, generated-файлы не переносятся/не коммитятся.

## Подготовка и контракты

- [ ] T0. Зафиксировать решения D-0054-1/2, обновить документы. Составить
  вручную рассчитанный эталон M04 по 0016/0019: разные размеры групп,
  полный дележ, снятие/добор, незавершённая группа. Проверить текущее
  поведение; найденное несоответствие оформить отдельно от новой формулы.
- [ ] T1. `proto/hema/v1/stage.proto` — аддитивные candidates/source_groups,
  decision/reason enums и документация отсутствия standing/place; DTO в
  `web/src/entities/stage/lib/types.ts`. Proto lint, `make generate`;
  согласовать номера с общей контрактной волной и смержить основу.

## Server

- [ ] T2. `domain/selection_explanation_test.go`, регрессии `seeding_test.go`
  → проекция объяснения и trace существующего селектора: AC-1..6/8,
  фактическое применение ручного ответа, добор, open-ended окно, группа
  без таблицы. Прежние Entries/Ties/Seeds неизменны на эталоне T0.
- [ ] T3. `service/selection_explanation_test.go` → расширение конвейера
  `service/seeding.go`: один набор исходных данных для таблиц и объяснений,
  members без standings, снятые со статистикой, current-roster без рангов,
  отсутствие writes. Ошибки портов не заменяются пустыми «успешными» данными.
- [ ] T4. `api/seeding_test.go` → `api/selection_explanation.go` и
  `handler.go`: httptest+Connect payload, auth guest/user/admin, no-rule,
  not-found, прежние блокировки build; `Preview` не меняет состав (AC-9/10).

## Web

- [ ] T5. `app/api/stages/[stageId]/build/preview/route.e2e.test.ts` и
  serializer-тесты → `lib/grpc/serialize.ts`/helpers: omitted-поля,
  nullable standing, enum/нулевая статистика. Настоящие protobuf schemas,
  DTO совместим со старым пустым preview. Сразу `pnpm exec tsc --noEmit`.
- [ ] T6. `features/stage-build/ui/selection-explanation.test.tsx`,
  `build-stage-dialog.test.tsx` → панель и интеграция: все кандидаты,
  таблицы групп, причины, неизменные места при ручном выборе, групповой
  источник/ростер, переполнение без «слота 0»; refresh/ошибка/pending,
  изменение ответов требует нового preview, поздние ответы безопасны.
  При необходимости hook/fetcher tests → минимальные изменения API-хуков.

## Проверка

- [ ] T7. Join: regenerate, полный цикл группы → preview → дележ → build
  основной/утешительной ветки по эталону T0. Сверить причины с фактическими
  слотами; повторное открытие не изображает исторический журнал. AC-1..10.
- [ ] T8. `make test-all`; `cd server && go build ./...`; в web
  `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`. Браузерная проверка
  360/390 px, клавиатура, длинные имена, доступность действий в диалоге.
- [ ] T9. После приёмки координатор обновляет статусы spec/plan/tasks,
  `docs/specs/README.md` и M02/M07/M23 аудита. Не объявлять весь M23 закрытым
  без отдельных критериев 0053/0051 и полного сценария формирования.
