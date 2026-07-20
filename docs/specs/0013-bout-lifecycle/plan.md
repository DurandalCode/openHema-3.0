# Plan: Жизненный цикл боя и текущий бой на арене

> Артефакт SDD (ADR 0008). Описывает **КАК** реализуем `spec.md` в архитектуре
> проекта. Заполняется только когда в `spec.md` нет открытых
> `[NEEDS CLARIFICATION]`.

- Статус: draft
- Дата: 2026-07-20
- Спека: `./spec.md`

## Обзор решения

Два модуля, синхронная координация через порт (ADR 0002), без межмодульной
событийной шины.

1. **`bout`** становится **event-sourced** (ADR 0011): у боя появляется журнал
   доменных фактов (`bout.bout_events`) + инлайн-проекция (существующая
   `bout.bouts`, расширенная состоянием и счётом) + оптимистичная конкуренция по
   версии потока. Модуль **остаётся листом** (ни от кого не зависит: `pool_id`
   денормализован как раньше). Лайфсайкл-команды боя (`Start/Score/Finish/
   Reopen/Reset`) экспортируются **методами сервиса** и вызываются модулем
   `pool` через порт — **на провод новых RPC у `bout` не выносим** (публичного
   чтения результатов нет, spec «Вне скоупа»; экран ведения — pool-scoped).
2. **`pool`** оркестрирует ведение: хранит указатель **текущего боя**
   (`pool.pools.current_bout_id`), гейтит «вести можно только на арене» (FR-12),
   авто-продвигает текущий бой (FR-9), **вычисляет** исполнительный статус пула
   (`preparing/active/finished`) из состояний боёв (FR-10) и отдаёт **доску
   ведения** (`BoutBoard`) для экрана арены. Расширяет существующий порт
   `pool → bout` (`BoutGenerator` → добавляются лайфсайкл-команды и чтения
   состояний). Гейт расфиксации (FR-13) дополняется проверкой «есть проведённые
   бои».
3. **`arena`** — **без изменений на сервере** (лист, 0008).
4. **web** — экран ведения боёв на странице арены (0011, FR-9): заменяет
   плейсхолдер «ход боя»; кнопки счёта `±1/±2/±3/±5` + ручной ввод, старт/
   завершение/переоткрытие/сброс, циркуляция по боям пула; статус пула.

Направления зависимостей (ацикличны, как в 0010/0011): `pool → bout`,
`pool → arena`, `pool → fighter`. `bout`/`arena` — листья. Никаких `bout →
pool` (это создало бы цикл) — вся координация со стороны `pool`.

**Способ выражения счёта.** Команда счёта — **абсолютная** установка
(`score_a, score_b`), не дельта: команда идемпотентна, тривиально ложится на
ручной ввод, а быстрые шаги `±N` — чисто клиентская арифметика поверх текущего
счёта из проекции (spec решение №7: «±N — UX, не модель»). Домен валидирует
`score ≥ 0`; клиент клампит шаг `−N` к нулю и не шлёт отрицательных значений.

## Контракты (proto)

> Источник истины API — `/proto`. Меняем только там, потом `make generate`.

### `proto/hema/v1/pool.proto`

- **Новый enum `BoutState`** (состояние боя для доски ведения):
  `BOUT_STATE_UNSPECIFIED=0, BOUT_STATE_NOT_STARTED=1, BOUT_STATE_IN_PROGRESS=2,
  BOUT_STATE_FINISHED=3`.
- **`PoolStatus`** — без изменений enum (значения `ACTIVE=4`/`FINISHED=5`
  существуют с 0011 как задел; этот инкремент их **наполняет** вычислением).
- **Новое сообщение `BoardBout`** — проекция боя для экрана ведения (собственная
  проекция pool, `bout`-сообщения не переиспользуются, ADR 0002; счёт/состояние
  живут в доске, не в публичном `bout.Bout`):
  ```
  message BoardBout {
    string id = 1;
    int32 round_number = 2;
    int32 sequence_number = 3;
    FighterRef fighter_a = 4;   // pool.FighterRef (переиспользуем свой)
    FighterRef fighter_b = 5;
    BoutState state = 6;
    int32 score_a = 7;
    int32 score_b = 8;
  }
  ```
- **Новое сообщение `BoutBoard`** — доска ведения одной арены:
  ```
  message BoutBoard {
    Pool pool = 1;                 // стоящий на арене пул (статус/арена)
    repeated BoardBout bouts = 2;  // бои пула по порядку (sequence)
    string current_bout_id = 3;    // текущий бой (пусто, если боёв нет)
  }
  ```
- **`PoolAdminService`** — новые RPC (все pool-scoped, под RequireAdmin). Каждый
  RPC — своя пара Request/Response (buf lint `RPC_REQUEST_RESPONSE_UNIQUE`:
  сообщение не переиспользуется между разными RPC, как в `bout.proto`); все
  ответы по форме одинаковы — `{ BoutBoard board = 1; }`, возвращают
  обновлённую доску после мутации (клиенту не нужен второй round-trip):
  - `GetBoutBoard(GetBoutBoardRequest{arena_id}) → GetBoutBoardResponse{BoutBoard board}` —
    доска арены; `board` пуст, если на арене никто не стоит.
  - `SetCurrentBout(SetCurrentBoutRequest{pool_id, bout_id}) →
    SetCurrentBoutResponse` — циркуляция (FR-8): назначить текущим любой бой
    пула.
  - `StartCurrentBout(StartCurrentBoutRequest{pool_id}) →
    StartCurrentBoutResponse` — FR-4.
  - `ScoreCurrentBout(ScoreCurrentBoutRequest{pool_id, score_a, score_b}) →
    ScoreCurrentBoutResponse` — FR-2/FR-2a (абсолютная установка).
  - `FinishCurrentBout(FinishCurrentBoutRequest{pool_id}) →
    FinishCurrentBoutResponse` — FR-5 (+ авто-продвижение текущего, FR-9).
  - `ReopenCurrentBout(ReopenCurrentBoutRequest{pool_id}) →
    ReopenCurrentBoutResponse` — FR-6.
  - `ResetCurrentBout(ResetCurrentBoutRequest{pool_id}) →
    ResetCurrentBoutResponse` — FR-6.
- Заметка в комментарии `UnseatPool`: снятие разрешено в любой исполнительной
  фазе (FR-11) — enum-ограничений нет, меняется только серверная логика/док.

### `proto/hema/v1/bout.proto`

- **Без изменений на проводе.** Лайфсайкл боя — внутримодульный (event store +
  сервисные методы), вызывается `pool` через in-process порт (как
  `BoutGenerator` сегодня). `BoutAdminService`/`BoutPublicService.
  ListBouts*` — прежние (пары + порядок, без счёта/состояния): результаты
  публично/на общем списке не раскрываем (spec «Вне скоупа»).

### `proto/hema/v1/arena.proto`

- **Без изменений** (arena — лист).

## Server (модули и слои)

### Модуль `bout` (расширение до event-sourced)

- **PG-схема `bout`.** Миграция `00002_bout_lifecycle.sql`:
  - `ALTER TABLE bout.bouts` — проекция боя (aggregate current state):
    - `ADD COLUMN state TEXT NOT NULL DEFAULT 'not_started'
       CHECK (state IN ('not_started','in_progress','finished'))`
    - `ADD COLUMN score_a INTEGER NOT NULL DEFAULT 0 CHECK (score_a >= 0)`
    - `ADD COLUMN score_b INTEGER NOT NULL DEFAULT 0 CHECK (score_b >= 0)`
    - `ADD COLUMN version INTEGER NOT NULL DEFAULT 0` — версия потока (для
      оптимистичной конкуренции; на момент BoutScheduled = 1).
    - _Зачем в bouts, а не отдельной таблицей проекции: `bouts` уже несёт
      неизменяемую пару/порядок (снапшот 0010) — добавляем к ней изменяемые
      state/score. Одна строка = текущее состояние агрегата (ADR 0011 п.4)._
  - **Новая таблица `bout.bout_events`** — append-only журнал (ADR 0011 п.2):
    ```
    CREATE TABLE bout.bout_events (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      bout_id     UUID NOT NULL REFERENCES bout.bouts(id) ON DELETE CASCADE,
      version     INTEGER NOT NULL,          -- 1-based порядок в потоке
      event_type  TEXT NOT NULL CHECK (event_type IN
                    ('scheduled','started','scored','finished','reopened','reset')),
      payload     JSONB NOT NULL DEFAULT '{}',  -- {score_a,score_b,...} по типу
      actor_id    UUID,                       -- кто (nullable для scheduled)
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT uq_bout_events_version UNIQUE (bout_id, version)  -- ADR 0011 п.3
    );
    CREATE INDEX idx_bout_events_bout ON bout.bout_events (bout_id, version);
    ```
    - FK `bout_id → bouts(id)` — внутрисхемный (разрешён), `ON DELETE CASCADE`:
      регенерация (ready→draft→ready, 0010) удаляет `bouts` → журнал events
      удаляется каскадом (историю прошлых наборов не храним, 0010 решение №3;
      удаление гейтится FR-13, поэтому теряется только «пустая» история без
      результатов).
  - down: `DROP TABLE bout_events; ALTER TABLE bouts DROP COLUMN ...`.
- `domain/`:
  - Расширить `Bout`: `State BoutState`, `ScoreA, ScoreB int`, `Version int`.
    Новый тип `BoutState` (`not_started/in_progress/finished`) + `Outcome()`
    (A/B/draw из счёта, FR-3).
  - **Событийная модель** (по образцу `application/domain`): `EventType`
    (`scheduled/started/scored/finished/reopened/reset`), `Event{Type, ActorID,
    OccurredAt, Sequence, Payload{ScoreA,ScoreB, + поля scheduled: PoolID,
    NominationID, Round, Sequence, FighterA/B}}`, `Rebuild(boutID, events) →
    Bout`, `apply` (свёртка).
  - **Команды-решения** (чистые, на агрегате): `Start()` (только not_started),
    `Score(a,b)` (только in_progress; `a,b ≥ 0` → иначе `ErrInvalidInput`),
    `Finish()` (только in_progress), `Reopen()` (только finished), `Reset()`
    (только in_progress) — каждая возвращает `Event` или `ErrInvalidTransition`.
    `Scheduled(...)` — конструктор первого события (version 1).
  - Доменные ошибки: `ErrNotFound`, `ErrInvalidTransition`, `ErrInvalidInput`,
    `ErrConcurrency` (как `application`).
  - Порт `Repository` (event store + проекция):
    - `Load(ctx, boutID) ([]Event, error)` — поток боя по версии.
    - `Append(ctx, boutID, expectedVersion int, ev Event, view BoutView) error`
      — атомарно вставить событие `version=expectedVersion+1` + upsert проекции;
      конфликт версии → `ErrConcurrency`.
    - `ReplaceForNomination(ctx, nominationID, scheduled []Bout) error` —
      как 0010, но теперь на каждый бой пишет и строку `bouts` (проекция,
      state=not_started, version=1), и событие `scheduled` (version=1), одной
      транзакцией (delete streams+projection номинации → insert).
    - `ListByNomination(ctx, nominationID) ([]Bout, error)` — как 0010 (для
      admin/public list; счёт/состояние в проекции есть, но эти RPC их не
      отдают — маппинг в api их опускает).
    - `BoutsByPool(ctx, poolID) ([]Bout, error)` — бои пула с состоянием/счётом,
      по sequence (для доски `pool`).
    - `GetBout(ctx, boutID) (Bout, error)`.
    - `PoolProgress(ctx, poolID) (total, started, finished int, error)` — для
      статуса пула (FR-10). _(можно вычислять из BoutsByPool; отдельный запрос —
      оптимизация, реши на этапе repo.)_
    - `AnyStartedInNomination(ctx, nominationID) (bool, error)` — гейт FR-13
      (есть ли бой со state≠not_started).
- `service/` (`Service`, event-sourced юзкейсы):
  - `StartBout/ScoreBout/FinishBout/ReopenBout/ResetBout(ctx, boutID, actorID,
    a,b?)` — цикл ADR 0011: `Load → Rebuild → decide → Append(expectedVersion)`;
    на `ErrConcurrency` — **один прозрачный повтор** (reload→redecide→reappend),
    затем отдать `ErrConcurrency` (ADR 0011 п.3).
  - `GenerateForNomination/ClearForNomination` — как 0010 (теперь пишут и
    проекцию, и `scheduled`-события).
  - Чтения `BoutsByPool/GetBout/PoolProgress/AnyStartedInNomination/
    ListByNomination`.
- `api/` — **без новых wire-RPC**; существующие `ListBouts*` без изменений
  (маппинг проекции → `Bout` опускает state/score). Лайфсайкл — только через
  сервис (порт), не через Connect.
- `repo/` — `queries/bout.sql` расширить: `AppendEvent` (insert + `ON CONFLICT
  DO NOTHING`/возврат для детекта конкуренции), `UpsertProjection`,
  `LoadEvents`, `BoutsByPool`, `PoolProgress`, `AnyStartedInNomination`;
  `ReplaceForNomination` переписать (bouts+events в одной tx). `make sqlc`.
  Атомарность Append/Replace — через `pgx.Tx` (как `application/repo`).
- `integration/` — testcontainers: конфликт версии `uq_bout_events_version`
  реально ловится (два `Append` из одной версии — второй `ErrConcurrency`,
  AC-15); append+projection атомарны; regen каскадит events.

### Модуль `pool` (расширение: оркестрация ведения)

- **PG-схема `pool`.** Миграция `00004_pool_current_bout.sql`:
  - `ALTER TABLE pool.pools ADD COLUMN current_bout_id UUID NULL` — указатель
    текущего боя (денормализованный uuid, без кросс-схемного FK на `bout`,
    ADR 0002). _Исполнительный статус пула НЕ храним колонкой: `preparing/
    active/finished` вычисляется из (arena_id, прогресс боёв) — нет десинхрона
    (0011 NFR-1)._
  - down: `DROP COLUMN current_bout_id`.
- `domain/`:
  - `Pool`: добавить `CurrentBoutID string`.
  - `ComputePoolStatus` — расширить сигнатуру: `(layout LayoutStatus, arenaID
    string, started, finished, total int) PoolStatus`:
    - layout draft → `not_ready`;
    - все бои finished и total>0 → `finished` (независимо от arenaID — снятие
      сохраняет результат, FR-11);
    - started>0 (и не все finished) → `active`;
    - arenaID задан и started==0 → `preparing`;
    - иначе (ready, не на арене, started==0) → `ready`.
  - **Порт `BoutGenerator` → расширить/переименовать в `BoutConductor`**
    (`pool → bout`): к `GenerateForNomination/ClearForNomination` добавить:
    - `StartBout/ScoreBout/FinishBout/ReopenBout/ResetBout(ctx, boutID, actorID
      [,a,b])` — делегирование лайфсайкл-команд.
    - `BoutsByPool(ctx, poolID) ([]BoutRef, error)` — id/sequence/round/пара/
      state/score.
    - `PoolProgress(ctx, poolID) (total, started, finished int, error)`.
    - `AnyStartedInNomination(ctx, nominationID) (bool, error)`.
    - (существующий `ArenaProvider`, `ActiveFightersProvider` — без изменений.)
  - Доменные ошибки: `ErrPoolNotSeated` (ведение вне арены, FR-12),
    `ErrNoCurrentBout` (нет текущего боя — пустой пул), `ErrHasResults`
    (расфиксация при проведённых боях, FR-13). Плюс проксируемые из bout
    (`ErrInvalidTransition/ErrConcurrency`).
- `service/`:
  - `GetBoutBoard(arenaID)`: `repo.PoolsForArena` (стоящий пул, 0011) → если
    пуст, вернуть пустую доску; иначе `BoutsByPool` + вычислить статус
    (`PoolProgress`) + резолв текущего боя (см. ниже) + сборка `BoutBoard`.
  - **Резолв текущего боя** (`effectiveCurrent(pool, bouts)`): если
    `current_bout_id` задан и принадлежит пулу — он; иначе первый бой с
    `state≠finished` по sequence (или пусто). Ленивая инициализация: при
    расхождении писать `current_bout_id` в БД (или пересчитывать на каждом
    чтении — реши в repo; хранить полезно для стабильности между сессиями).
  - Ведение (все: загрузить пул; **гейт `arena_id` задан** иначе
    `ErrPoolNotSeated` (FR-12); резолв текущего боя иначе `ErrNoCurrentBout`;
    вызвать соответствующую команду порта; вернуть свежую доску):
    - `StartCurrentBout/ScoreCurrentBout/ReopenCurrentBout/ResetCurrentBout`.
    - `FinishCurrentBout`: после `port.FinishBout` — **авто-продвижение**:
      `current_bout_id := next state≠finished по sequence после текущего` (или
      пусто) → записать.
    - `SetCurrentBout(poolID, boutID)`: валидировать `boutID ∈ BoutsByPool`,
      записать `current_bout_id` (любое состояние, FR-8).
  - `SetStatus` (0009/0011): в ветке `ready→draft` — к проверке
    `AnySeatedInNomination` (0011) добавить `AnyStartedInNomination`
    (`ErrHasResults`, FR-13) **до** `ClearForNomination`.
  - `loadLayout`/`ListPublicPools`/`GetPoolsForArena` (0011): при сборке
    `Pool.Status` теперь передавать прогресс боёв в `ComputePoolStatus`
    (батч `PoolProgress` по пулам, чтобы не N+1) — статусы `active/finished`
    начинают проявляться и в существующих экранах.
- `api/`:
  - Новые хендлеры `GetBoutBoard/SetCurrentBout/StartCurrentBout/
    ScoreCurrentBout/FinishCurrentBout/ReopenCurrentBout/ResetCurrentBout` +
    маппинг доменных ошибок → `connect.Code`:
    `ErrPoolNotSeated/ErrNoCurrentBout/ErrHasResults/ErrInvalidTransition` →
    `FailedPrecondition`; `ErrConcurrency` → `Aborted`; `ErrInvalidInput` →
    `InvalidArgument`; `ErrNotFound` → `NotFound`. Под adminOpts (FR-15).
  - `actorID` берётся из контекста аутентификации (как в существующих
    admin-хендлерах) и прокидывается в сервис для журнала боя (ADR 0011).
- `repo/` — `queries/pool.sql`: `SetCurrentBout`, `GetPool`(+current_bout_id),
  выборки с `current_bout_id`. `make sqlc`.
- `integration/` — testcontainers: авто-продвижение + статус пула на реальном
  пути pool×bout (по возможности; координация двух схем).

### `internal/platform`

- **Адаптер `pool_bout_conductor.go`**: `PoolBoutConductor` реализует
  `pool/domain.BoutConductor` поверх `bout` service — расширяет существующий
  `PoolBoutGenerator` (те же Generate/Clear + новые лайфсайкл/чтения). Маппинг
  `bout/domain.Bout ↔ pool/domain.BoutRef`, ошибок bout → доменные ошибки pool
  (проксируются как есть — оба используют `ErrInvalidTransition/ErrConcurrency`
  с совместимой семантикой; если типы разные — маппить).
- `platform.go`: `poolDeps.Bouts = NewPoolBoutConductor(bout)` (вместо/сверх
  Generator). Порядок регистрации: `bout` уже поднимается раньше `pool`.

## Web (FSD + BFF)

- **BFF (Route Handlers, Node runtime):**
  - `app/api/arenas/[id]/board/route.ts` (GET) — `GetBoutBoard`.
  - `app/api/pools/[poolId]/current-bout/route.ts` (PUT `{bout_id}`) —
    `SetCurrentBout`.
  - `app/api/pools/[poolId]/bout/route.ts` (POST `{action, score_a?, score_b?}`)
    — диспатч на `Start/Score/Finish/Reopen/Reset CurrentBout` (одна ручка,
    action в теле; маппинг `connect.Code`→HTTP: `FailedPrecondition`→409,
    `Aborted`→409, `InvalidArgument`→400).
- **entities:**
  - `entities/pool/lib/types.ts` — `BoutState`, `BoardBout`, `BoutBoard`,
    `outcomeOf(scoreA,scoreB)` (A/B/draw), обновить `PoolStatus` метки
    (`active`→«идёт», `finished`→«завершён»).
- **features:**
  - `features/bout-board` (новая) — `api/` (getBoutBoard + мутации
    start/score/finish/reopen/reset/setCurrent, keys, RQ-хуки), `model/`
    (клиентская арифметика шагов `±1/±2/±3/±5` с клампом к 0), `ui/`:
    - `BoutBoard` — карточка текущего боя: пара бойцов, счёт, кнопки шагов
      `±1/±2/±3/±5` у каждого бойца + ручной ввод (числовое поле), кнопки
      `Начать/Завершить/Переоткрыть/Сбросить` по состоянию, индикатор исхода;
    - список боёв пула (по порядку, состояние/счёт) с выбором текущего
      (циркуляция) — клик по бою → `SetCurrentBout`.
  - `features/pool-seating` (0011) — на странице арены: если пул стоит, вместо
    плейсхолдера рендерить `BoutBoard`; список доступных пулов оставить для
    свободной арены.
- **widgets / routes:**
  - `app/(admin)/admin/arenas/[id]/page.tsx` — заменить плейсхолдер «ход боя —
    будущий инкремент» на секцию ведения (widget над `features/bout-board`),
    когда арена занята.
- **State:** ведение — TanStack Query (`useMutation`, инвалидация ключа доски
  арены); арифметика шагов счёта — локальный `useState`/чистая функция; SSR не
  требуется (админский экран).

## События

> Внутримодульный event sourcing боя — по ADR 0011 (принят; образец —
> `application`): журнал `bout.bout_events`, инлайн-проекция `bout.bouts`,
> оптимистичная конкуренция по `UNIQUE(bout_id, version)`. **Межмодульной**
> событийной шины нет: координация `pool → bout` — синхронный in-process порт
> (ADR 0002), как `BoutGenerator`/`ArenaProvider` в 0010/0011.

- Издаёт (наружу модуля): нет. Потребляет: нет.

## Тестирование

> См. ADR 0003 (стратегия) и ADR 0009 (TDD-цикл).

- **Юнит `bout/domain`:** `Rebuild`/`apply` на каждый тип события; команды-
  решения — допустимые/недопустимые переходы (Start/Score/Finish/Reopen/Reset),
  `Score` отвергает отрицательные, `Outcome()` (A/B/draw) — AC-2/2b/3.
- **Юнит `bout/service` (fake-репо):** лайфсайкл happy-path; недопустимый
  переход (AC-4); прозрачный повтор при `ErrConcurrency` (один retry → успех;
  повторный конфликт → `ErrConcurrency`).
- **Юнит `pool/service` (fake `BoutConductor` + fake arena + fake repo):**
  гейт «вести только на арене» (AC-13); авто-продвижение текущего (AC-5);
  циркуляция на завершённый (AC-6); вычисление статуса `active`/`finished`
  (AC-9/AC-10); гейт расфиксации при проведённых боях (AC-12); снятие пула с
  результатами сохраняет прогресс (AC-11).
- **E2E ручек `pool/api` (httptest+Connect, fake-репо):** новые RPC + маппинг
  ошибок (`FailedPrecondition/Aborted/InvalidArgument`); admin-only (AC-14).
- **Интеграционные (testcontainers):** `bout` — конфликт версии реально ловится
  (AC-15), append+projection атомарны, regen каскадит events; `pool` — резолв
  доски арены через реальный путь (по возможности).
- **Web (Vitest):** BFF `board`/`current-bout`/`bout` (мок grpc, `connect.Code`
  →HTTP); чистая функция шагов счёта `±N` с клампом к 0 (AC-2a); `outcomeOf`;
  фетчер/хуки доски.

## Риски и открытые вопросы

- **Координация двух схем (pool ↔ bout) не транзакционна.** `FinishCurrentBout`
  делает append события боя (bout) и запись `current_bout_id` (pool) двумя
  вызовами. Статус пула вычисляемый, поэтому рассинхрона статуса нет; худшее —
  `current_bout_id` отстанет от факта завершения, но `effectiveCurrent`
  пересчитывает «первый непроведённый» и самолечится на следующем чтении.
  Приемлемо (один секретарь на арену). Жёсткая транзакционность между модулями —
  не вводим (это вернуло бы кросс-схемную связность, ADR 0002).
- **Абсолютная установка счёта под конкуренцией** (два клиента, stale счёт) —
  теоретически теряет инкремент; на практике один секретарь на арену. Если
  понадобится — перейти на дельта-команду `AdjustScore(±N)` без ломки журнала
  (payload уже несёт итог). Зафиксировано в spec решении №7 как plan-выбор.
- **`current_bout_id` хранить vs вычислять.** Храним (стабильность ручной
  циркуляции между сессиями, spec FR-7 «у пула есть текущий бой»); авто-выбор —
  фолбэк при пустом/невалидном указателе. Альтернатива (чисто вычислять) теряла
  бы ручной выбор завершённого боя (AC-6).
- **Статус `active/finished` в существующих экранах 0011.** Расчёт статуса
  теперь требует прогресса боёв — добавляется батч `PoolProgress`, чтобы
  `loadLayout`/`ListPublicPools`/`GetPoolsForArena` не деградировали в N+1.
- **Пул с 0 боёв на арене** остаётся `preparing` (нет текущего боя): доска
  показывает пустой список, ведение недоступно (`ErrNoCurrentBout`), секретарь
  просто снимает пул. Benign, покрыть тестом статуса.
