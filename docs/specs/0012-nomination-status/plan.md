# Plan: Статусная модель номинации

> Артефакт SDD (ADR 0008). Описывает **КАК** реализуем `spec.md` в архитектуре
> проекта. Заполняется только когда в `spec.md` нет открытых
> `[NEEDS CLARIFICATION]`.

- Статус: ready
- Дата: 2026-07-20
- Спека: `./spec.md`

## Обзор решения

Синхронное решение (без ЕДД), три модуля меняются, направление зависимостей
не меняется (`pool → nomination`, `application → nomination` — уже
существуют, ADR 0002; никакого нового ребра `nomination → pool` не вводится).

1. **`nomination`** — центральный модуль. У номинации появляется **хранимый**
   статус (`open`/`closed`, плюс зарезервированные `active`/`finished`) и два
   internal-only поля: `closed_reason` (`manual`/`drawing` — причина
   закрытия, **не публична**) и `has_distributed_fighters` (снапшот факта
   «раскладка активна», обновляемый push'ом из `pool`). Новые admin RPC
   `CloseRegistration`/`ReopenRegistration`. `Nomination.status` — новое
   публичное поле; `closed_reason`/`has_distributed_fighters` на проводе не
   появляются нигде (ни в публичном, ни в admin-сервисе) — это чисто
   серверная бухгалтерия.
2. **`pool`** — расширяется существующий порт `NominationProvider` (уже
   реализует направление `pool → nomination`, спека 0011) одним write-методом
   `SyncRegistrationState(nominationID, hasDistributedFighters bool)`.
   Вызывается **после** каждой из шести pool-мутирующих операций, способных
   изменить число распределённых бойцов номинации: `AssignFighter`,
   `UnassignFighter`, `AutoDistribute`, `DeletePool`, `ResetLayout`, `Undo`
   (все три вида). Триггер — **результирующее состояние** (пересекло ли число
   распределённых бойцов границу 0↔≥1), не имя конкретного RPC — так
   закрываются и `AutoDistribute`, и `Undo`, которые более узкая
   формулировка «по имени RPC» упустила бы (см. ревалидацию спеки).
3. **`application`** — порт `NominationProvider` (уже существует, спека 0005)
   получает одно новое поле `RegistrationOpen bool` на `NominationInfo`.
   `Submit` проверяет его наряду с уже существующей проверкой существования
   номинации.
4. **web** — бейдж статуса и кнопки «Закрыть/Открыть приём» в админке
   (`nomination-management`), бейдж + скрытие кнопки подачи заявки на
   публичных экранах (главная — `nominations-list`, страница номинации).
   Кнопки в админке используют **уже существующий** thin-слайс
   `/api/nominations/[id]/pool-status` (сейчас отдаёт `status`+`canUndo` из
   `GetLayout`), расширенный полем `hasDistributedFighters` — вычисляется на
   BFF из уже полученного `layout.pools` без нового gRPC-вызова.

Межмодульные RPC в этом монолите — **прямые Go-вызовы** через адаптеры
`internal/platform` (см. `PoolNominationProvider`/`NominationInfoProvider`,
спека 0005/0011), а не сетевой Connect-запрос — значит, «синхронный вызов»
из FR-10 не требует retry/таймаут-политики отдельно от общей транзакции
запроса.

## Контракты (proto)

> Источник истины API — `/proto`. Меняем только там, потом `make generate`.

### `proto/hema/v1/nomination.proto`

- **Новый enum `NominationStatus`**:
  ```proto
  enum NominationStatus {
    NOMINATION_STATUS_UNSPECIFIED = 0;
    NOMINATION_STATUS_OPEN = 1;
    NOMINATION_STATUS_CLOSED = 2;
    // ACTIVE/FINISHED — закладки под будущую фазу боёв (как active/finished
    // в 0009/0010). Не реализуются в этом инкременте: нет переходов, нет
    // поведения.
    NOMINATION_STATUS_ACTIVE = 3;
    NOMINATION_STATUS_FINISHED = 4;
  }
  ```
- **`Nomination`**: добавить `NominationStatus status = 10;` (следующий
  свободный номер после `updated_at = 9`). Причина закрытия и факт активной
  раскладки **не выносятся в proto** нигде (ни здесь, ни в отдельном
  сообщении) — деталь реализации (спека, «Вне скоупа»).
- **`NominationAdminService`** — два новых RPC (пара, FR-3):
  ```proto
  rpc CloseRegistration(CloseRegistrationRequest) returns (CloseRegistrationResponse);
  rpc ReopenRegistration(ReopenRegistrationRequest) returns (ReopenRegistrationResponse);
  ```
  ```proto
  message CloseRegistrationRequest { string id = 1; }
  message CloseRegistrationResponse { Nomination nomination = 1; }
  message ReopenRegistrationRequest { string id = 1; }
  message ReopenRegistrationResponse { Nomination nomination = 1; }
  ```

### `proto/hema/v1/application.proto`, `proto/hema/v1/pool.proto`

- **Без изменений.** Гейт `SubmitApplication` (FR-7) и синхронизация
  `pool → nomination` (FR-10) реализуются через Go-порты
  (`application/domain.NominationProvider`, `pool/domain.NominationProvider`),
  не через новые/изменённые RPC.

## Server (модули и слои)

### Модуль `nomination` (расширение)

- PG-схема `nomination` (существует). Миграция
  `modules/nomination/migrations/00002_registration_status.sql`:
  ```sql
  ALTER TABLE nomination.nominations
      ADD COLUMN status TEXT NOT NULL DEFAULT 'open',
      ADD COLUMN closed_reason TEXT NULL,
      ADD COLUMN has_distributed_fighters BOOLEAN NOT NULL DEFAULT false;

  ALTER TABLE nomination.nominations
      ADD CONSTRAINT chk_nominations_status
          CHECK (status IN ('open', 'closed', 'active', 'finished')),
      ADD CONSTRAINT chk_nominations_closed_reason
          CHECK (closed_reason IS NULL OR closed_reason IN ('manual', 'drawing')),
      -- Причина закрытия задана ⟺ статус closed (внутренний инвариант,
      -- спека «Замечание о сводном статусе CLOSED»).
      ADD CONSTRAINT chk_nominations_closed_reason_presence
          CHECK ((status = 'closed') = (closed_reason IS NOT NULL));
  ```
  Существующие номинации получают `status='open'` через `DEFAULT` — без
  отдельного backfill (спека NFR-4/«Принятые решения» №7); первая же мутация
  пула (`assign`/удаление) сама сведёт `has_distributed_fighters` к
  реальности через `SyncRegistrationState`. Down-миграция дропает три
  колонки и три констрейнта.
- `domain/domain.go`:
  - `type Status string` — `StatusOpen = "open"`, `StatusClosed = "closed"`,
    `StatusActive = "active"` (задел, не назначается), `StatusFinished =
    "finished"` (задел, не назначается).
  - `type ClosedReason string` — `ClosedReasonNone = ""`,
    `ClosedReasonManual = "manual"`, `ClosedReasonDrawing = "drawing"`.
  - `Nomination`: добавить `Status Status`, `ClosedReason ClosedReason`,
    `HasDistributedFighters bool`.
  - Новая доменная ошибка `ErrCannotReopen = errors.New("nomination:
    registration cannot be reopened")` — единый код для обоих случаев FR-4
    (закрыто от раскладки **или** раскладка активна прямо сейчас, AC-9/AC-16):
    спека не требует различать их в ответе клиенту, разный текст сообщения не
    нужен.
  - `Repository`: добавить
    `SetRegistrationState(ctx, id string, status Status, reason ClosedReason,
    hasDistributed bool) (Nomination, error)` — единая точка записи всех трёх
    полей; используется и `CloseRegistration`/`ReopenRegistration`, и
    `SyncRegistrationState`. `Create` — без изменений сигнатуры, но
    вставляет `status='open'` по умолчанию (значение в БД, не Go-параметр).
- `service/service.go`:
  - `CloseRegistration(ctx, id string) (Nomination, error)`: `Get(id)`; если
    `Status == Closed` — **идемпотентный no-op**, возвращает текущее значение
    без записи (не трогает `ClosedReason`, даже если он `drawing` — иначе
    ручной клик «Закрыть» на уже закрытой от раскладки номинации тихо
    перепривязал бы причину и сломал бы гейты FR-4/FR-6, см. риски); иначе —
    `SetRegistrationState(id, Closed, Manual, current.HasDistributedFighters)`.
  - `ReopenRegistration(ctx, id string) (Nomination, error)`: `Get(id)`; если
    `Status == Open` — идемпотентный no-op; если `ClosedReason != Manual` **или**
    `HasDistributedFighters == true` — `ErrCannotReopen` (оба условия
    обязательны, FR-4/AC-16 — ревалидация спеки); иначе —
    `SetRegistrationState(id, Open, None, false)`.
  - `SyncRegistrationState(ctx, nominationID string, hasDistributed bool)
    error`: `Get(id)`; вычисляет новые `(status, reason)`:
    - `hasDistributed && Status == Open` → `(Closed, Drawing)`;
    - `!hasDistributed && Status == Closed && ClosedReason == Drawing` →
      `(Open, None)`;
    - иначе — `(текущий Status, текущий ClosedReason)` без изменений (в
      частности: `Closed`+`Manual` не трогается ни в какую сторону — FR-6).
    В любом из трёх случаев **всегда** обновляет
    `HasDistributedFighters = hasDistributed` через `SetRegistrationState`
    (нужно ReopenRegistration'у для гейта AC-16, даже когда status/reason не
    меняются). Идемпотентна: повторный вызов с тем же `hasDistributed` не
    меняет ничего лишнего (`SetRegistrationState` — просто upsert текущих
    значений).
  - `Create`: без изменений — `status='open'` идёт из DEFAULT колонки (FR-2).
- `api/handler.go`:
  - Публичный `toProtoNomination`: маппит `Status` в `NominationStatus`
    (`open→OPEN`, `closed→CLOSED`, `active→ACTIVE`, `finished→FINISHED`);
    `ClosedReason`/`HasDistributedFighters` — **не читаются** этим маппером
    вообще (не существуют в proto).
  - `AdminHandler`: `CloseRegistration`/`ReopenRegistration` — тонкие
    обёртки над сервисом.
  - `mapError`: `ErrCannotReopen → connect.CodeFailedPrecondition`.
- `testutil/fake_repo.go`: добавить `SetRegistrationState` в фейк (in-memory
  структура уже хранит `Nomination` целиком — просто пишет три новых поля).

### Модуль `pool` (расширение)

- **Без изменений схемы.** `domain/domain.go`:
  - `NominationProvider` (существующий порт, спека 0011) — добавить
    `SyncRegistrationState(ctx context.Context, nominationID string,
    hasDistributedFighters bool) error`.
- `service/service.go`:
  - Новый приватный хелпер:
    ```go
    func (s *Service) loadLayoutAndSync(ctx context.Context, nominationID string) (domain.Layout, error) {
        layout, err := s.loadLayout(ctx, nominationID)
        if err != nil {
            return domain.Layout{}, err
        }
        if err := s.nominations.SyncRegistrationState(ctx, nominationID, hasDistributed(layout)); err != nil {
            return domain.Layout{}, err
        }
        return layout, nil
    }

    func hasDistributed(l domain.Layout) bool {
        for _, p := range l.Pools {
            if len(p.Members) > 0 {
                return true
            }
        }
        return false
    }
    ```
  - Заменить финальный `return s.loadLayout(ctx, nominationID)` на
    `return s.loadLayoutAndSync(ctx, nominationID)` **только** в шести
    методах, реально меняющих членство: `DeletePool`, `ResetLayout`,
    `AssignFighter`, `UnassignFighter`, `AutoDistribute`, `Undo`.
    `CreatePool`, `SetStatus`, `SeatPoolOnArena`, `UnseatPool` — не трогают
    членство, остаются на `loadLayout`. No-op ветки (`ResetLayout`/
    `AutoDistribute` при отсутствии пулов/нераспределённых — уже
    `return layout, nil` до вызова repo) — тоже не зовут sync, состояние не
    менялось.
- `internal/platform/pool_nomination_provider.go`: `PoolNominationProvider`
  реализует новый метод, прокидывая на `nomservice.Service`:
  ```go
  func (p *PoolNominationProvider) SyncRegistrationState(ctx context.Context, nominationID string, hasDistributedFighters bool) error {
      return p.svc.SyncRegistrationState(ctx, nominationID, hasDistributedFighters)
  }
  ```
- `testutil/fake_nomination_provider.go` (пакет pool): добавить
  `SyncRegistrationState` — пишет в map `map[string]bool` + отдельный getter
  `LastSynced(nominationID) (bool, bool)` (значение, вызывался ли) для
  ассертов в юнит-тестах сервиса.

### Модуль `application` (расширение)

- **Без изменений схемы.** `domain/domain.go`:
  - `NominationInfo`: добавить `RegistrationOpen bool`.
  - Новая ошибка `ErrRegistrationClosed = errors.New("application:
    nomination registration is closed")`.
- `service/service.go`, `Submit`: сразу после
  `info, err := s.nominations.Nomination(ctx, nominationID)` — если
  `!info.RegistrationOpen`, вернуть `ErrRegistrationClosed` (до
  `ActiveExists`/`domain.Submit` — дешёвая проверка первой, FR-7).
  `DeclarePayment`/`ConfirmPayment`/`Register`/`Withdraw`/`EditApplication` —
  **без изменений** (FR-7: гейт только на новую подачу).
- `api/handler.go`, `mapError`: `ErrRegistrationClosed →
  connect.CodeFailedPrecondition`.
- `testutil/fake_nomination_provider.go` (пакет application): `Set` уже
  принимает целиком `domain.NominationInfo` — просто выставлять
  `RegistrationOpen` в тестах, изменений в фейке не требуется.

### `internal/platform`

- `nomination_provider.go` (`NominationInfoProvider.Nomination`,
  адаптер для `application`): добавить
  `info.RegistrationOpen = n.Status == nomdomain.StatusOpen`.
- `pool_nomination_provider.go` — см. выше (новый метод
  `SyncRegistrationState`).
- `platform.go` — без изменений wiring (оба адаптера уже собираются и
  передаются в `Deps`, меняется только их содержимое).

## Web (FSD + BFF)

- **entities/nomination/lib/types.ts**:
  - `export type NominationStatus = "NOMINATION_STATUS_UNSPECIFIED" |
    "NOMINATION_STATUS_OPEN" | "NOMINATION_STATUS_CLOSED" |
    "NOMINATION_STATUS_ACTIVE" | "NOMINATION_STATUS_FINISHED";`
  - `nominationStatusLabel(status): string` — `"OPEN" → "приём заявок
    открыт"`, `"CLOSED" → "приём заявок завершён"`, default `"—"` (мирроринг
    `poolLayoutStatusLabel`/`poolStatusLabel`, `entities/pool/lib/types.ts`).
  - `Nomination.status: NominationStatus`.
- **lib/grpc/serialize.ts**, `nominationToJson`: добавить
  `status: (raw.status as NominationStatusDto) ?? "NOMINATION_STATUS_UNSPECIFIED"`.
- **BFF (Route Handlers, Node runtime):**
  - `app/api/nominations/[id]/close-registration/route.ts` — `POST`, только
    admin (по образцу `app/api/admin/arenas/[id]/archive/route.ts`):
    `nominationAdminClient.closeRegistration({ id })` → `{ nomination }`.
  - `app/api/nominations/[id]/reopen-registration/route.ts` — `POST`, только
    admin, аналогично `closeRegistration`.
  - `app/api/nominations/[id]/pool-status/route.ts` (существующий, спека
    0009/0011) — расширить `GET`: посчитать
    `hasDistributedFighters = (layout?.pools ?? []).some((p) => p.members.length > 0)`
    из уже полученного `poolLayoutToJson(res.layout)` (тот же gRPC-вызов
    `getLayout`, без нового запроса) и добавить в JSON-ответ. Нужно
    `nomination-management`, чтобы решить доступность кнопок (FR-9/AC-12/16)
    без нового межмодульного чтения на сервере — деталь UI, не нарушает
    решение спеки «отдельного read-порта `nomination → pool` не появляется»
    (данные уже идут в обратную сторону, `pool → BFF → UI`).
- **features/nomination-management:**
  - `api/requests.ts`: `closeRegistrationRequest(id)` /
    `reopenRegistrationRequest(id)` — `POST`, возвращают `NominationResult`
    (тот же тип, что `updateNominationRequest`); `getPoolLayoutStatusRequest`
    — расширить возвращаемый `PoolLayoutStatus` полем `hasDistributedFighters:
    boolean`.
  - `api/use-close-registration.ts` / `api/use-reopen-registration.ts` —
    мутации по образцу `use-delete-nomination.ts`, инвалидируют
    `nominationManagementKeys.list(tournamentId)`.
  - `ui/nomination-management.tsx`, `NominationRow`: рядом с
    `PoolStatusBadge` — `NominationStatusBadge` (по статусу `nomination.status`);
    две кнопки «Закрыть приём»/«Открыть приём», доступность — чистая функция
    `canClose(status)` / `canReopen(status, hasDistributedFighters)` (FR-9):
    ```
    canClose = status === OPEN
    canReopen = status === CLOSED && !hasDistributedFighters
    ```
    (напоминание из ревалидации: `hasDistributedFighters` в одиночку
    достаточно — различать `manual`/`drawing` на UI не нужно, см. «Обзор
    решения»).
- **widgets/nominations-list/nominations-list.tsx** (публичная секция
  номинаций турнира, FR-8/AC-14):
  - Бейдж статуса рядом с `CardTitle` при `status !== OPEN` — «Приём заявок
    завершён».
  - `{isAuthenticated && <SubmitApplicationButton .../>}` → добавить условие
    `n.status === "NOMINATION_STATUS_OPEN"`; при `isAuthenticated &&
    status !== OPEN` — вместо кнопки показать `<p className="text-sm
    text-muted-foreground">Приём заявок завершён</p>` (не просто скрывать
    молча — AC-14 «кнопки скрываются или показываются как недоступные»).
- **app/nominations/[id]/page.tsx** (публичная страница одной номинации,
  спека 0011): рядом с `<h1>` — тот же бейдж статуса, что в
  `nominations-list` (гость должен видеть статус и на этом экране, не только
  на главной, AC-14 явно говорит «гость открывает публичную страницу
  номинации»).
- **State:** admin-мутации (`close/reopen-registration`) — TanStack Query,
  как остальные мутации `nomination-management`. Публичные экраны — SSR-фетч
  (без изменений схемы получения данных, `status` едет вместе с уже
  читаемой `Nomination`).

## События

> Placeholder. Event-Driven Design ещё не введён (ADR появится с первой
> событийной фичей). Синхронный порт `pool → nomination` (расширение
> существующего `NominationProvider`) — не событие, ADR 0002.

- Издаёт: нет. Потребляет: нет.

## Тестирование

> См. ADR 0003 (стратегия) и ADR 0009 (TDD-цикл).

- **Юнит (`nomination/service`, fake-репо):**
  - `Create` → `status=open` (AC-1).
  - `CloseRegistration`: `open→closed(manual)` (AC-3); идемпотентный no-op на
    уже `closed` (любая причина) — `ClosedReason` не меняется (регрессия на
    риск из «Обзор решения»/риски).
  - `ReopenRegistration`: `closed(manual, !hasDistributed) → open` (AC-4);
    `ErrCannotReopen` при `closed(drawing)` (AC-9); `ErrCannotReopen` при
    `closed(manual, hasDistributed=true)` (AC-16, ключевой тест ревалидации);
    идемпотентный no-op на уже `open`.
  - `SyncRegistrationState`: `open + hasDistributed=true → closed(drawing)`
    (AC-7 половина, серверная часть); `closed(drawing) + hasDistributed=false
    → open` (AC-10); `closed(manual) + hasDistributed=false` — статус/причина
    не меняются, но `HasDistributedFighters` обновляется (AC-11 + база для
    AC-16); `closed(manual) + hasDistributed=true` — то же самое, но с
    `true` (сценарий из AC-16 «раскладка началась при уже закрытой вручную
    номинации»).
- **Юнит (`pool/service`, fake-репо + fake `NominationProvider`-спай):**
  - Первый `AssignFighter` при пустой раскладке → спай получил
    `SyncRegistrationState(nominationID, true)` (AC-7); создание пустых пулов
    (`CreatePool`) — спай **не вызывается** (AC-8).
  - `UnassignFighter` последнего распределённого бойца → `sync(..., false)`.
  - `DeletePool`/`ResetLayout`, опустошающие раскладку → `sync(..., false)`
    (AC-10 половина, серверная часть); `AutoDistribute` первого запуска на
    пустой раскладке → `sync(..., true)`; `AutoDistribute` при отсутствии
    нераспределённых (no-op ветка) → спай не вызывается.
  - `Undo` всех трёх видов (`auto`/`delete_pool`/`reset`), пересекающих
    границу 0↔≥1 в любую сторону → `sync` вызывается с правильным значением
    (регрессия на пробел FR-10 из ревалидации — до фикса `Undo` не был в
    списке триггеров).
  - `AssignFighter` типа «move» (пул→пул, боец уже был распределён) →
    `hasDistributed` не меняется, но `sync` всё равно можно звать (идемпотентно
    на стороне nomination) — тест фиксирует, что *значение* верное, а не что
    вызова нет (звать безопасно, даже если он не обязателен).
- **Юнит (`application/service`, fake-репо + fake `NominationProvider`):**
  - `Submit` в номинацию с `RegistrationOpen=false` → `ErrRegistrationClosed`
    (AC-6), до `ActiveExists`/repo-вызовов (не расходует запись).
  - `DeclarePayment`/`ConfirmPayment`/`Register`/`Withdraw` на существующей
    заявке в закрытой номинации — проходят как обычно, не читают
    `RegistrationOpen` вовсе (AC-15).
- **E2E ручек (`nomination/api`, httptest+Connect, fake-репо):**
  - `CloseRegistration`/`ReopenRegistration` — маппинг доменных ошибок в
    `connect.Code` (`ErrCannotReopen → FailedPrecondition`); `RequireAdmin`
    на обоих (AC-13); `ListNominations`/`GetNomination` отдают `status` без
    токена (AC-2).
- **E2E ручек (`application/api`):** `SubmitApplication` →
  `FailedPrecondition` при закрытой номинации (через fake `NominationProvider`
  с `RegistrationOpen=false`).
- **Интеграционные (testcontainers, `nomination/integration`):** миграция
  применяется; констрейнт `chk_nominations_closed_reason_presence` реально
  блокирует рассинхрон (`status='open'` с непустым `closed_reason` и
  наоборот) на уровне PG, не только в Go.
- **Web (Vitest):**
  - `nominationToJson` мапит `status` (proto3 enum default → `UNSPECIFIED`).
  - BFF `close-registration`/`reopen-registration`: happy path + маппинг
    `connect.Code` → HTTP (409 на `FailedPrecondition`, как в `errors.ts`).
  - BFF `pool-status` GET: `hasDistributedFighters` верно считается из
    `layout.pools` (пусто/непусто).
  - `canClose`/`canReopen` — чистые функции, юнит-тест таблицей истинности
    по всем комбинациям `(status, hasDistributedFighters)` (FR-9/AC-12/AC-16).

## Риски и открытые вопросы

- **`SyncRegistrationState` зовётся ПОСЛЕ коммита pool-мутации, не до.**
  В отличие от `pool → bout` в `SetStatus` (спека 0010, где `bout`-эффект
  нарочно идёт первым, чтобы при ошибке локальный статус не менялся), здесь
  порядок обратный: чтобы вычислить `hasDistributed`, нужен уже
  *результирующий* `Layout` после мутации. Если `SyncRegistrationState`
  упадёт (напр. `nomination` недоступен) — pool-мутация уже применена, RPC
  вернёт ошибку админу, а `nomination.has_distributed_fighters` останется
  стале до следующей успешной мутации пула этой номинации. Приемлемо: это
  мягкий статус-флаг (не хард-инвариант вроде «одна арена — один пул»), и
  спека сама допускает eventual convergence (NFR-4, «сходится на следующей
  мутации»). Если станет проблемой — не exactly-once, а retry с backoff
  внутри адаптера, отдельным тикетом.
- **`CloseRegistration` на уже `closed(drawing)` — идемпотентный no-op, не
  ошибка.** Альтернатива (вернуть `FailedPrecondition`, раз кнопка и так
  недоступна по FR-9) отклонена: no-op проще, не требует нового кода ошибки
  и симметричен идиоме `pool.SetStatus` (draft→draft — не переход, без
  ошибки). Кнопка в UI всё равно недоступна в этом состоянии — юзер эту
  ветку с UI не достанет, RPC остаётся defensive.
- **Гейт `ReopenRegistration` — `HasDistributedFighters`, не «reason»,
  определяет доступность кнопки в UI.** Именно поэтому `closed_reason` не
  нужно выводить на фронт вообще (см. «Обзор решения») — упрощает контракт
  относительно первой версии спеки (до ревалидации предполагалось различать
  «manual» и «drawing» визуально).
