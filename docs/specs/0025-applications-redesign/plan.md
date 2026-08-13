# Plan: Редизайн экрана «Заявки»

> Артефакт SDD (ADR 0008). Описывает **КАК** реализуем `spec.md` в архитектуре
> проекта. Заполняется только когда в `spec.md` нет открытых
> `[NEEDS CLARIFICATION]`.

- Статус: draft
- Дата: 2026-08-13
- Спека: `./spec.md`

## Обзор решения

Инкремент почти целиком в `/web`: `/admin/applications` пересобирается из
примитивов 0022/0023 по правилам, закреплённым 0024 (`PageHeader`, таблица,
чипы со счётчиками, тосты, клиентская пагинация, скелетоны). Единственное
исключение из «чисто UI» — **имя автора события** (spec FR-19): в
`ApplicationEvent` добавляется поле `actor_display_name`, которое
`ApplicationService.GetApplication` заполняет уже существующим портом
`UserProvider.DisplayNames` (тем самым, что обогащает имя заявителя).
Доменного кода, миграций и новых RPC инкремент не добавляет.

Четыре содержательных сдвига помимо визуала:

1. **Журнал заявки получает первого потребителя.** RPC `GetApplication` и
   BFF-ручка `GET /api/applications/[id]` существуют с 0005 и до сих пор
   **не вызываются ни из одного места UI** (проверено грепом: единственные
   упоминания — сам route handler и его тесты). Карточка заявки (spec FR-16)
   — то, ради чего они писались.
2. **Список становится очередью.** Порядок строк перестаёт быть «как отдал
   сервер» и вычисляется чистой функцией (spec FR-6), как `sortUsers` в
   0024; туда же уходят фильтры, счётчики и признак переполнения номинации.
3. **Предупреждение о переполнении считается до действия.** Экран уже
   грузит все заявки турнира и все номинации с их лимитами — значит
   «зарегистрировано ≥ лимита» вычисляется на клиенте тем же правилом, что
   на сервере (`capacityExceeded`: `count(REGISTERED) >= fighter_capacity`,
   лимит не задан → нет предупреждения). Сервер остаётся арбитром: его
   `capacity_exceeded` в ответе на регистрацию попадает в тост (spec FR-13).
4. **Правка заявки переезжает в карточку.** `EditApplicationDialog`
   перестаёт быть самостоятельной кнопкой строки и становится
   контролируемым диалогом, который открывает карточка (spec FR-22).

## Контракты (proto)

- Файл: `proto/hema/v1/application.proto`
- Изменение — **одно, аддитивное**:
  ```proto
  message ApplicationEvent {
    ApplicationEventType type = 1;
    string actor_id = 2;
    google.protobuf.Timestamp occurred_at = 3;
    int32 sequence = 4;
    // actor_display_name — отображаемое имя автора события, обогащённое из
    // домена auth (в журнале не хранится). «» — имя недоступно.
    string actor_display_name = 5;
  }
  ```
- Новых RPC, сервисов и enum'ов нет. Поле необязательное по смыслу (пустая
  строка = имя недоступно, spec FR-19), поэтому ломающим изменение не
  является; `ListApplications`/`ListNominationApplications` не трогаются —
  имя автора нужно только истории.
- После правки — `make generate`.

## Server (модули и слои)

- Модуль: `modules/application` — расширение, новых модулей нет.
- PG-схема: **не меняется**, миграций нет (имя не хранится, а обогащается на
  чтении — тем же приёмом, что `applicant_display_name`, см.
  `service.enrich`).
- Слои:
  - `domain/` — **без изменений**. `domain.Event` продолжает нести только
    `ActorID`: имя — не часть события, а обогащение на чтении.
  - `service/` — `HistoryEvent` получает поле `ActorDisplayName`;
    `Service.Get` после `toHistory(events)` собирает уникальные `ActorID`
    (их единицы на заявку) и одним батчем зовёт `s.users.DisplayNames`,
    раскладывая имена по записям. Порт `UserProvider` (`domain/domain.go`)
    **уже** объявляет `DisplayNames(ctx, ids) (map[string]string, error)` —
    новых портов не нужно. Отсутствующий/пустой ключ карты → пустое имя.
  - `repo/` — **без изменений** (sqlc-запросы не трогаются).
  - `api/` — `toProtoHistory` переносит новое поле в
    `hemav1.ApplicationEvent`.
  - `migrations/` — **нет**.
- Регистрация/wiring в `internal/platform` — **без изменений**: в
  проде порт уже связан с `auth.DisplayNameProvider`, в тестах — с
  `testutil.FakeUserProvider`.
- Межмодульные зависимости: без новых (`application → auth` через
  существующий `UserProvider`).

## Web (FSD + BFF)

### BFF (Route Handlers)

- `app/api/applications/[id]/route.ts` — **без изменений** (уже отдаёт
  `{application, history}`); меняется только форма DTO ниже.
- `lib/grpc/serialize.ts` — `applicationHistoryToJson` добавляет
  `actorDisplayName: raw.actorDisplayName ?? ""` (proto3 опускает пустые
  строки, поэтому дефолт обязателен — ровно тот случай, который ловят
  `.e2e.test.ts`, см. `web/AGENTS.md`).
- Остальные ручки заявок (`overview`, `confirm-payment`, `register`, `edit`)
  — **без изменений**.

### `shared/`

- `shared/ui/table-row.tsx` — **аддитивное расширение**: у `TableRowCell`
  появляется необязательный `node?: React.ReactNode` (рендерится вместо
  `text/sub`, остальные поля ячейки работают как раньше). Причина: 0024 уже
  столкнулся с тем, что `cells`-API текстовый, и сверстал `user-row.tsx`
  вручную (см. его комментарий и «Риски» плана 0024); вторая ручная строка
  подряд — сигнал, что примитиву не хватает слота, а не что строки надо
  верстать мимо него. Существующее API не ломается. Перевод `user-row.tsx`
  на новый слот — **вне скоупа** этой спеки.
- `shared/lib/datetime.ts` — переиспользуется как есть (`formatRelativeDay`,
  `formatDateTime` заведены 0024); новых функций не требуется.
- `shared/lib/paginate.ts`, `shared/ui/{pagination,empty-state,skeletons,
  filter-chip,tag,tooltip,dialog,page-header,dropdown-menu}` — как есть.

### `entities/application/`

- `lib/types.ts` — `ApplicationEvent` получает `actorDisplayName: string`.
- `lib/state.ts` — дополняется **чистыми функциями представления**, общими
  для строки и карточки:
  - `stateCaption(state)` — формулировка подстроки строки таблицы («подана»,
    «оплата заявлена», «оплата подтверждена», «зарегистрирован», «отозвана»,
    spec FR-2);
  - `eventLabel(type)` — подпись события истории, включая
    `APPLICATION_EVENT_TYPE_AMENDED` → «Заявка изменена» (spec FR-17);
  - `nextExpectedStep(state)` — ожидаемый следующий шаг и чьего действия
    ждём (spec FR-18); для терминальных состояний — `null`;
  - `isTerminal(state)` — для приглушения строк (spec FR-3).
  Место выбрано по FSD: это знание о сущности «заявка», а не о фиче
  админского экрана, и его же будет переиспользовать 0036 («Мои заявки»).

### `features/application-review/`

- `api/requests.ts` — добавляется `getApplicationRequest(id)` →
  `{ application, history }` поверх существующей ручки; остальные fetcher'ы
  не меняются.
- `api/keys.ts` — добавляется `detail: (id) => ["application-review",
  "detail", id]`.
- `api/use-application-detail.ts` — **новый** RQ-хук, `enabled` только когда
  карточка открыта (spec FR-20); инвалидация после действий флоу и правки —
  вместе с `overview`.
- `api/use-confirm-payment.ts` / `use-register-fighter.ts` /
  `use-edit-application.ts` — дополняются инвалидацией `detail`, чтобы
  открытая карточка обновлялась после действия (spec FR-21).
- `lib/select-applications.ts` — **новый чистый модуль** (без React, целиком
  под юнит-тесты):
  - `sortApplications(apps)` — порядок очереди (spec FR-6);
  - `filterApplications(apps, {statuses, nominationIds, needsEquipment,
    query})` — И между группами, множественный выбор внутри (spec FR-8/9/10);
  - `statusCounts(apps)` — счётчики по всему списку (spec FR-7);
  - `overfullNominationIds(apps, nominations)` — множество номинаций, где
    `count(REGISTERED) >= fighterCapacity` (spec FR-4);
  - `rowAction(state)` — какое действие флоу доступно (обёртка над
    существующим `allowedSecretaryActions`) и текст-причина при его
    отсутствии (spec FR-5).
- `lib/history.ts` — **новый чистый модуль**: `historyEntries(app, history)`
  → упорядоченный список записей `{ label, occurredAt, actorName,
  actorRole }` + необязательная приглушённая запись ожидаемого шага. Роль
  выводится сравнением `event.actorId` с `application.applicantUserId`
  («заявитель» / «организатор»), имя берётся из нового поля контракта; при
  пустом имени запись несёт только роль (spec FR-19, AC-12).
- `ui/applications-screen.tsx` — **новый клиентский корень** (заменяет
  `applications-overview.tsx`): `PageHeader`, панель фильтров, таблица,
  пагинация, карточка; владеет UI-состоянием (`useState`: выбранные
  статусы/номинации/поиск/экипировка/страница/id открытой заявки), зовёт
  `useApplicationsOverview`, показывает тосты в колбэках мутаций (правило
  0024: канал обратной связи живёт в `ui/`, хуки остаются чистыми).
- `ui/applications-filters.tsx` — **новый**: чипы статусов со счётчиками
  (`FilterChip`, `aria-pressed`), выпадающий список номинаций
  (`DropdownMenu` с множественным выбором), чип «нужна экипировка», поиск,
  сброс.
- `ui/applications-table.tsx` — **новый**: `TableHead` (пять колонок) +
  строки, скелетон/ошибка/два пустых состояния (spec FR-24/25/26).
- `ui/application-row.tsx` — **новый**: ячейки по spec FR-1..FR-5 на
  расширенном `TableRow` (`node`-слот для тегов и кнопки), клик по строке
  открывает карточку, `stopPropagation` на кнопке действия (spec NFR-4,
  AC-16).
- `ui/application-card-dialog.tsx` — **новый**: карточка заявки (`Dialog`) —
  шапка, статус с пояснением, `ApplicationHistory`, предупреждение о
  переполнении, действие флоу, «Редактировать», «Закрыть».
- `ui/application-history.tsx` — **новый**: рендер `historyEntries`
  (маркеры-точки, дата/время через `formatDateTime`, автор, приглушённый
  ожидаемый шаг).
- `ui/edit-application-dialog.tsx` — **переписывается в контролируемый**
  (`open`/`onOpenChange` пропами, без собственного `DialogTrigger`);
  открывается из карточки.
- `ui/applications-overview.tsx` — **удаляется** после переезда.

### `widgets/`

Не затрагиваются.

### Роуты

- `app/(admin)/admin/applications/page.tsx` — остаётся server component:
  `getActiveTournament()` + `getNominations()` (уже есть), рендерит
  `<ApplicationsScreen tournamentId nominations tournamentName
  initialNominationId />`. Убираются обёртка `mx-auto max-w-4xl px-4 py-16`
  и `AdminHeader` (его место занимает `PageHeader` внутри экрана — правило
  0024, FR-19). Ветка «активный турнир не найден» сохраняется.

### Server components vs client

| Слой | Где | Почему |
| --- | --- | --- |
| `page.tsx` | server | cookie + gRPC (`getActiveTournament`, `getNominations`) |
| `ApplicationsScreen` и всё под ним | client | RQ, состояние фильтров, карточка, тосты |
| `PageHeader` | презентационный | рендерится внутри клиентского экрана (`meta` зависит от данных) |

### State

- server-state (список заявок, заявка с историей) → TanStack Query;
- UI-state (фильтры, поиск, страница, id открытой карточки, открытость
  правки) → `useState` внутри `ApplicationsScreen` (кросс-компонентного
  шаринга нет, Zustand не нужен, ADR 0006);
- порядок/фильтрация/счётчики/переполнение/история — чистые функции, не
  состояние.

## События

Доменных событий инкремент **не издаёт и не потребляет**. Существующие
события заявки (ADR 0011, спека 0005) он только читает и показывает —
журнал, его формат и порт `fighters.OnRegistered` не меняются.

## Тестирование

> ADR 0003 (пирамида) + ADR 0009 (TDD). Скриншотных тестов нет.

**Server (Go):**

- `modules/application/service/service_test.go` — `Get` возвращает историю с
  именами авторов: имя заявителя и имя админа берутся из
  `FakeUserProvider`; неизвестный автор → пустое имя; `DisplayNames`
  зовётся **одним батчем** на все события.
- `modules/application/api/handler_test.go` (e2e ручки через httptest +
  Connect) — `GetApplication` отдаёт `actor_display_name` в записях истории;
  доступ (владелец/admin/чужой) не регрессирует.

**Web (Vitest):**

- `lib/grpc/serialize.test.ts` — `applicationHistoryToJson` переносит
  `actorDisplayName`, а при опущенном proto3-поле даёт `""`.
- `app/api/applications/[id]/route.test.ts` — дополняется проверкой формы
  ответа с новым полем.
- `entities/application/lib/state.test.ts` — `stateCaption`, `eventLabel`
  (включая `AMENDED`), `nextExpectedStep` (терминальные → `null`),
  `isTerminal`.
- `features/application-review/lib/select-applications.test.ts` —
  `sortApplications` (группы очереди и порядок внутри), `filterApplications`
  (каждый фильтр по отдельности и все вместе, регистр поиска),
  `statusCounts` (не зависят от фильтров и поиска),
  `overfullNominationIds` (лимит не задан → пусто; ровно на границе → есть),
  `rowAction`.
- `features/application-review/lib/history.test.ts` — порядок записей, роль
  автора («заявитель»/«организатор»), пустое имя → только роль (AC-12),
  ожидаемый шаг для каждого нетерминального состояния.
- `features/application-review/ui/application-row.test.tsx` — колонки,
  подстрока состояния, теги переполнения/экипировки, действие/причина,
  клик по строке открывает карточку, клик по кнопке — нет (AC-16).
- `features/application-review/ui/applications-filters.test.tsx` — чипы со
  счётчиками и множественным выбором, подпись выпадающего списка номинаций
  («Все номинации» / название / «N номинаций»), сброс.
- `features/application-review/ui/applications-table.test.tsx` — скелетон,
  ошибка с повтором, два разных пустых состояния.
- `features/application-review/ui/application-card-dialog.test.tsx` —
  история, ожидаемый шаг, предупреждение о переполнении, действие флоу
  оставляет карточку открытой и обновляет статус (AC-10), «Редактировать»
  открывает форму правки (AC-11), ошибка загрузки истории не ломает
  карточку.
- `features/application-review/ui/applications-screen.test.tsx` (моки
  `useApplicationsOverview`, мутаций и `shared/lib/toast`) — AC-1/2/3/4/5/
  6/7/8/13/14/15: порядок очереди, счётчики, фильтры, предвыбор номинации,
  тосты успеха (в т.ч. с предупреждением о переполнении) и ошибки без
  `retry`, шапка раздела, состояния экрана, сброс страницы.
- `shared/ui/table-row.test.tsx` — дополняется: `node`-ячейка рендерится,
  текстовые ячейки не сломаны.

**Проверка сборки:** `make test` (server), `make test-web`,
`pnpm exec tsc --noEmit`, `pnpm build`.

## Риски и открытые вопросы

- **Два диалога сразу.** «Редактировать» открывается поверх карточки заявки
  (вложенные Radix-диалоги). Если управление фокусом/скроллом окажется
  проблемным, запасной вариант — последовательный режим: карточка
  закрывается на время правки и открывается снова после сохранения.
  Решение принимается на T-задаче карточки, проверяется тестом на
  доступность (фокус остаётся внутри верхнего окна).
- **Признак переполнения считается по загруженному списку.** Если список
  заявок окажется урезанным (сегодня `ListApplications` лимита не имеет,
  но это может измениться), счётчик зарегистрированных станет заниженным и
  предупреждение исчезнет — не появится ложно. Деградация безопасная, но
  на T-задаче стоит оставить комментарий у `overfullNominationIds`.
- **Имена авторов и приватность.** История содержит, кто и когда что
  сделал; правило доступа (владелец либо админ) уже на сервере
  (`Service.Get`), но новая колонка делает утечку заметнее. Тест на доступ
  в `handler_test.go` обязателен, чтобы расширение поля не поехало вместе с
  ослаблением проверки.
- **Порядок очереди против привычки.** Сегодня строки идут в порядке
  ответа сервера; новый порядок (spec FR-6) — содержательное изменение
  UX, а не только визуал. Если на смоуке окажется, что секретарю удобнее
  «как пришло», порядок останется в одной чистой функции — переиграть
  дёшево.
- **`ListApplications` возвращает весь турнир одним ответом.** Это
  осознанный предел (spec NFR-2), общий с 0024; при переходе на серверную
  постраничность (отдельная фича) чистые функции фильтрации переедут на
  сервер целиком.
- **`AdminHeader` продолжает жить** в остальных разделах админки — как и
  после 0024, это ожидаемое переходное состояние: удалить компонент можно
  будет, когда на `PageHeader` переедет последний экран.
