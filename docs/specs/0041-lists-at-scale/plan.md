# Plan: Списки на масштабе и экспорт

> Артефакт SDD (ADR 0008). Описывает **КАК** реализуем `spec.md` в архитектуре
> проекта. Заполняется только когда в `spec.md` нет открытых
> `[NEEDS CLARIFICATION]`.

- Статус: draft
- Дата: 2026-08-27
- Спека: `./spec.md`

## Обзор решения

Три независимых по файлам куска, без новых модулей и без миграций (ни одна
из трёх частей не меняет модель данных — только форму чтения):

1. **Серверный поиск/фильтр/постраничность** — `ListApplications` (модуль
   `application`) и `ListRoster` (модуль `fighter`) получают в запрос
   статусы/номинации/клуб/поиск/`limit`+`offset`, в ответ — отфильтрованную
   страницу, `total_count` для постраничной навигации и `status_counts` —
   счётчики по полному набору записей турнира, не зависящие от фильтра
   (домен уже вычисляет их на клиенте сегодня из полного списка — переносим
   вычисление на сервер вместе с фильтрацией). Клиентская логика фильтрации
   (`select-applications.ts`, `select-fighters.ts`) выносится в параметры
   запроса и TanStack Query key.
2. **Агрегирующие RPC живого статуса** — модуль `stage` уже владеет портами
   `ArenaProvider.ActiveArenas` и `NominationProvider.NominationsByTournament`
   (заведены спекой 0034 для `GetTournamentLive`), поэтому оба новых RPC —
   тонкая обёртка вокруг уже существующей логики `GetBoutBoard`/`ListStages`,
   вызванной в цикле по уже резолвленному списку площадок/номинаций, без
   новых межмодульных зависимостей.
3. **Экспорт CSV** — не требует изменений в `/proto` и на сервере: `ListRoster`
   (после п.1) и `GetNominationResults` (существующий RPC, 0021) уже отдают
   все нужные данные. Экспорт — новый BFF route на каждый список,
   форматирующий уже полученный ответ в CSV и отдающий его файлом; никакой
   доменной логики на сервере Go для экспорта не заводится.

## Контракты (proto)

> Источник истины API — `/proto`. Меняем только там, потом `make generate`.

### `proto/hema/v1/application.proto`

- `ListApplicationsRequest` — вместо `optional ApplicationState status` и
  `optional string nomination_id`:
  - `repeated ApplicationState statuses = 2;` (пусто = без ограничения,
    как сегодня `optional` при отсутствии значения)
  - `repeated string nomination_ids = 3;`
  - `optional bool needs_equipment = 4;`
  - `optional string search = 5;` (подстрока по имени и клубу, без учёта
    регистра — семантика 0025 FR-10)
  - `int32 limit = 6;`
  - `int32 offset = 7;`
  - `tournament_id` — без изменений (поле 1)
- `ListApplicationsResponse`:
  - `repeated Application applications = 1;` — без изменений по форме
    элемента, теперь это страница, не весь список
  - `int32 total_count = 2;` — число заявок, подходящих под фильтр (для
    постраничной навигации, FR-5)
  - `repeated ApplicationStatusCount status_counts = 3;` — счётчик по
    каждому статусу **без учёта фильтра/поиска** (FR-4), новое сообщение
    `ApplicationStatusCount { ApplicationState status = 1; int32 count = 2; }`
- Обратная совместимость полей 2/3 (`status`/`nomination_id`) не сохраняется:
  единственный вызывающий — сам BFF-fetcher (`listApplicationsOverviewRequest`),
  внешних потребителей контракта нет — правим оба конца одним PR.

### `proto/hema/v1/fighter.proto`

- `ListRosterRequest` — вместо одного `optional string tournament_id`:
  - `tournament_id` — без изменений (поле 1)
  - `repeated FighterStatus statuses = 2;`
  - `repeated string nomination_ids = 3;` (участие активное, 0026 FR-8)
  - `repeated string clubs = 4;` (0026 FR-9)
  - `bool include_no_club = 5;` (отдельный флаг, а не значение в `clubs` —
    клуб «пусто» не строка, которую можно перепутать с реальным именем)
  - `optional string search = 6;`
  - `int32 limit = 7;`
  - `int32 offset = 8;`
- `ListRosterResponse`:
  - `repeated Fighter fighters = 1;` — страница
  - `int32 total_count = 2;`
  - `repeated FighterStatusCount status_counts = 3;`
    (`FighterStatusCount { FighterStatus status = 1; int32 count = 2; }`)

### `proto/hema/v1/stage.proto`

- Новое сообщение `ArenaBoardEntry { string arena_id = 1; BoutBoard board = 2; }`
  (`board` не заполнено — на площадке никто не стоит, семантика как у
  сегодняшнего `GetBoutBoardResponse.board`).
- `rpc GetArenaBoards(GetArenaBoardsRequest) returns (GetArenaBoardsResponse);`
  в `StageAdminService`, рядом с `GetBoutBoard`.
  - `GetArenaBoardsRequest { string tournament_id = 1; }`
  - `GetArenaBoardsResponse { repeated ArenaBoardEntry entries = 1; }` — одна
    запись на каждую **неархивную** площадку турнира (`ArenaProvider.
    ActiveArenas`, тот же охват, что у `useArenaBoards` сегодня).
- Новое сообщение `NominationStagesEntry { string nomination_id = 1;
  repeated Stage stages = 2; repeated SchemaIssue issues = 3; }` — та же
  форма, что уже отдаёт `ListStagesResponse` на одну номинацию.
- `rpc ListStagesForTournament(ListStagesForTournamentRequest) returns
  (ListStagesForTournamentResponse);` в `StageAdminService`, рядом с
  `ListStages`.
  - `ListStagesForTournamentRequest { string tournament_id = 1; }`
  - `ListStagesForTournamentResponse { repeated NominationStagesEntry
    entries = 1; }` — одна запись на каждую номинацию турнира
    (`NominationProvider.NominationsByTournament`, тот же охват, что у
    `useNominationSchemas` сегодня).
- `GetNominationResults`, `admin.proto` (`ListUsers`) — без изменений.

## Server (модули и слои)

> См. ADR 0002 (модульный монолит) и `server/AGENTS.md`. Новых модулей и
> PG-схем нет — расширяются существующие `application`, `fighter`, `stage`.

### `modules/application/`

- `domain/domain.go` — `ListFilter` (или расширение существующей сигнатуры):
  `Statuses []State`, `NominationIDs []string`, `NeedsEquipment *bool`,
  `Search *string`, `Limit`, `Offset`. Доменная ошибка не нужна — пустой
  фильтр = как сегодня «все заявки».
- `service/service.go` — `ListApplications` принимает `ListFilter`, возвращает
  `(items []Application, total int, statusCounts map[State]int, err error)`.
  `statusCounts` считается отдельным вызовом репозитория **без** применения
  `Search`/`NeedsEquipment`/`NominationIDs`/`Limit`/`Offset` — только
  `tournament_id` (FR-4).
- `repo/repo.go` + `repo/queries/application.sql` — `ListByTournament`
  получает `WHERE` по статусам (`= ANY`), номинациям (`= ANY`), экипировке —
  всё это уже читаемые поля read-модели заявки. **Поиск по имени — не чистый
  SQL**: отображаемое имя заявителя (`applicantDisplayName`, то, что ищет
  сегодня `select-applications.ts`) — это `ApplicantNameOverride` (хранится
  локально), если задан, иначе имя резолвится через `UserProvider.
  DisplayNames` из модуля `auth` (ADR 0002 запрещает читать чужую PG-схему
  напрямую, join невозможен). Поэтому `Search`, когда он задан:
  1. репозиторий фильтрует по статусу/номинации/экипировке и по `ILIKE`
     **клубу и `ApplicantNameOverride`** в SQL, **без** `LIMIT`/`OFFSET`
     (кандидаты внутри турнира, обычно те же сотни-тысячи, что и сегодня
     загружаются на клиент целиком — не хуже текущего);
  2. `service.ListApplications` резолвит имена кандидатов через `s.users.
     DisplayNames` (уже существующий вызов, как в `enrichViews`), досеивает
     по подстроке в эффективном имени (override ИЛИ резолвленное) — те, что
     не прошли по override/club в SQL, но проходят по резолвленному имени;
     затем считает `total_count` и режет `Limit`/`Offset` уже в Go.
  Когда `Search` пуст — путь простой: `WHERE`+`ILIKE` по клубу (по
  override — избыточно, но не мешает) +`LIMIT`/`OFFSET` целиком в SQL,
  `total_count` — отдельным `COUNT(*)` с теми же `WHERE`. Это и есть путь,
  который реально снимает предел NFR-1 (постраничная навигация без поиска —
  самый частый сценарий); с активным поиском по имени сервер всё ещё
  вынужден резолвить имена всех кандидатов по остальным фильтрам за один
  запрос — та же цена, что сегодня платит `enrichViews` на **любой** список,
  не новая деградация, а сохранение существующего предела именно для этого
  измерения (см. «Риски»).
  Отдельный `-- name: CountByTournamentStatus :many` (`GROUP BY status`,
  только по `tournament_id`, без остальных фильтров) — для `status_counts`
  (FR-4).
- `api/handler.go` — маппинг новых полей `ListApplicationsRequest`↔`ListFilter`,
  сборка `ApplicationStatusCount` в ответе.

### `modules/fighter/`

- `domain/domain.go` — аналогичный `RosterFilter`: `Statuses`, `NominationIDs`,
  `Clubs`, `IncludeNoClub`, `Search`, `Limit`, `Offset`.
- `service/service.go` — `ListRoster` принимает `RosterFilter`, возвращает
  `(items []Fighter, total int, statusCounts map[FighterStatus]int, err error)`;
  `statusCounts` — без фильтров, только `tournament_id` (FR-4).
- `repo/repo.go` + `repo/queries/fighter.sql` — `ListByTournament` получает
  `WHERE`/`JOIN` по статусу, активному участию в номинациях (существующая
  связь бойца с номинациями), клубу (`= ANY` + `OR club = '' /* IncludeNoClub */`),
  `ILIKE` по имени/клубу, `LIMIT`/`OFFSET`; отдельный
  `-- name: CountByTournamentStatus :many`.
- `api/handler.go` — маппинг полей, сборка `FighterStatusCount`.

### `modules/stage/`

- `service/service.go` — `GetArenaBoards(ctx, tournamentID)`: резолвит
  `ArenaProvider.ActiveArenas(tournamentID)`, для каждой площадки вызывает
  уже существующую внутреннюю функцию, которой сегодня пользуется одиночный
  `GetBoutBoard` (не дублировать SQL/логику — выделить общий приватный метод,
  если его ещё нет как отдельной функции от хендлера).
  `ListStagesForTournament(ctx, tournamentID)`: резолвит
  `NominationProvider.NominationsByTournament(tournamentID)`, для каждой
  номинации вызывает существующую внутреннюю логику `ListStages` (этапы +
  `SchemaIssue`-диагностика).
- `api/handler.go` — новые хендлеры `GetArenaBoards`/`ListStagesForTournament`,
  маппинг в `ArenaBoardEntry`/`NominationStagesEntry`.
- Миграций нет — обе агрегирующие ручки читают то же самое, что и одиночные.

### Общее

- Межмодульные зависимости: без изменений (`stage` уже зависит от `arena` и
  `nomination` через существующие порты).
- Валидация `limit`/`offset`: та же политика, что и `ListUsers` сегодня
  (сервис не задаёт свой дефолт/потолок сверх уже принятого в проекте —
  если у `ListUsers` дефолта/потолка нет, здесь он тоже не заводится этим
  инкрементом).

## Web (FSD + BFF)

> См. ADR 0005 (UI) и ADR 0006 (state), `web/AGENTS.md`.

### Серверный поиск/фильтр/постраничность

- BFF: `app/api/applications/route.ts` (актуальный путь —
  проверить `listApplicationsOverviewRequest`) и роут ростера — принимают
  `statuses[]`, `nominationIds[]`, `needsEquipment`, `clubs[]`, `includeNoClub`,
  `search`, `page`/`limit` query-параметрами, пробрасывают в gRPC-запрос,
  возвращают `{applications, totalCount, statusCounts}` /
  `{fighters, totalCount, statusCounts}`.
- `features/application-review/api/requests.ts` + `use-applications-overview.ts`:
  сигнатура фетчера принимает полный набор фильтров + `page`; query key
  включает все фильтры и номер страницы (инвалидация здесь не нужна —
  фильтр сам меняет key).
- `features/application-review/lib/select-applications.ts` — логика фильтрации
  массива удаляется; остаётся (если нужно) чистая функция сортировки/группировки
  уже полученной страницы (терминальные заявки в конец и т.п., 0025 FR-6),
  если она не выражается через `ORDER BY` в repo проще, чем через доп. поле
  сортировки в контракте.
- `features/application-review/ui/applications-filters.tsx` — те же контролы,
  меняют состояние фильтра в родительском компоненте (или в URL search params
  — решается при реализации, не меняет FR), а не локальный массив.
- `features/application-review/ui/applications-table.tsx` — постраничная
  навигация переключается с клиентской (весь массив в памяти) на серверную
  (номер страницы в query key, `totalCount` для числа страниц).
- Симметрично для `features/fighter-management/{api,lib,ui}` (`use-roster.ts`,
  `select-fighters.ts`, `fighters-filters.tsx`, `fighters-table.tsx`).

### Агрегирующие живые статусы

- BFF: новый `app/api/tournaments/[id]/arena-boards/route.ts` — вызывает
  `stageAdminClient.getArenaBoards`, отдаёт `{entries}`.
- `features/arena-management/api/use-arena-boards.ts` — переписывается с
  `useQueries` (N вызовов `getArenaBoardRequest`) на один `useQuery` c тем же
  `refetchInterval` (10с, FR-9) поверх нового BFF route; сигнатура хука
  (`Map<string, ArenaBoardState>`) не меняется — вызывающий код
  (`arena-management/ui/*`) не трогается.
- BFF: новый `app/api/tournaments/[id]/nomination-schemas/route.ts` —
  вызывает `stageAdminClient.listStagesForTournament`, отдаёт `{entries}`.
- `features/nomination-management/api/use-nomination-schemas.ts` —
  переписывается с `useQueries` на один `useQuery` без `refetchInterval`
  (FR-10, холодные данные), возвращаемая сигнатура (`Map<string,
  NominationSchema>`) не меняется.

### Экспорт CSV

- Новый общий хелпер `shared/lib/csv.ts` — сериализация строк в CSV
  (RFC 4180: кавычки при запятой/переносе строки/кавычке внутри значения,
  UTF-8). Чистая функция, юнит-тестируется без сети.
- BFF: `app/api/fighters/export/route.ts` (или соответствующий текущему
  роуту ростера путь + `/export`) — принимает те же query-параметры
  фильтра, что и роут ростера (FR-14: экспорт учитывает активный фильтр),
  вызывает `ListRoster` с этим фильтром и `limit`, покрывающим весь
  отфильтрованный набор (постранично добрать все страницы либо один вызов
  с большим `limit` — деталь реализации), формирует CSV (FR-11), отдаёт с
  `Content-Type: text/csv; charset=utf-8` и `Content-Disposition:
  attachment; filename="roster.csv"`.
- BFF: `app/api/nominations/[id]/results/export/route.ts` — вызывает
  `GetNominationResults`, если протокола ещё нет (0021 FR-15 — нет
  завершённого терминального этапа) отвечает 409/понятной ошибкой (FR-13);
  иначе форматирует секции по терминальным этапам в CSV (FR-12) с общим
  хелпером `shared/lib/csv.ts`.
- UI: кнопка «Экспорт» в `features/fighter-management/ui/fighters-screen.tsx`
  (рядом с шапкой раздела, по аналогии с уже убранной кнопкой макета,
  0026 FR-23) — ссылка/действие на BFF-route с текущими query-параметрами
  фильтра ростера. Кнопка «Экспорт» в `widgets/nomination-results/
  nomination-results.tsx` — активна только когда есть хотя бы одна секция
  протокола (FR-13), иначе задизейблена с подсказкой причины.
- Скачивание файла — обычная навигация браузера на URL BFF route (не
  `fetch`+blob): route отдаёт файл с нужными заголовками, специального
  клиентского кода не требуется.

## События

> Placeholder. Event-Driven Design ещё не введён.

- Издаёт: нет
- Потребляет: нет

## Тестирование

> См. ADR 0003 (стратегия) и ADR 0009 (TDD-цикл).

- Юнит (`server/modules/application/service`, `.../fighter/service` с
  fake-репо): фильтрация по каждому измерению по отдельности и в комбинации
  (И), `status_counts`/`total_count` не зависят от фильтра, постраничность
  (limit/offset), пустой фильтр = поведение как до инкремента.
- Юнит (`server/modules/stage/service` с fake `ArenaProvider`/
  `NominationProvider`): `GetArenaBoards`/`ListStagesForTournament` возвращают
  запись на каждую активную площадку/номинацию, ошибка одной не роняет
  остальные (сохранить поведение `retry:false`/`isError` уровня записи —
  решить на уровне ответа: запись есть всегда, `board`/`stages` пустые при
  внутренней ошибке резолва одной площадки/номинации, как сегодня на клиенте).
- E2E ручек (`api/` через httptest + Connect, все три модуля): счастливый
  путь новых/изменённых RPC, edge-кейсы (пустой турнир, все страницы
  вычерпаны, поиск без совпадений).
- Web (Vitest): обновлённые фетчеры/хуки (`use-applications-overview.ts`,
  `use-roster.ts`, `use-arena-boards.ts`, `use-nomination-schemas.ts`) —
  сборка query-параметров, маппинг ответа; `shared/lib/csv.ts` — чистые
  тесты сериализации (запятая, кавычка, перенос строки, юникод); BFF-роуты
  экспорта — `*.e2e.test.ts` по образцу существующих (реальный CSV из
  мок-ответа gRPC), проверка заголовков `Content-Type`/`Content-Disposition`
  и кода ошибки, когда протокола ещё нет.

## Риски и открытые вопросы

- **Поиск по имени заявителя не полностью в SQL** (только модуль
  `application` — у `fighter` имя/клуб свои поля бойца, ограничение не
  действует). Отображаемое имя — `ApplicantNameOverride` (локально) или имя
  из `auth` через `UserProvider.DisplayNames` (кросс-модульно, ADR 0002
  запрещает join). При активном поиске сервис резолвит имена кандидатов,
  прошедших SQL-фильтр по статусу/номинации/экипировке, и досеивает по
  подстроке в Go — та же цена, что уже платит `enrichViews` на любой
  сегодняшний список, не новая деградация (раздел «Server», `modules/
  application/`). Без активного поиска путь целиком в SQL с `LIMIT`/`OFFSET`.
- **Две БД-операции на один список** (страница + счётчики по статусу) —
  осознанный компромисс ради FR-4 (счётчики не зависят от фильтра); счётчик
  — дешёвый `GROUP BY status` по индексированному `tournament_id`, риск
  производительности не ожидается на масштабах турнира.
- **Скачивание файла из BFF Route Handler** — в проекте нет прецедента
  file-download ответа (`Content-Disposition`); первое место, где это
  делается — проверить на реальном браузере (не только Vitest), что
  заголовки долетают через Next.js Route Handler без искажений.
- **Общий метод `GetBoutBoard`/`ListStages` для одиночного и агрегирующего
  RPC** — при реализации проверить, что внутренняя логика уже вынесена в
  метод сервиса, не размазана по `api/handler.go`; если размазана —
  небольшой рефактор перед добавлением агрегирующей ручки, не новая
  архитектура.
- **`select-applications.ts`/`select-fighters.ts` после переноса фильтрации
  на сервер** — если там остаётся чистая функция сортировки страницы,
  решить при реализации: сортировка тоже уходит в `ORDER BY` репозитория
  (проще, но требует поля сортировки в контракте) или остаётся клиентской
  над уже отфильтрованной страницей (меньше правок контракта). Предпочтение
  — второе, если сортировка не зависит от данных за пределами страницы.
