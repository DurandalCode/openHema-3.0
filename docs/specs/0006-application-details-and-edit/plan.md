# Plan: Доп. поля заявки, поиск и правка админом

> Артефакт SDD (ADR 0008). Описывает **КАК** реализуем `spec.md` в архитектуре
> проекта. Заполняется только когда в `spec.md` нет открытых
> `[NEEDS CLARIFICATION]`.

- Статус: done
- Дата: 2026-07-11
- Спека: `./spec.md`

## Обзор решения

Расширение существующего event-sourced модуля `application` (0005), **без нового
модуля и без нового ADR** (конвенции EDD уже приняты в ADR 0011). Добавляем к
агрегату три атрибута — `club`, `needs_equipment`, `applicant_name_override` —
и одно доменное событие `ApplicationAmended` (админская правка). Клуб и
экипировка входят в полезную нагрузку `ApplicationSubmitted` (задаются бойцом
при подаче) и в инлайн-проекцию. Правка идёт по тому же циклу **load → rebuild →
decide → append**: `ApplicationAmended` несёт новые значения полей (и опц.
номинацию/статус), свёртка применяет их поверх агрегата; журнал неизменен.

Отображаемое имя становится «override ?? auth»: обогащение в service-слое берёт
переопределение из проекции, а имя из `auth` (через `UserProvider`) — только как
фолбэк. Поиск на сводном экране — **клиентский**, поверх уже загруженного списка
турнира (как текущая фильтрация в `applications-overview`): матч по подстроке
имени и клуба; сервер лишь начинает отдавать `club` и актуальное имя (что и так
добавляется). Схема БД мигрируется **новой** миграцией `00002` (модуль 0005 уже
развёрнут): в `application_current` добавляются три колонки.

## Контракты (proto)

> Источник истины API — `/proto`. Меняем только там, потом `make generate`.

- Файл: `proto/hema/v1/application.proto` (правка существующего).
- Enum `ApplicationEventType` — добавить член:
  `APPLICATION_EVENT_TYPE_AMENDED = 6;` (админская правка).
- Сообщение `Application` — добавить поля:
  - `string club = 9;` — клуб бойца (может быть пустым).
  - `bool needs_equipment = 10;` — нужна ли экипировка.
  - (`applicant_display_name = 5` остаётся **эффективным** именем: override ??
    auth; отдельного поля override в выдаче не заводим — форма правки
    предзаполняется текущим эффективным именем.)
- `SubmitApplicationRequest` — добавить поля:
  - `string club = 2;` — клуб (опционально, «» = не указан).
  - `bool needs_equipment = 3;` — признак экипировки.
- `ApplicationAdminService` — добавить RPC:
  - `rpc EditApplication(EditApplicationRequest) returns (EditApplicationResponse);`
    — правка заявки (admin, `RequireAdmin`).
- Новые сообщения:
  - `EditApplicationRequest`:
    - `string application_id = 1;`
    - `string club = 2;` — желаемое значение клуба (полный снапшот поля).
    - `bool needs_equipment = 3;` — желаемое значение признака.
    - `string applicant_name_override = 4;` — «» = убрать override (имя из auth).
    - `optional string nomination_id = 5;` — присутствует ⇒ перенос в номинацию.
    - `optional ApplicationState state = 6;` — присутствует ⇒ ручная установка
      статуса (отсутствует ⇒ статус не трогаем).
  - `EditApplicationResponse` — `Application application = 1;`
- `NominationParticipant` (публичный) — **без изменений**: клуб/экипировка не
  публикуются (FR-2). Имя уже эффективное (override применяется в обогащении).
- Общие типы (`common.proto`): не требуются.
- После правки — `make generate`.

## Server (модули и слои)

> См. ADR 0002 (модульный монолит), ADR 0011 (EDD), `server/AGENTS.md`.

- Модуль: `modules/application/` — **расширение** (не новый bounded context).
- PG-схема: `application` (существует); добавляется миграция `00002`.
- Слои:
  - `domain/domain.go`:
    - Событие: `EventAmended EventType = "amended"`.
    - `Payload` — расширить (единый jsonb-контейнер полезной нагрузки события):
      - для `EventSubmitted` — добавить `Club string`, `NeedsEquipment bool`
        (плюс существующие `NominationID`/`TournamentID`/`ApplicantUserID`).
      - для `EventAmended` — использовать поля как **патч**: `Club string`,
        `NeedsEquipment bool`, `ApplicantNameOverride string`,
        `NominationID string` (пусто ⇒ номинацию не менять),
        `TournamentID string` (сопровождает смену номинации),
        `NewState State` (пусто ⇒ статус не менять). Клуб/экипировка/имя в
        `amended` — всегда полный желаемый снапшот этих полей.
    - Агрегат `Application` — добавить поля `Club string`,
      `NeedsEquipment bool`, `ApplicantNameOverride string`.
    - `ApplicationView` — добавить те же три поля (проекция/read-model).
    - `apply(Event)` — расширить свёртку:
      - `EventSubmitted` — инициализирует `Club`/`NeedsEquipment` из payload.
      - `EventAmended` — применяет патч: `Club`, `NeedsEquipment`,
        `ApplicantNameOverride` присваиваются из payload; если
        `payload.NominationID != ""` — переопределяет `NominationID`/
        `TournamentID`; если `payload.NewState != ""` — переопределяет `State`.
    - `Submit(...)` — сигнатуру расширить: принимает `club string,
      needsEquipment bool`, кладёт их в payload `Submitted`.
    - Команда `(a Application) Amend(actorID string, patch AmendPatch, now time.Time)
      (Event, error)` — доменное решение правки: только валидирует и формирует
      событие `EventAmended` с `Sequence = a.Version+1`; **не** проверяет
      существование номинации/дубли (это делает service через порты) и **не**
      проверяет терминальность (FR-9 — правка допустима в любом состоянии).
      `AmendPatch` — типизированный вход: `Club`, `NeedsEquipment`,
      `ApplicantNameOverride`, `NominationID *string`, `TournamentID string`
      (заполняется service при переносе), `NewState *State`.
    - Порт `Repository` — существующие методы возвращают/принимают расширенный
      `ApplicationView` (с club/needs_equipment/override). Новых методов **не
      требуется**: `Append` уже пишет проекцию из `ApplicationView`; поиск —
      клиентский. `ListByTournament` уже отдаёт весь турнир (поиск поверх него).
    - Порт `NominationProvider` — используется и для валидации целевой номинации
      при переносе (уже есть `Nomination(ctx, id) → {TournamentID, FighterCapacity}`;
      `ErrNominationNotFound` при отсутствии).
    - Доменные ошибки — переиспользуются: `ErrDuplicateActive` (перенос/ручной
      статус, создающий дубль), `ErrNominationNotFound` (перенос в
      несуществующую), `ErrNotFound`, `ErrConcurrency`. Новых не требуется.
  - `service/service.go`:
    - `Submit(ctx, callerID, nominationID, club, needsEquipment)` — прокинуть
      новые поля в `domain.Submit` и в `toView` (проекция сохраняет club/
      needs_equipment; override пуст).
    - Новый юзкейс `EditApplication(ctx, actorID, appID string, in EditInput)
      (Application, error)`:
      - `Load` → `Rebuild`.
      - Если задан перенос номинации (`in.NominationID != nil`): резолв через
        `NominationProvider` (→ `tournament_id`; отсутствие →
        `ErrNominationNotFound`); опц. предпроверка `ActiveExists` для целевой
        пары (быстрый `ErrDuplicateActive`) — финальный арбитр всё равно partial
        unique в `Append`.
      - `domain.Amend(actorID, patch, now)` → событие.
      - Пересобрать целевой `ApplicationView` (применить патч к текущему view:
        club/needs_equipment/override/nomination/tournament/state) и
        `Append(ctx, appID, expectedVersion=agg.Version, ev, view)`.
        Нарушение partial unique активного дубля → `ErrDuplicateActive` (FR-6/
        FR-7). Конфликт версии → один повтор → `ErrConcurrency` (как в 0005).
    - `enrich(...)` — **эффективное имя**: для каждой заявки
      `DisplayName = override != "" ? override : authNames[userID]`. Батч-резолв
      `auth`-имён по-прежнему нужен для заявок без override (без N+1). Правило
      применяется во всех обогащающих юзкейсах: `ListMy`, `ListByNomination`,
      `ListApplications`, `GetApplication`, `NominationParticipants`.
    - `Application` (service DTO) и `Participant` — добавить поля `Club`,
      `NeedsEquipment` (для admin-разрезов и «моих заявок»; `Participant` —
      публичный — **без** club/needs_equipment, только эффективное имя).
  - `repo/queries/application.sql` (sqlc):
    - `UpsertCurrent` — добавить колонки `club`, `needs_equipment`,
      `applicant_name_override` в INSERT и в `DO UPDATE SET` (правка меняет и их).
    - Все `SELECT`-запросы проекции (`GetCurrent`, `ListByApplicant`,
      `ListByNomination`, `ListByTournament`, `ParticipantsByNomination`) —
      добавить в выборку три новые колонки.
    - `ExistsActive` — без изменений (используется и для предпроверки переноса).
    - Счётчики (`CountRegistered`, `CountsByNomination`) — без изменений.
    - `make sqlc` после правки.
    - `repo/repo.go` — маппинг новых колонок в/из `ApplicationView`;
      `Append`/`UpsertCurrent` пишут club/needs_equipment/override. Различение
      двух `23505` (версия vs активный дубль) — как в 0005.
  - `api/handler.go`:
    - `toProtoApplication` — заполнять `club`, `needs_equipment`; имя —
      эффективное (из service DTO).
    - `SubmitApplication` — прокинуть `club`/`needs_equipment` из запроса.
    - Новый хендлер `EditApplication` (в `ApplicationAdminServiceHandler`):
      маппинг `EditApplicationRequest` → `service.EditInput` (`nomination_id`/
      `state` — optional → указатель), вызов `EditApplication`, маппинг ошибок:
      `ErrNotFound`→`CodeNotFound`, `ErrDuplicateActive`→`CodeAlreadyExists`,
      `ErrNominationNotFound`→`CodeNotFound`/`CodeInvalidArgument`,
      `ErrConcurrency`→`CodeAborted`. Доступ — уже под `RequireAdmin` (FR-8).
    - `toProtoEvent` — маппить `EventAmended` ↔ `APPLICATION_EVENT_TYPE_AMENDED`
      (история, AC-13).
  - `migrations/00002_application_details.sql` (goose) — см. «Схема БД».
  - `testutil/fake_repo.go` — расширить in-memory проекцию тремя полями;
    воспроизвести обновление club/needs_equipment/override при `Append`
    (правка) и partial-unique дубль при переносе/ручном статусе.
- Регистрация: `module.go` — без изменений (новый RPC входит в уже
  зарегистрированный `ApplicationAdminService` под `baseOpts + adminOpts`).
- Межмодульные зависимости: как в 0005 (`nomination`, `auth` через порты);
  новых нет. Перенос номинации использует существующий `NominationProvider`.

## Схема БД

> Схема `application` существует (0005). Добавляем **новую** миграцию `00002`
> (не правим применённую `00001`). Меняется только проекция
> `application_current`; журнал `events` не трогаем — новые данные едут в
> `payload` (jsonb), схема журнала уже это позволяет.

### `migrations/00002_application_details.sql`

**Up** — `ALTER TABLE application.application_current`:

| Колонка                   | Тип       | Null | Default        | Назначение |
| ------------------------- | --------- | ---- | -------------- | ---------- |
| `club`                    | `TEXT`    | NO   | `''`           | Клуб бойца (свободный текст, «» = не указан) |
| `needs_equipment`         | `BOOLEAN` | NO   | `false`        | Нужна ли экипировка |
| `applicant_name_override` | `TEXT`    | NO   | `''`           | Переопределение имени («» = имя из auth) |

- `ADD COLUMN ... NOT NULL DEFAULT ...` — дефолты покрывают уже существующие
  строки проекции (обратная совместимость).
- Индексы/констрейнты не добавляем: поиск по имени/клубу — клиентский (NFR-3),
  партиал-уникальность дубля (`uq_current_active_per_user_nomination`) уже есть и
  продолжает держать инвариант при переносе/ручном статусе.
- `events` — **без DDL-изменений**: `club`/`needs_equipment` едут в `payload`
  события `submitted`; патч правки — в `payload` события `amended`.

**Down** — `ALTER TABLE ... DROP COLUMN applicant_name_override, DROP COLUMN
needs_equipment, DROP COLUMN club;`

## Web (FSD + BFF)

> См. ADR 0005 (UI), ADR 0006 (state), `web/AGENTS.md`.

- BFF (Route Handlers, Node runtime):
  - `app/api/applications/route.ts` — `POST` (`SubmitApplication`): пробросить
    `club`, `needsEquipment` из тела в gRPC-запрос.
  - `app/api/applications/[id]/route.ts` — добавить `PATCH` (admin,
    `EditApplication`): тело `{ club, needsEquipment, applicantNameOverride,
    nominationId?, state? }`; маппинг `connect.Code`→HTTP (`AlreadyExists`→409,
    `NotFound`→404, `Aborted`→409, `PermissionDenied`→403). (Либо отдельный
    `app/api/applications/[id]/edit/route.ts` `POST` — согласно стилю соседних
    экшн-роутов `declare-payment`/`confirm-payment`; выбрать POST-экшн для
    единообразия.)
  - Остальные роуты (overview, participants) — без изменений в маршрутах; их
    ответы просто начинают нести `club`/`needsEquipment` и эффективное имя.
- Слои:
  - `entities/application/lib/types.ts` — тип `Application`: добавить
    `club: string`, `needsEquipment: boolean`. `ApplicationEventType` —
    добавить `"APPLICATION_EVENT_TYPE_AMENDED"`. Хелперы лейблов события —
    добавить подпись для `amended` («Правка админом»).
  - `features/application-submit/` (и/или `my-applications`) — форма подачи:
    добавить поле «Клуб» (input) и чекбокс «Нужна экипировка»; прокинуть в
    `submitApplicationRequest(nominationId, club, needsEquipment)`. Обновить
    `requests.ts`/RQ-хук `use-submit-application`.
  - `features/my-applications/ui/my-applications-list.tsx` — показать клуб и
    признак экипировки в карточке своей заявки.
  - `features/application-review/` (admin):
    - `ui/applications-overview.tsx` — добавить **поле поиска** (input);
      расширить клиентский `filtered` матчем по подстроке имени
      (`applicantDisplayName`) и клуба (`club`), регистронезависимо, в
      комбинации с существующими бейдж-фильтрами статуса/номинации.
    - Показать клуб/экипировку в строке заявки.
    - Новый UI правки: `ui/edit-application-*` (форма/диалог) — поля клуб,
      чекбокс экипировки, имя (override, предзаполнено эффективным именем),
      селект номинации (перенос), селект статуса (ручная установка);
      `api/requests.ts` — `editApplicationRequest(...)`; RQ-хук
      `use-edit-application` с инвалидацией ключей overview/nomination/one.
  - `entities/nomination/` — публичный стартовый лист: изменений структуры нет;
    имя уже эффективное с сервера (override применён в обогащении).
- Server components vs client: форма подачи и правки — client-features; сводный
  экран с поиском — client (как сейчас). Публичный стартовый лист — SSR (без
  изменений).
- State: server-state → TanStack Query; мутация `EditApplication` →
  `onSuccess` инвалидирует ключи overview/«заявки номинации»/«одна заявка».
  Поле поиска и форма правки — локальный `useState`.

## События

> EDD уже введён (ADR 0011, спека 0005). Настоящая фича добавляет **одно**
> доменное событие в существующий журнал агрегата; новый ADR не требуется.

- **Издаёт (в event store агрегата):** `ApplicationAmended` — админская правка
  полей заявки (клуб/экипировка/имя/номинация/статус). Внутренний журнал
  агрегата, не межмодульная шина.
- **Кроссдоменное:** нет (как и в 0005; `FighterRegistered` — по-прежнему только
  факт). Ручной перевод статуса в/из `registered` наружу ничего не публикует.
- **Потребляет:** ничего.

## Тестирование

> См. ADR 0003 (стратегия) и ADR 0009 (TDD-цикл).

- Юнит домена (`domain/*_test.go`): свёртка с новыми полями — `Submitted`
  инициализирует club/needs_equipment (AC-1/AC-2); `Amend` формирует
  `EventAmended` с патчем; `apply(amended)` применяет club/needs_equipment/
  override, перенос номинации (nomination+tournament) и ручной статус (AC-3/
  AC-8/AC-10); правка терминальной заявки допустима (AC-12); `Rebuild` c
  последовательностью submit→…→amended→amended даёт корректное состояние (AC-13).
- Юнит сервиса (`service/*_test.go`, fake-репо + fake `NominationProvider` +
  fake `UserProvider`): `Submit` сохраняет club/needs_equipment; `EditApplication`
  — правка деталей; переопределение имени → эффективное имя (override приоритетнее
  auth, AC-4; пусто → auth, AC-5); перенос номинации (резолв турнира; в номинацию
  с активным дублем → `ErrDuplicateActive`, AC-9); несуществующая номинация →
  `ErrNominationNotFound`; ручной статус, создающий дубль → `ErrDuplicateActive`
  (FR-7); обогащение эффективным именем без N+1.
- E2E ручек (`api/` через httptest + Connect, fake-репо): `SubmitApplication` с
  club/needs_equipment в ответе; `EditApplication` (admin) — happy-path и
  маппинг ошибок в `connect.Code`; правка обычным `user` → `CodePermissionDenied`
  (AC-11); `GetApplication` показывает `APPLICATION_EVENT_TYPE_AMENDED` в истории
  (AC-13); admin-выдачи несут `club`/`needs_equipment` и эффективное имя;
  публичный `ListNominationParticipants` отдаёт эффективное (переопределённое)
  имя (AC-4).
- Интеграционные с БД (`integration/`, testcontainers): миграция `00002`
  применяется (колонки с дефолтами на существующих строках); `UpsertCurrent`
  пишет/обновляет club/needs_equipment/override; правка через `Append` обновляет
  проекцию; перенос/ручной статус, создающий второй активный дубль, ловится
  `uq_current_active_per_user_nomination` → `ErrDuplicateActive`; журнал
  `events` неизменен (правка — новая строка `amended`, старые не тронуты).
- Web (Vitest): сериализация proto↔JSON новых полей (`club`, `needsEquipment`,
  событие `amended`); BFF `PATCH`/edit-роут — маппинг `connect.Code`→HTTP;
  fetchers `submit`/`edit` (mock fetch); клиентский поиск на overview (матч по
  имени и клубу, регистронезависимо, в комбинации с фильтрами, AC-6/AC-7);
  рендер клуба/экипировки в «моих заявках» и admin-строке; форма правки
  (предзаполнение эффективным именем, отправка снапшота полей).

## Риски и открытые вопросы

- **Ручной статус в обход флоу (FR-7).** Осознанно допускаем обход обычных
  переходов; единственный жёстко удерживаемый инвариант — «нет активного дубля»
  (partial unique на проекции). Прочие «странные» переходы (напр. из `withdrawn`
  снова в `submitted`) админ делает под свою ответственность — это инструмент
  разбора, не пользовательский флоу. Зафиксировано решением 6 спеки.
- **`Payload` как единый jsonb-контейнер.** `submitted` и `amended` используют
  разные подмножества полей `Payload`. Риск спутать семантику — снять юнит-тестом
  `apply` на каждый тип события и не завязывать `amended` на поля идентичности
  потока (nomination/tournament обязательны только при переносе).
- **Полный снапшот vs патч в правке.** Детали (club/needs_equipment/override)
  едут как полный желаемый снапшот (форма всегда шлёт текущее), а номинация и
  статус — как опциональные (present ⇒ менять). Так избегаем ложных
  «переносов»/«смен статуса», когда админ их не трогал. Граница «present» на
  proto — `optional`.
- **Эффективное имя в обогащении.** Override приоритетнее auth; батч-резолв auth
  всё ещё нужен для заявок без override. Следить, чтобы `NominationParticipant`
  (публичный) тоже применял override (AC-4) — единая функция эффективного имени
  на все обогащающие юзкейсы.
- **Обратная совместимость миграции.** `ADD COLUMN NOT NULL DEFAULT` на
  непустой проекции — дефолты закрывают старые строки; журнал не мигрируем
  (старые `submitted` без club/needs_equipment → при `Rebuild` дают пустой
  клуб/`false`, что совпадает с дефолтами — консистентно).
- **Поиск клиентский (NFR-3).** Как и фильтры 0005 — поверх одного запроса
  турнира. При росте объёмов (сотни заявок) — промотировать в серверный
  фильтр/пагинацию (будущая фича, вне скоупа).
