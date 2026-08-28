# Tasks: Списки на масштабе и экспорт

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: done
- Дата: 2026-08-27
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах.

## Треки и параллельность

Три куска не пересекаются по файлам: `application` (заявки), `fighter`
(ростер + экспорт ростера — тот же модуль/экран), `stage` (агрегирующие
живые статусы). Экспорт протокола номинации зависит только от уже
существующего `GetNominationResults` — файлово не пересекается ни с одним
треком и идёт параллельно им. `shared/lib/csv.ts` — общий файл экспортных
задач фронта (F и G), выносится в отдельную join-задачу перед ними, чтобы
оба фронтовых куска не писали его дважды.

| Волна | Трек | Задачи | Файлы (не пересекаются внутри волны) | Зависит от |
| ----- | ---- | ------ | ------------------------------------- | ---------- |
| 0     | —    | T1     | `proto/hema/v1/{application,fighter,stage}.proto` | — |
| 1     | A    | T2–T6  | `server/modules/application/**` | волна 0 |
| 1     | B    | T7–T11 | `server/modules/fighter/**` | волна 0 |
| 1     | C    | T12–T14 | `server/modules/stage/**` | волна 0 |
| 2     | join | T15    | `web/src/shared/lib/csv.ts` (+тест) | волна 1 не нужна, но проще после контрактов |
| 2     | D    | T16–T19 | `web/src/features/application-review/**`, `web/src/app/api/applications/**` | трек A смержен |
| 2     | E    | T20–T24 | `web/src/features/fighter-management/**`, `web/src/app/api/{fighters,fighters/export}/**` | трек B смержен, T15 |
| 2     | F    | T25–T28 | `web/src/features/arena-management/api/use-arena-boards.ts`, `web/src/app/api/tournaments/[id]/arena-boards/**` | трек C смержен |
| 2     | G    | T29–T32 | `web/src/features/nomination-management/api/use-nomination-schemas.ts`, `web/src/app/api/tournaments/[id]/nomination-schemas/**` | трек C смержен |
| 2     | H    | T33–T35 | `web/src/app/api/nominations/[id]/results/export/**`, `web/src/widgets/nomination-results/**` | T15 (не ждёт server-треков) |
| 3     | join | T36–T38 | проверка | все треки смержены |

## Контракты

- [x] T1. `proto/hema/v1/application.proto`, `fighter.proto`, `stage.proto` —
      поля фильтра/постраничности `ListApplicationsRequest`/`ListRosterRequest`,
      `total_count`/`status_counts` в ответах, новые сообщения
      `ApplicationStatusCount`/`FighterStatusCount`/`ArenaBoardEntry`/
      `NominationStagesEntry`, RPC `GetArenaBoards`/`ListStagesForTournament`
      в `StageAdminService` (план, разделы «Контракты»). `make generate`.

## Server — трек A: `application`

- [x] T2. **domain** — `domain/domain.go`: `ListFilter{Statuses,
      NominationIDs, NeedsEquipment, Search, Limit, Offset}`.
- [x] T3. **service (red→green)** — `service/service_test.go`: фильтр по
      каждому измерению и в комбинации, `status_counts`/`total_count` не
      зависят от `Search`/`NeedsEquipment`/`NominationIDs` (fake-репо) →
      `service/service.go`.
- [x] T4. **fake repo** — `testutil/fake_repo.go`: поддержать фильтрацию в
      памяти для тестов T3 (счастливый путь + пустой результат).
- [x] T5. **repo (red→green)** — `repo/queries/application.sql`: `WHERE`/
      `ILIKE`/`LIMIT`/`OFFSET` + `CountByTournamentStatus`; `make sqlc`;
      `repo/repo.go` — реализация; интеграционный тест на testcontainers
      (существующий стенд `internal/testdb`) на реальных данных.
- [x] T6. **api (red→green)** — `api/handler_test.go`: маппинг новых полей
      запроса/ответа → `api/handler.go`.

## Server — трек B: `fighter`

- [x] T7. **domain** — `domain/domain.go`: `RosterFilter{Statuses,
      NominationIDs, Clubs, IncludeNoClub, Search, Limit, Offset}`.
- [x] T8. **service (red→green)** — `service/service_test.go`: то же
      покрытие, что T3, плюс клуб/«без клуба» → `service/service.go`.
- [x] T9. **fake repo** — `testutil/fake_repo.go`: фильтрация в памяти.
- [x] T10. **repo (red→green)** — `repo/queries/fighter.sql` + `CountByTournamentStatus`;
      `make sqlc`; `repo/repo.go`; интеграционный тест testcontainers.
- [x] T11. **api (red→green)** — `api/handler_test.go` → `api/handler.go`.

## Server — трек C: `stage` (агрегирующие RPC)

- [x] T12. **service, вынос общей логики (если размазана по хендлеру,
      план «Риски»)** — `service/service.go`: убедиться, что логика
      одиночного `GetBoutBoard`/`ListStages` доступна как метод сервиса,
      вызываемый в цикле.
- [x] T13. **service (red→green)** — `service/service_test.go` с
      fake `ArenaProvider`/`NominationProvider`: `GetArenaBoards` — запись
      на каждую активную площадку, `ListStagesForTournament` — запись на
      каждую номинацию турнира, ошибка резолва одной не роняет остальные →
      `service/service.go`.
- [x] T14. **api (red→green)** — `api/handler_test.go`: новые хендлеры
      `GetArenaBoards`/`ListStagesForTournament` (httptest + Connect,
      fake-сервис) → `api/handler.go`.

## Web — join: общий CSV-хелпер

- [x] T15. **shared/lib/csv.ts (red→green)** — `csv.test.ts`: экранирование
      запятой/кавычки/переноса строки, UTF-8 → `csv.ts`.

## Web — трек D: заявки (поиск/фильтр/постраничность)

- [x] T16. **BFF (red→green)** — роут `ListApplications`: query-параметры
      фильтра/страницы → gRPC; `*.test.ts` (мок транспорта) → код роута.
- [x] T17. **api/requests+keys** — `features/application-review/api/requests.ts`,
      `keys.ts`: новая сигнатура фетчера с полным фильтром и страницей;
      тесты фетчера (мок `fetch`).
- [x] T18. **use-applications-overview** — `use-applications-overview.ts`:
      query key включает все фильтры и страницу; возвращает
      `{applications, totalCount, statusCounts}`.
- [x] T19. **ui** — `applications-filters.tsx`, `applications-table.tsx`:
      переключение с локальной фильтрации/пагинации (`select-applications.ts`)
      на серверную; `select-applications.ts` — оставить только пере-сортировку
      уже полученной страницы, если она не выражена `ORDER BY` (план,
      «Риски»); обновить тесты компонентов.

## Web — трек E: ростер (поиск/фильтр/постраничность + экспорт)

- [x] T20. **BFF (red→green)** — роут `ListRoster`: query-параметры фильтра/
      страницы → gRPC; `*.test.ts` → код роута.
- [x] T21. **api/requests+keys** — `features/fighter-management/api/requests.ts`,
      `keys.ts`: новая сигнатура фетчера; тесты.
- [x] T22. **use-roster** — `use-roster.ts`: query key с фильтрами/страницей,
      `{fighters, totalCount, statusCounts}`.
- [x] T23. **ui** — `fighters-filters.tsx`, `fighters-table.tsx`: серверная
      фильтрация/пагинация; `select-fighters.ts` — только пере-сортировка
      страницы (см. T19); тесты компонентов.
- [x] T24. **экспорт (red→green)** — BFF `app/api/fighters/export/route.ts`
      (принимает те же фильтры, что T20, вызывает `ListRoster`, форматирует
      CSV через `shared/lib/csv.ts`) — `*.e2e.test.ts` (реальный CSV из
      мок-ответа gRPC, заголовки `Content-Type`/`Content-Disposition`) →
      код роута; кнопка «Экспорт» в `fighters-screen.tsx` (ссылка на роут с
      текущими query-параметрами фильтра) + тест.

## Web — трек F: агрегирующая доска площадок

- [x] T25. **BFF (red→green)** — `app/api/tournaments/[id]/arena-boards/route.ts`:
      вызывает `getArenaBoards`; `*.test.ts` → код роута.
- [x] T26. **requests** — `features/arena-management/api/requests.ts`: новый
      fetcher `getArenaBoardsRequest(tournamentId)`; тест.
- [x] T27. **use-arena-boards (red→green)** — переписать с `useQueries` (N)
      на один `useQuery` поверх T26, тот же `refetchInterval`/сигнатура
      возврата (`Map<string, ArenaBoardState>`); обновить тест.
- [x] T28. **проверка вызывающего кода** — `arena-management/ui/*`,
      `widgets/arena-console/*`: сигнатура хука не изменилась, значит правок
      не требуется — прогнать существующие тесты компонентов без изменений.

## Web — трек G: агрегирующая сводка номинаций

- [x] T29. **BFF (red→green)** — `app/api/tournaments/[id]/nomination-schemas/route.ts`:
      вызывает `listStagesForTournament`; `*.test.ts` → код роута.
- [x] T30. **requests** — `features/nomination-management/api/requests.ts`:
      новый fetcher `listNominationSchemasRequest(tournamentId)`; тест.
- [x] T31. **use-nomination-schemas (red→green)** — переписать с `useQueries`
      (N) на один `useQuery` без `refetchInterval` поверх T30, та же
      сигнатура (`Map<string, NominationSchema>`); обновить тест.
- [x] T32. **проверка вызывающего кода** — `nominations-screen.tsx`:
      сигнатура не меняется, прогнать существующие тесты без изменений.

## Web — трек H: экспорт протокола номинации

- [x] T33. **BFF (red→green)** — `app/api/nominations/[id]/results/export/route.ts`:
      вызывает `GetNominationResults`, 409 при отсутствии протокола (0021
      FR-15), иначе CSV-секции по терминальным этапам через
      `shared/lib/csv.ts`; `*.e2e.test.ts` (реальный CSV из мок-ответа,
      кейс «протокола ещё нет») → код роута.
- [x] T34. **requests** — fetcher/ссылка на роут экспорта в
      `widgets/nomination-results/` (или соответствующем `features/`, если
      там уже есть слой api); тест.
- [x] T35. **ui** — кнопка «Экспорт» в `widgets/nomination-results/
      nomination-results.tsx`, задизейблена без завершённого терминального
      этапа с понятной причиной (FR-13); тест.

## Проверка

- [x] T36. `make test-all` зелёный.
- [x] T37. `pnpm exec tsc --noEmit`.
- [x] T38. `go build ./...` + `pnpm build`; ручная проверка в браузере
      скачивания CSV из T24/T33 (заголовки `Content-Disposition` через
      реальный Next.js Route Handler, план «Риски» — нет прецедента в
      проекте).
- [x] T39. Обновить статус спеки/плана/индекс в `docs/specs/README.md`
      (`0041` → `done`).
