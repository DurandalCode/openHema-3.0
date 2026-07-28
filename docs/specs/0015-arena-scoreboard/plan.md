# Plan: Табло арены (arena scoreboard) с таймером боя

> Артефакт SDD (ADR 0008). Описывает **КАК** реализуем `spec.md` в архитектуре
> проекта. Заполняется только когда в `spec.md` нет открытых
> `[NEEDS CLARIFICATION]`.

- Статус: ready
- Дата: 2026-07-28
- Спека: `./spec.md`

## Обзор решения

Фича почти целиком — **чтение + живое проталкивание проекции + эфемерная
координация**, доменной логики нет (кроме одной недоменной настройки арены —
`default_duration`). Три части:

1. **Горячие данные табло — переиспользуем `GetBoutBoard` (0013).** Он уже отдаёт
   ровно то, что нужно табло: стоящий на арене пул, его бои по порядку (0010) с
   парами/состоянием/счётом и `current_bout_id`. Из этого клиент выводит текущий
   бой (синий/красный, счёт), следующую пару, «Бой N из M», исход завершённого
   (победа/ничья — из `state`+счёта, как 0014). **Новых доменных данных нет.**
2. **Живой канал арены — повторяем паттерн 0014** (`pkg/livebus` + server-streaming
   + BFF-SSE + polling-fallback), но **по топику арены** и на **admin**-сервисе
   (табло admin-only, FR-1).
3. **Таймер — табло №1 авторитетный тикер, сервер тупое реле (SSE), синхроним
   полное время.** Таймер недоменный (FR-16): не пишется в БД/журнал. Авторитетный
   отсчёт крутится **на клиенте табло №1** (`requestAnimationFrame`, локальные часы
   — идеально плавно, ноль собственной задержки, на паузе замораживает **своё**
   значение → на главном экране скачка нет). №1 **транслирует полное время** в
   комнату арены через сервер-реле; панель и другие табло — **followers**: тянутся
   к присланному значению **плавной коррекцией (easing)**, без резких прыжков.

Персистентно добавляется **только** `arena.default_duration_seconds` (недоменная
настройка, FR-8). Всё остальное новое состояние (значение таймера, swap, ordinals)
— эфемерное: живёт на клиенте-авторитете и в тонком in-memory кеше-реле сервера.

### Решение по транспорту и «источнику» таймера (закрываем отложенное спекой)

Спека отложила транспорт на план, задав планку: **источник — табло, панель ведомая,
до сотых, монотонно без скачков, деградация** (FR-10..FR-13, NFR-2). Со
стейкхолдером зафиксировано (2026-07-28):

- **Авторитет — клиент табло №1, не сервер** (буквальное «источник — само табло»).
  Сервер таймерной логики **не содержит** (консистентно с «таймер вне домена»): он
  тупое **реле + кеш** — раздаёт ordinals, кеширует последний присланный №1 кадр
  времени (для поздних подписчиков), фанит команды панели и кадры времени в комнату.
- **Синхроним полное время, followers сглаживают** (ответ на «иначе сотые
  разбежались при паузе»): №1 периодически (пока `RUNNING`, ~200 мс) и на каждом
  переходе шлёт **полное текущее значение** (`remaining_cs` + `status`); followers
  показывают его с короткой **плавной коррекцией** и локальным доводом между
  кадрами (rAF) → сотые плавные, пауза — обычный кадр, к которому все плавно
  сходятся, а №1 (главный экран) идеален всегда (локальные часы, без сети).
- **Транспорт — SSE-реле (переиспользуем 0014), WebRTC отвергнут.** WebRTC/PeerJS
  давал бы суб-10 мс P2P, но по возне не меньше (сигналинг + TURN для надёжности на
  зальной сети + координация пиров + второй realtime-стек), а выигрыш касается
  **только followers**: раз №1 = источник И это экран, на который смотрят, его часы
  идеальны при любом транспорте. Выбран SSE-реле: ноль новой инфры, надёжно на
  любой сети, деградация на polling — как 0014.
- **Комната/ordinals/хэндофф**: комната арены существует, пока подключено ≥1 табло;
  табло нумеруются по заходу, №1 — авторитет; при закрытии — переиндексация без
  «дыр» (FR-12). При закрытии №1 сервер повышает бывшее №2 → новый №1: оно уже было
  follower и держит последнее значение таймера, поэтому **подхватывает отсчёт без
  сброса** (короткий переходный момент). Нет табло — нет таймера (панель одна лишь
  копит команды/показывает «откройте табло»).

Фиксируется **ADR 0013** (`docs/adr/0013-arena-scoreboard-timer-relay.md`),
расширяющим ADR 0012: клиент-№1-авторитет + сервер-реле + отказ от WebRTC +
easing-коррекция + допущение одного инстанса монолита (как 0012).

## Контракты (proto)

> Источник истины API — `/proto`. Меняем только там, потом `make generate`.

### `proto/hema/v1/arena.proto` — недоменная настройка длительности (FR-8)

- `message Arena`: добавить `int32 default_duration_seconds = 9;` (секунды;
  дефолт схемы 90).
- `service ArenaAdminService`: новый RPC
  - `rpc SetArenaDefaultDuration(SetArenaDefaultDurationRequest) returns (SetArenaDefaultDurationResponse);`
  - `SetArenaDefaultDurationRequest { string arena_id = 1; int32 default_duration_seconds = 2; }`
  - `SetArenaDefaultDurationResponse { Arena arena = 1; }`
  - Валидация в сервисе: `1..3600` c; иначе `InvalidArgument`.

### `proto/hema/v1/pool.proto` — живой канал арены (реле) + команды

Живём в **`PoolAdminService`** (admin conducting уже здесь). Переиспользуем
`BoutBoard`/`Pool`/`BoardBout`/`FighterRef`/`BoutState` (DRY). Сервер — **реле**,
таймерной семантики в контракте на сервере нет: `TimerFrame` **производит клиент
№1**, сервер лишь фанит.

- Стриминг живого канала арены (server→client):
  - `rpc WatchArenaBoard(WatchArenaBoardRequest) returns (stream WatchArenaBoardResponse);`
  - `WatchArenaBoardRequest { string arena_id = 1; ScoreboardRole role = 2; }`
  - `WatchArenaBoardResponse { oneof event { ArenaLiveSnapshot snapshot = 1; TimerCommand command = 2; } }`
    - `snapshot` — полное состояние арены (доска + комната + последний известный
      `TimerFrame` + дефолт + `server_now`); шлётся на подключении и при изменении
      доски/состава комнаты/swap/присланного кадра времени.
    - `command` — **реле команды панели** авторитету (№1 применяет; прочие
      игнорируют).
- Публикация клиентом (client→server, unary):
  - `rpc PublishTimerFrame(PublishTimerFrameRequest) returns (PublishTimerFrameResponse);`
    `PublishTimerFrameRequest { string arena_id = 1; TimerFrame frame = 2; }` —
    **только авторитет №1** вызывает (~200 мс пока RUNNING + на переходах). Сервер
    кеширует как «последний кадр» и фанит `snapshot` в комнату.
  - `rpc ControlArenaTimer(ControlArenaTimerRequest) returns (ControlArenaTimerResponse);`
    `ControlArenaTimerRequest { string arena_id = 1; TimerCommand command = 2; }` —
    **панель** шлёт команду; сервер реле → `command`-event в комнату (№1 применит).
  - `rpc SetScoreboardSides(SetScoreboardSidesRequest) returns (SetScoreboardSidesResponse);`
    `SetScoreboardSidesRequest { string arena_id = 1; bool swapped = 2; }` — swap
    (эфемерно, FR-6); сервер кеширует `sides_swapped`, фанит `snapshot`.
- Сообщения/enum:
  - `enum ScoreboardRole { SCOREBOARD_ROLE_UNSPECIFIED = 0; SCOREBOARD_ROLE_SCOREBOARD = 1; SCOREBOARD_ROLE_PANEL = 2; }`
  - `enum TimerStatus { TIMER_STATUS_UNSPECIFIED = 0; STOPPED = 1; RUNNING = 2; PAUSED = 3; EXPIRED = 4; }`
  - `message TimerCommand { TimerCommandKind kind = 1; int32 amount_seconds = 2; }`
    `enum TimerCommandKind { TIMER_COMMAND_KIND_UNSPECIFIED = 0; START = 1; PAUSE = 2; RESET = 3; ADJUST = 4; }`
    (`amount_seconds` — знаковое, только для `ADJUST`: ±1/±2/±3/±5).
  - `message TimerFrame { TimerStatus status = 1; int32 remaining_cs = 2; int64 sampled_unix_ms = 3; int32 default_cs = 4; }`
    (**полное время**: `remaining_cs` — сантисекунды в момент `sampled_unix_ms` по
    часам №1; followers доводят локально между кадрами).
  - `message ScoreboardRoom { int32 scoreboard_count = 1; int32 this_ordinal = 2; bool this_is_source = 3; bool sides_swapped = 4; }`
    (для **этого** подписчика; №1 → `is_source`; panel → ordinal 0).
  - `message ArenaLiveSnapshot { BoutBoard board = 1; TimerFrame timer = 2; ScoreboardRoom room = 3; int32 default_duration_seconds = 4; int64 server_now_unix_ms = 5; }`
    (`board` пуст → «ожидание», FR-5; `default_duration_seconds` — из арены, чтобы
    №1 знал дефолт для reset/init; `timer` — последний кадр от №1 или
    `STOPPED@default`, если №1 ещё не слал).

> Swap, подсветка `<5 c`, оглашение победителя — **чисто клиентский показ**: swap
> несёт `ScoreboardRoom.sides_swapped`; подсветка/победитель выводятся из
> `TimerFrame`/`BoutBoard`, полей контракта не требуют.

## Server (модули и слои)

> См. ADR 0002 (модульный монолит) и `server/AGENTS.md`.

### `modules/arena/` — персист `default_duration` (расширение)

- **Миграция** `migrations/00002_default_duration.sql` (goose), схема `arena`:
  ```sql
  ALTER TABLE arena.arenas
    ADD COLUMN default_duration_seconds INTEGER NOT NULL DEFAULT 90
      CONSTRAINT chk_arenas_default_duration
      CHECK (default_duration_seconds BETWEEN 1 AND 3600);
  ```
  Зачем колонка, а не таблица: единичный скалярный атрибут арены (одна на
  агрегат-корень), не список — jsonb/дочерняя таблица избыточны.
- `repo/queries/arena.sql` — `UpdateArenaDefaultDuration` (`SET
  default_duration_seconds=$2, updated_at=now() WHERE id=$1 RETURNING *`);
  существующие `SELECT *`/`RETURNING *` подхватят колонку (sqlc-регенерация).
- `domain/` — поле `DefaultDurationSeconds int` в `Arena` + валидация диапазона.
- `service/` — `SetDefaultDuration(ctx, arenaID, seconds)` (арена существует, не
  архивна).
- `api/` — маппинг поля в `toProtoArena`; хендлер `SetArenaDefaultDuration`.
- **Порт для pool**: `ArenaProvider` (в `pool`) расширяется
  `DefaultDurationSeconds(ctx, arenaID) (int, error)` — читается для снапшота арены.

### `modules/pool/` — живой канал арены + реле таймера (расширение)

PG-схема **не меняется**, миграций у pool нет. Всё новое — in-memory **без
таймерной семантики** (сервер не «тикает»).

- **`pkg/livebus`** (из 0014) — переиспользуем; добавляем **топик арены**
  (`"arena:"+arenaID`). Сигнал при любом изменении доски/комнаты/кадра/swap.
- **Реле-комната арены (in-memory), новый компонент `api`/`service`:**
  `arenaRooms map[arenaID]*room` под mutex. `room{ members []*member; lastFrame
  *TimerFrame; swapped bool }`, `member{ role; ordinal; ch chan any }`.
  - **Жизненный цикл/ordinals**: при заходе `SCOREBOARD` — ordinal по порядку, №1
    → `is_source`; panel → ordinal 0. Выход → реиндекс табло (FR-12), сигнал. Нет
    табло → `lastFrame` сбрасывается (эфемерность): таймер «умирает» с табло.
  - **`PublishTimerFrame`** (от №1): проверка, что вызывающий — источник (ordinal 1
    role SCOREBOARD); сохранить `lastFrame`; сигнал (фан `snapshot`).
  - **`ControlArenaTimer`** (от панели): положить в реле как `command`-event, фан в
    комнату (№1 применит на клиенте). Сервер значение **не** меняет.
  - **`SetScoreboardSides`**: `room.swapped = swapped`; сигнал.
  - Сервер **не** делает авто-сброс/тик/expire — это клиент-№1 (см. Web).
- **`service.ArenaLive(ctx, arenaID) (ArenaLiveSnapshot, error)`**: `GetBoutBoard`-
  доска + `room.lastFrame` (или `STOPPED@default`) + `room` (для этого подписчика) +
  `DefaultDurationSeconds` (порт) + `server_now`.
- **`api` `PoolHandler`**:
  - `WatchArenaBoard`: зарегистрировать члена (role/ordinal, `bus.Subscribe`),
    послать первый `snapshot`; цикл `select { <-ctx.Done(): дерегистрация+реиндекс+
    сигнал; <-ch: если пришёл command → Send command-event, иначе перечитать
    ArenaLive → Send snapshot }`.
  - `PublishTimerFrame`/`ControlArenaTimer`/`SetScoreboardSides` — как выше.
  - **Публикация сигнала арены добавляется** в существующие board-мутирующие
    команды `service` (Seat/Unseat/SetCurrent/Start/Score/Finish/Reopen/Reset) —
    рядом с публикацией в топик номинации (0014); арена = `pool.ArenaID`. (Смена
    `current_bout_id` долетает до №1 доской → №1 сам сбрасывает таймер, FR-15.)
- **Wiring** (`internal/platform`): `arenaRooms` в composition root → в
  `service`/`PoolHandler`; `pool.Deps.Arena` расширен `DefaultDurationSeconds`.
  Стриминг/`Publish*`/`Control*`/`SetScoreboardSides` — под `adminOpts`
  (RequireAdmin): табло admin-only (FR-1/AC-15). `bout` — лист.

## Web (FSD + BFF)

> См. ADR 0005 (UI) и ADR 0006 (state), `web/AGENTS.md`. **Здесь живёт вся
> таймерная логика** (сервер её не содержит).

- **Маршрут табло** (admin-only, группа `(admin)`):
  `app/(admin)/admin/arenas/[id]/scoreboard/page.tsx` — server component,
  `runtime="nodejs"`, `dynamic="force-dynamic"`, полноэкранный layout сегмента
  **без** navbar/хрома. SSR-инициал: `getArena` (имя + `defaultDurationSeconds`) +
  `getBoutBoard` → в client-widget.
- **BFF (Route Handlers, Node):**
  - `app/api/arenas/[id]/live/route.ts` — **SSE-прокси** `watchArenaBoard`
    (`?role=scoreboard|panel`). По образцу `nominations/[id]/live` (0014): читает
    Connect-стрим, `data: <json>\n\n` (для обоих типов event: `{type:"snapshot"|
    "command", ...}`), heartbeat, cleanup по `req.signal`, admin-токен в gRPC.
  - `app/api/arenas/[id]/timer-frame/route.ts` — POST → `publishTimerFrame` (шлёт
    **только** клиент-№1).
  - `app/api/arenas/[id]/timer/route.ts` — POST → `controlArenaTimer` (панель).
  - `app/api/arenas/[id]/scoreboard-sides/route.ts` — POST → `setScoreboardSides`.
  - `app/api/admin/arenas/[id]/default-duration/route.ts` — PUT →
    `setArenaDefaultDuration` (персист).
  - Fallback/инициал: существующий `app/api/arenas/[id]/board/route.ts`
    (`getBoutBoard`) — polling-минимум (NFR-2).
  - Сериализация: `arenaLiveToJson` в `lib/grpc/serialize.ts` (переиспользует
    `boutBoardToJson`; `timer`/`room`/`default`/`server_now`).
- **Слои FSD:**
  - `entities/arena` — тип + `defaultDurationSeconds`.
  - `entities/arena-live/` — `lib/types.ts` (DTO snapshot/`TimerFrameDto`/`RoomDto`),
    `model/get-arena-live.ts` (server-only `getBoutBoard` для SSR). Хелперы `lib/`:
    `boutOutcome` (переиспользовать из `nomination-live`), `nextBout`/`boutNumber`.
  - **`features/arena-timer/` — ядро таймера (клиент):**
    - `model/timer-authority.ts` — **чистая функция-редьюсер** авторитета №1:
      `apply(state, command)` (START якорит по `performance.now`; PAUSE фиксирует
      точный `remaining_cs`; RESET → default/STOPPED; ADJUST ±N клэмп ≥0; на 0 →
      EXPIRED, FR-9) + `tick(state, now)` + `frameOf(state)`; авто-сброс при смене
      `current_bout_id` (FR-15). Юнит-тестируется без сети.
    - `model/timer-follower.ts` — приём `TimerFrame`, **easing-коррекция** +
      локальный довод rAF между кадрами (плавные сотые, без скачка на паузе).
    - `api/use-arena-timer.ts` — если `room.is_source`: гоняет authority (rAF),
      применяет пришедшие `command`-event, **публикует кадры** (`/timer-frame`,
      ~200 мс пока RUNNING + на переходах); иначе — follower по `timer`-кадрам.
    - `ui/TimerDisplay` — общий показ (сотые, подсветка `<5.00` FR-19, сигнал на 0);
      `ui/TimerControls` (панель): старт/пауза/сброс/`±1·2·3·5` → `/timer`; инпут
      дефолта → `/default-duration`; кнопка swap → `/scoreboard-sides`.
  - `features/arena-live/` — `api/use-arena-live.ts`: клиентский хук по образцу
    `use-nomination-live` (0014): `EventSource('/api/arenas/{id}/live?role=...')`,
    применяет `snapshot`/`command`, `serverOffset = server_now − Date.now()`,
    fallback на polling `/board`, авто-reconnect.
  - `widgets/arena-scoreboard/` — полноэкранная композиция (client), засеяна SSR,
    подписана `useArenaLive(role=scoreboard)` + `useArenaTimer`: шапка (арена/пул/
    «Бой N из M»), синий/красный (с учётом `sides_swapped`; счёт всегда у A/B —
    FR-6), `TimerDisplay`, следующая пара / «последний бой», **оглашение
    победителя** при `FINISHED` до смены текущего боя (FR-14), «ожидание» при пустой
    доске (FR-5). Read-only (FR-17).
  - **Панель**: на `app/(admin)/admin/arenas/[id]/page.tsx` / в `features/bout-board`
    — блок `TimerControls` (`role=panel`, синхронный показ через `useArenaTimer`),
    кнопка **«Открыть табло»** (`Link` на `/scoreboard`), настройка дефолта.
- **State** (ADR 0006): живой стрим → кастомный хук (local state, как 0014);
  таймер-показ → rAF+`useState`; команды/публикация кадров → fetch/`useMutation`;
  дефолт арены → RQ.

## События

> Внутрипроцессный live-broadcaster — **не** доменные события (как 0014). Таймер и
> swap доменных событий не порождают (FR-16/NFR-3): их состояние эфемерно — на
> клиенте-авторитете №1 и в тонком in-memory кеше-реле сервера, вне БД/журнала.
> Персистентно только `arena.default_duration_seconds`. Транспорт (SSE-реле +
> клиент-№1-авторитет + full-time с easing + отказ от WebRTC) — **ADR 0013**
> (расширяет ADR 0012).

- Издаёт: внутрипроцессный сигнал `arena-changed` (`"arena:"+arenaID`) из
  board-мутаций/реле кадров/команд/смены состава комнаты. Потребляет:
  `WatchArenaBoard`-хендлер. Наружу домена — ничего.

## Тестирование

> См. ADR 0003 (стратегия) и ADR 0009 (TDD-цикл).

- **Web-юнит (ядро таймера, чистые функции — приоритет):**
  - `timer-authority`: START якорит; `tick` монотонно убывает; PAUSE фиксирует
    точный `remaining_cs` (нет «скачка» старт/стоп); RESET→default/STOPPED; ADJUST
    ±N клэмп ≥0; на 0 → EXPIRED (FR-9); авто-сброс при смене `current_bout_id`
    (FR-15).
  - `timer-follower`: приём кадров, easing к присланному, локальный довод rAF,
    отсутствие резкого прыжка на паузе; подсветка `<5.00` (FR-19).
- **Web-юнит/e2e:**
  - `arenaLiveToJson` — round-trip proto→JSON (`oneof` snapshot/command, board+
    timer+room; proto3-omitted/enum). `pnpm exec tsc --noEmit` для protobuf-моков.
  - `live/route.ts` (e2e) — SSE-фрейминг обоих event, heartbeat, cleanup.
  - `timer`/`timer-frame`/`scoreboard-sides`/`default-duration` route — проброс в
    gRPC.
  - `use-arena-live`/`use-arena-timer` — применение snapshot/command, роль
    source vs follower, публикация кадров у source, fallback на polling.
  - `widgets/arena-scoreboard` — рендер: синий/красный со swap (счёт у своих),
    следующая пара / «последний бой», оглашение победы/ничьей, «ожидание».
- **Server-юнит (`pool` реле-комната):** ordinals (1/2/3, выход №1 → реиндекс,
  panel без ordinal, пустая комната → сброс `lastFrame`); `PublishTimerFrame`
  только от источника (не-№1 → отказ); `ControlArenaTimer` кладёт command-event;
  swap кешируется. **Таймерной математики на сервере нет — не тестируем «тик».**
- **Server-юнит (`arena/service`):** `SetDefaultDuration` валидирует `1..3600`;
  архивная арена — отказ.
- **E2E ручек (`pool/api`, httptest + Connect):** `WatchArenaBoard` — первый
  `snapshot` сразу; `ControlArenaTimer` → приходит `command`-event; `PublishTimerFrame`
  от №1 → приходит `snapshot` с кадром; после `StartCurrentBout`/`ScoreCurrentBout`
  → `snapshot` с новой доской; `SetScoreboardSides` → `snapshot` со swap; не-admin →
  `PermissionDenied` (AC-15); отмена контекста реиндексирует комнату.
- **E2E ручек (`arena/api`):** `SetArenaDefaultDuration` — успех/`InvalidArgument`.
- **Интеграционные с БД (`arena/integration`, testcontainers):** миграция `00002`
  применяется, `default_duration_seconds` читается/пишется (дефолт 90).

## Риски и открытые вопросы

- **Хэндофф авторитета при закрытии №1**: новый №1 (бывший follower) подхватывает
  последнее значение — короткий переходный момент (доли секунды) возможен. Приемлемо
  для недоменного таймера; альтернатива (сервер держит anchor) отвергнута ради
  буквального «источник — табло».
- **Частота публикации кадров (~200 мс)** — компромисс «трафик vs плавность
  followers»; тюнингуется. Followers всё равно доводят локально (rAF) + easing, так
  что редкие кадры не рвут показ. № 1 (главный экран) от частоты не зависит.
- **Followers отстают от №1 на задержку реле (2 хопа)** — скрыто easing; для
  главного экрана (№1) неактуально. Если появятся несколько равнозначных больших
  экранов, где нужна суб-cs точность между ними — вернуться к WebRTC (ADR 0013
  переигрывается).
- **Нет открытого табло** — таймер не «живёт» (панель показывает «откройте табло»);
  соответствует спеке (источник — табло). Команды панели без источника — no-op/
  очередь не копим.
- **Мульти-инстанс монолита**: `livebus`/комнаты внутрипроцессные (как 0012);
  single-instance деплой корректен; апгрейд — внешний pub/sub (ADR 0013).
- **Полноэкранный layout** сегмента `scoreboard` не должен тянуть navbar/AuthDialog
  root-layout — вложенный `layout.tsx` сегмента.
- **Дефолт: персист (arena) vs живой (комната)** — панель шлёт
  `SetArenaDefaultDuration` (персист); новый дефолт долетает до №1 полем
  `default_duration_seconds` снапшота → №1 использует при reset/init. Отдельной
  команды дефолта не нужно.
