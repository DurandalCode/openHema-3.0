# Plan: Массовое добавление существующих бойцов в номинацию

- Статус: draft
- Дата: 2026-09-25
- Спека: [spec.md](./spec.md)
- Условие: проект плана для согласования D-BULK; реализация не начата.

## Обзор решения

Расширить существующий `FighterAdminService` одним доменным bulk RPC. Браузер
отправляет один список ID; сервер отвечает отчётом по бойцам. Не организовывать
финальное решение циклом из браузерных AddToNomination: тогда правила частичного
результата и повторения зависели бы от жизненного цикла страницы.

Опоры: 0007 (участия), 0041 (ростер/пагинация), 0049 (отчёт по строкам),
`fighter/service/import.go`, `fighter/domain/domain.go`,
`features/fighter-management/ui/fighters-screen.tsx`. Важное отличие:
`Fighter.AddParticipation` сейчас **восстанавливает** removed, а обычный
`Repo.Update` сохраняет весь агрегат. Ни тот, ни другой нельзя слепо использовать
для bulk с обещанием «не восстанавливать» и защиты от устаревшего снимка.

## Контракты (proto)

`proto/hema/v1/fighter.proto`, только добавления:

- `FighterAdminService.BulkAddToNomination(BulkAddToNominationRequest)` →
  `BulkAddToNominationResponse`.
- Request: `string tournament_id = 1`, `string nomination_id = 2`,
  `repeated string fighter_ids = 3`. Tournament обязателен, без неявного выбора
  активного турнира; не принимать фильтр вместо конкретных ID.
- Response: `repeated BulkParticipationRow rows = 1`,
  `BulkParticipationSummary summary = 2`.
- Row: `string fighter_id = 1`, `string name = 2`,
  `BulkParticipationOutcome outcome = 3`, `BulkParticipationError error = 4`.
  Для неизвестного/чужого бойца имя пусто; порядок — первое появление ID.
- Outcome: `UNSPECIFIED=0`, `ADDED=1`, `ALREADY_ACTIVE=2`, `REJECTED=3` с
  полным префиксом `BULK_PARTICIPATION_OUTCOME_`.
- Error: `UNSPECIFIED=0`, `FIGHTER_NOT_FOUND=1`, `WRONG_TOURNAMENT=2`,
  `FIGHTER_WITHDRAWN=3`, `FIGHTER_MERGED=4`, `PARTICIPATION_REMOVED=5`,
  `INVALID_FIGHTER_ID=6` с префиксом `BULK_PARTICIPATION_ERROR_`.
- Summary: `int32 requested = 1`, `int32 added = 2`,
  `int32 already_active = 3`, `int32 rejected = 4`.
  `requested` — количество уникальных ID, совпадает с длиной rows.

Лимит 1–1000 проверяется на исходном массиве; дубликаты затем объединяются.
Пустой/некорректный fighter ID — ошибка соответствующей строки; неверные
общие поля → `InvalidArgument`, отсутствующая/чужая nomination → `NotFound`
до записи. Непредвиденная ошибка БД или отмена контекста прерывает запрос
RPC-ошибкой: уже завершённые строки могли примениться. Не превращать неизвестный
сбой в успешный отчёт. Повтор всей команды безопасен по естественному ключу
участия, отдельный idempotency key и хранение истории bulk здесь не нужны.

## Server (модули и слои)

- Модуль: расширение `modules/fighter`, без нового bounded context.
- `domain/bulk_participation.go`: собственные типы команды/отчёта, чистая
  классификация fighter/status/participation. Использовать существующие enum,
  не дублировать правила статусов в API.
- `service/bulk_participation.go`: проверить общие поля, один раз получить
  nomination через существующий `NominationProvider` и сверить tournament;
  далее выполнять строки, сохраняя порядок и считая summary.
- `domain.Repository`: узкий метод `AddMissingParticipation(ctx, tournamentID,
  fighterID, nominationID) (BulkParticipationRow, error)`. Он проверяет
  актуальные статусы и вставляет только отсутствующее участие; внутри него
  переиспользуется доменная классификация, а не полная перезапись Fighter.
- `repo/bulk_participation.go` + `repo/queries/fighter.sql`: транзакция на одну
  строку; `SELECT` бойца `FOR UPDATE`, чтение участия, проверка условий,
  `INSERT ... ON CONFLICT (fighter_id, nomination_id) DO NOTHING`, чтение
  фактического результата при конфликте. Никакого `DO UPDATE status='active'`.
  Для существующего участия блокировать/читать его в этой транзакции;
  неизвестный/чужой/withdrawn/merged/removed возвращает строковый исход без
  мутации. Не вызывать полный `Update` и не переписывать прочие участия.
  Согласовать lock order с существующими single-row операциями; concurrency
  тест обязательно включает одновременное снятие/редактирование.
- `testutil/fake_repo.go`: семантически эквивалентный метод для unit/API.
- `api/bulk_participation_handler.go`: proto mapping, `RequireAdmin` от
  существующего сервиса; проверить регистрацию новой процедуры политикой RBAC.
- `migrations/`: **DDL не меняется**. Используются существующие
  `fighter.fighters`, `fighter.participations`, UNIQUE
  `uq_participations_fighter_nomination`; новых таблиц, колонок, FK, индексов,
  CHECK, сидов и backfill нет. `make sqlc` нужен из-за новых запросов.
- Wiring: новый сервис не нужен; существующие зависимости остаются. При
  расширении repository interface обновить все его реализации/фейки.
- Межмодульные зависимости: только существующий `NominationProvider`.
  Не читать nomination/stage/bout-таблицы из fighter.

## Web (FSD + BFF)

- `POST /api/admin/fighters/bulk-nomination` →
  `web/src/app/api/admin/fighters/bulk-nomination/route.ts`, `runtime=nodejs`.
  Body `{ tournamentId, nominationId, fighterIds }`; JSON отчёта c lower camel
  case полями и явными enum→DTO значениями, а не утечкой protobuf чисел.
  Access token только из httpOnly cookie; сервер проверяет admin.
- `features/fighter-management/api/bulk-participation.ts` и
  `use-bulk-participation.ts`: один REST запрос, TanStack mutation. После
  успеха/частичного результата инвалидировать roster/full roster и затронутый
  nomination roster; после транспортного сбоя обновить чтение без потери выбора.
- `model/bulk-selection.ts`: локальный reducer для ID и filter identity;
  подключение через `useReducer` в FightersScreen. Server-state не хранить
  в reducer, selection не выводить из текущей страницы.
- `ui/fighters-table.tsx`, `fighter-row.tsx`: доступные checkbox строки и
  текущей страницы, indeterminate, click checkbox не открывает карточку.
- `ui/bulk-participation-dialog.tsx`: одна номинация, число ID, запуск, pending,
  построчный отчёт и summary. Ошибки выбора — inline, успешный итог — обёртка
  `shared/lib/toast.ts`; частичные ошибки остаются в отчёте. Это обратимое
  добавление — не вводить ConfirmDialog с вводом названия.
- `ui/fighters-screen.tsx`: владеет выбором и сбросом при смене фильтра;
  при смене tournament размонтировать/сбросить локальное состояние.

## События

- Издаёт/потребляет: нет новых событий и межмодульной шины.
- Добавление участия не выполняет автоматическое изменение посева.

## Тестирование

- Service/domain: AC-3..8; preflight без записей, порядок, суммы, дубликаты,
  partial domain failures, инфраструктурный сбой после частичного применения.
- API httptest + Connect: реальная проверка RBAC, enum mapping, request-level
  errors отдельно от row-level, invalid ID строки без Internal.
- PostgreSQL integration: UNIQUE, два bulk одновременно, снятое участие не
  восстанавливается, параллельная правка не теряется, rollback только строки.
- BFF Vitest e2e: реальная proto-сериализация через `create(Schema, ...)`,
  forwarding token, 401/403/400/404/500 и частичный 200.
- UI: AC-1/2/9, сохранение между страницами, сброс всех разновидностей фильтра,
  report при transport retry, keyboard/checkbox event propagation.

## Риски и открытые вопросы

- D-BULK блокирует реализацию, но не подготовку данного условного проекта.
- Не обещаем идентичный отчёт при повторе: ADDED превращается в ALREADY_ACTIVE;
  обещаем отсутствие дублей/неожиданного восстановления.
- Общие файлы с другими треками: `fighter.proto`, `fighter/domain/domain.go`
  (Repository), `fighter/repo/queries/fighter.sql`, `fighter/testutil/fake_repo.go`,
  FightersScreen/Table/Row. Изменения импорта и канонизации клубов в этих местах
  сериализовать через координатора; текущие пользовательские изменения не терять.
- Можно реализовывать независимо от арены и графа сетки после D-BULK; объединение
  с заменами/техисходами требует regression состава. Не вводить новое
  архитектурное решение или ADR ради использования существующих границ.
