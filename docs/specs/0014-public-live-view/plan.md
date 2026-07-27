# Plan: Публичное живое отображение номинации, пулов и боёв

> Артефакт SDD (ADR 0008). Описывает **КАК** реализуем `spec.md` в архитектуре
> проекта. Заполняется только когда в `spec.md` нет открытых
> `[NEEDS CLARIFICATION]`.

- Статус: ready
- Дата: 2026-07-27
- Спека: `./spec.md`

## Обзор решения

Фича — **чтение + живое проталкивание проекции**, без новой доменной логики.
Реализуем **настоящий end-to-end push** (решение спеки, вариант A1):

1. **Обогащаем публичное чтение**: единый снапшот номинации (пулы с
   исполнительным статусом/ареной/текущим боём + бои с состоянием/счётом)
   отдаётся одним unary-RPC (для SSR и polling-fallback) и одним
   **server-streaming** RPC (для live).
2. **In-process broadcaster** (новый примитив, **ADR 0012**): модуль `pool`
   после каждой мутирующей команды ведения/постановки публикует сигнал
   «номинация N изменилась»; streaming-хендлер, подписанный на номинацию,
   по сигналу перечитывает снапшот и шлёт его в поток.
3. **BFF проксирует поток в SSE**: Route Handler (Node runtime) читает
   Connect server-stream и переотдаёт браузеру как `text/event-stream`;
   браузер — нативный `EventSource` (авто-reconnect). При недоступности SSE
   клиент **сам** падает на периодический polling того же снапшота
   (зафиксированный fallback, NFR-2).

Снапшот и клиентский контракт **не зависят** от способа доставки: один и тот
же JSON приходит тремя путями (SSR-инициал, SSE-кадры, fallback-опрос). `bout`
остаётся листом; координацию делает `pool` (владеет проекцией пула+боёв, ADR
0002). **Миграций/изменения PG-схемы нет** — только композиция чтения и
in-memory сигнал.

## Контракты (proto)

> Источник истины API — `/proto`. Меняем только там, потом `make generate`.

- Файл: `proto/hema/v1/pool.proto` (расширяем **`PoolPublicService`** — уже
  публичный, без `RequireAdmin`). `bout.proto` **не трогаем**: горячие
  состояние/счёт боёв `pool` уже получает через порт `BoutConductor.BoutsByPool`
  (спека 0013) и кладёт их в снапшот сам — отдельный публичный bout-RPC не
  нужен.
- Новые RPC в `PoolPublicService`:
  - `rpc GetNominationLive(GetNominationLiveRequest) returns (GetNominationLiveResponse);`
    — unary-снапшот (SSR-инициал + polling-fallback).
  - `rpc WatchNominationLive(WatchNominationLiveRequest) returns (stream WatchNominationLiveResponse);`
    — server-streaming: первый кадр — текущий снапшот, далее по одному кадру на
    каждое изменение номинации.
- Сообщения (переиспользуем существующие `Pool`, `BoardBout`, `FighterRef`,
  `PoolStatus`, `BoutState` — DRY, все уже в `pool.proto`):
  - `NominationLiveSnapshot { string nomination_id = 1; repeated LivePool pools = 2; }`
    — общий payload (вкладывается в обе response-обёртки).
  - `LivePool { Pool pool = 1; repeated BoardBout bouts = 2; string current_bout_id = 3; }`
    — пул (со `status`/`arena_*`/`members`) + его бои (с `state`/`score_*`) +
    текущий бой. `BoardBout` (0013) уже несёт `state`+`score_a`+`score_b` —
    ровно горячие данные боя (FR-1). Исход (победа/ничья) **выводится на
    клиенте** из `state==FINISHED` + сравнения счёта (FR-3, спека) — отдельного
    enum в контракте не заводим.
  - `GetNominationLiveRequest { string nomination_id = 1; }`
  - `GetNominationLiveResponse { NominationLiveSnapshot snapshot = 1; }`
  - `WatchNominationLiveRequest { string nomination_id = 1; }`
  - `WatchNominationLiveResponse { NominationLiveSnapshot snapshot = 1; }`
    — отдельная response-обёртка (buf lint: имя `<Method>Response`), вокруг
    общего `NominationLiveSnapshot`.
- Пустой снапшот (`pools=[]`), пока раскладка `draft` — как `ListPublicPools`
  (FR-12/AC-9): решает сервер.

## Server (модули и слои)

> См. ADR 0002 (модульный монолит) и `server/AGENTS.md`.

- Модуль: **`modules/pool/`** — расширение (новых модулей нет). PG-схема **не
  меняется**, миграций нет.
- Новый инфраструктурный примитив: **`pkg/livebus/`** (переиспользуемый, без
  бизнес-логики — как `pkg/connectutil`): in-process pub/sub по строковому
  топику (`nominationID`).
  - `Bus.Subscribe(topic) (ch <-chan struct{}, cancel func())` — буфер 1,
    неблокирующая отправка (коалесинг всплесков: подписчик всё равно
    перечитывает **последний** снапшот).
  - `Bus.Publish(topic)` — неблокирующий сигнал всем подписчикам топика.
  - Потокобезопасен (mutex + `map[topic]map[*sub]struct{}`); `cancel` снимает
    подписку и чистит пустые топики.
- Слои `pool`:
  - `domain/` — новый порт **`LiveNotifier interface { PublishNominationChanged(nominationID string) }`** (сторона публикации; `service` зависит от него, не от `pkg/livebus`). Тип снапшота — `domain.NominationSnapshot{ NominationID string; Pools []LivePool }`, `LivePool{ Pool; Bouts []BoutRef; CurrentBoutID string }` (переиспользует уже существующие `domain.Pool`/`domain.BoutRef`).
  - `service/` — метод **`NominationLive(ctx, nominationID) (domain.NominationSnapshot, error)`**: если раскладка не `ready` — `{Pools: []}`; иначе по каждому пулу готовой раскладки собирает `LivePool` через уже существующую композицию (`boardForPool`-логику: `GetPool` → `BoutsByPool` → `effectiveCurrentBoutID` + `enrichPools` для `Status`/`ArenaName`/`Members`). Плюс **вызов `notifier.PublishNominationChanged(nominationID)`** в конце каждой мутирующей команды, меняющей публичный снапшот: `SeatPoolOnArena`, `UnseatPool`, `SetCurrentBout`, `StartCurrentBout`, `ScoreCurrentBout`, `FinishCurrentBout`, `ReopenCurrentBout`, `ResetCurrentBout`, `SetStatus` (draft↔ready меняет видимость/бои). Публикуют по `pool.NominationID` (резолвится из `GetPool`, уже загружается в этих методах). Draft-only правки состава (`Assign`/`Unassign`/`AutoDistribute`/…) публичного снапшота не меняют (draft ⇒ пусто) — не публикуют.
  - `api/` — `PublicHandler` получает две новые ручки:
    - `GetNominationLive` — unary, маппит `domain.NominationSnapshot` → proto.
    - `WatchNominationLive` — server-streaming: (1) сразу шлёт текущий снапшот; (2) `ch, cancel := bus.Subscribe(nominationID)`, `defer cancel()`; (3) цикл `select { <-ctx.Done(): return nil; <-ch: перечитать NominationLive → stream.Send }`. Хендлер держит подписчик-сторону шины (`livebus.Bus`), инжектится в `NewPublicHandler`.
  - Маппинг снапшота: новые `toProtoLivePool`/`toProtoNominationSnapshot`, переиспользуют существующие `toProtoPool`/`toProtoBoardBouts`.
- Регистрация/wiring (`internal/platform`):
  - Создать `livebus.New()` в composition root; передать в `pool.Deps` новым полем `LiveBus` (реализует и `LiveNotifier` для `service`, и подписку для `PublicHandler`). `pool.Register` прокидывает его в `service.New(...)` и `api.NewPublicHandler(...)`.
  - Streaming-RPC монтируется на `PoolPublicService` под `baseOpts` (публичный, без `adminOpts`).
- Межмодульные зависимости: без изменений (`pool → bout/arena/nomination` как в
  0013). `bout` остаётся листом; шина — **внутрипроцессная**, доменных событий
  наружу не издаёт.

## Web (FSD + BFF)

> См. ADR 0005 (UI) и ADR 0006 (state), `web/AGENTS.md`.

- BFF (Route Handlers, Node runtime):
  - **`app/api/nominations/[id]/live/route.ts`** — SSE-эндпоинт. Возвращает
    `Response(ReadableStream, { headers: text/event-stream, no-cache,
    no-transform })`. Внутри: `poolPublicClient.watchNominationLive({nominationId}, {signal: req.signal})` (AsyncIterable) → на каждый кадр
    `enqueue("data: " + JSON.stringify(nominationLiveToJson(snapshot)) + "\n\n")`;
    таймер шлёт `: ping\n\n` каждые ~20с (heartbeat через прокси); `req.signal`
    (разрыв клиента) отменяет upstream-поток и таймер (cleanup). `runtime =
    "nodejs"`.
  - **`app/api/nominations/[id]/live-snapshot/route.ts`** — unary для
    polling-fallback: `poolPublicClient.getNominationLive` → JSON того же
    shape, что один SSE-кадр.
  - Сериализация: новый `nominationLiveToJson` в `lib/grpc/serialize.ts`
    (proto→JSON снапшота: нормализация proto3-omitted, enum, вложенные
    `Pool`/`BoardBout`) — по образцу `boutBoardToJson`.
- Слои:
  - `entities/nomination-live/` — `lib/types.ts` (DTO снапшота: `LivePoolDto`
    с `bouts: BoardBoutDto[]` + `currentBoutId`) и `model/get-nomination-live.ts`
    (**server-only** gRPC `getNominationLive` для SSR-инициала, как
    `get-public-bouts.ts`). Хелпер `boutOutcome(state, scoreA, scoreB)` (FR-3).
  - `features/nomination-live/` — `api/use-nomination-live.ts`: клиентский хук
    `useNominationLive(nominationId, initialSnapshot)`. Открывает
    `EventSource('/api/nominations/{id}/live')`, `onmessage` → `setSnapshot`;
    при `typeof EventSource === "undefined"` или серии ошибок ES → закрывает ES
    и падает на `setInterval`-fetch `/live-snapshot` (fallback, NFR-2);
    авто-reconnect ES — нативный (FR-8); cleanup на unmount. Стрим server-state
    ведём кастомным хуком (`useReducer`/`useState`) — **не** TanStack Query
    (RQ не покрывает SSE; ADR 0006 допускает local state).
  - `widgets/nomination-pools-public/` — становится **client**-композицией,
    засеянной SSR-снапшотом и подписанной через хук; рендерит по каждому пулу:
    имя, бейдж исполнительного статуса (`готовится/идёт/завершён`), площадку и
    список боёв — пара, бейдж состояния, **счёт `A:B`**, исход завершённого,
    **подсветку текущего** боя.
- Server components vs client: страница `app/nominations/[id]/page.tsx`
  (server) SSR-загружает инициал (`getNomination` + `getNominationLive`) и
  передаёт снапшот в client-widget; «живость» — на клиенте.
- State: стрим/снапшот → кастомный хук (local state); статус номинации
  (холодный) — как сейчас, SSR + refetch на reconnect.

## События

> Внутрипроцессный **live-broadcaster** — **не** доменные события и **не**
> межмодульная шина (ADR 0011 про event sourcing внутри модуля — иное). Это
> транспортный примитив оповещения проекции для push. Фиксируется отдельным
> **ADR 0012** (`docs/adr/0012-in-process-live-broadcaster.md`): зачем нужен,
> почему не полноценный EDD-bus, допущение одного инстанса монолита, путь
> апгрейда (на внешний pub/sub при масштабировании). Наружу турнирного домена
> ничего не издаётся.

- Издаёт: внутрипроцессный сигнал `nomination-changed` (топик = `nominationID`),
  из мутирующих команд `pool.service`. Потребляет: `WatchNominationLive`-хендлер
  (подписка на топик номинации).

## Тестирование

> См. ADR 0003 (стратегия) и ADR 0009 (TDD-цикл).

- Юнит (`pkg/livebus`): подписка/публикация/коалесинг (буфер 1, всплеск →
  один пенд-сигнал), `cancel` снимает подписку и чистит топик, конкурентные
  publish/subscribe (`-race`).
- Юнит (`pool/service`, fake-репо + fake-notifier + fake-bouts):
  `NominationLive` собирает снапшот (пулы+бои с state/score+current); `draft` →
  пустой; каждая мутирующая команда вызывает `PublishNominationChanged` с
  верным `nominationID` (fake-notifier записывает топики); read-методы — **не**
  публикуют.
- E2E ручек (`pool/api`, httptest + Connect-клиент, fake-репо):
  `GetNominationLive` (unary) отдаёт снапшот; `WatchNominationLive` — первый
  кадр приходит сразу; после вызова мутирующей admin-команды на том же сервере
  приходит второй кадр с обновлённым счётом/состоянием; отмена контекста
  закрывает поток (нет утечки подписки).
- Интеграционные с БД (`pool/integration`, testcontainers): по желанию —
  `GetNominationLive` через реальный Connect × реальный PG на готовой раскладке
  (переиспользует существующий сценарий 0013). Streaming — покрыт e2e без БД.
- Web (Vitest):
  - `nominationLiveToJson` — round-trip proto→JSON (proto3-omitted, enum,
    вложенные `Pool`/`BoardBout`); `pnpm exec tsc --noEmit` для protobuf-моков.
  - `live/route.ts` (e2e): мок connect-стрима (AsyncIterable снапшотов) →
    проверка SSE-фрейминга (`data: …\n\n`), heartbeat, cleanup по `req.signal`.
  - `live-snapshot/route.ts` (e2e): unary → JSON.
  - `use-nomination-live` — фейковый `EventSource`: применяет снапшоты; серия
    ошибок/`undefined EventSource` → переход на polling (мок `fetch`);
    cleanup на unmount.
  - `nomination-pools-public` — рендер state/score/исхода, подсветки текущего,
    исполнительного статуса.

## Риски и открытые вопросы

- **N+1 на композиции снапшота**: `NominationLive` собирает пулы по одному
  (`boardForPool`-путь) — при типичных 1–8 пулах/номинацию приемлемо; при
  необходимости оптимизировать батч-резолвом (как `enrichPools`). Влияет только
  на стоимость чтения, не на контракт.
- **Жизненный цикл потоков (FR-9 «экономия»)**: в этом плане idle-поток
  держится открытым (сигналов нет — трафика нет, дёшево) + heartbeat. Более
  агрессивная экономия (закрывать поток при отсутствии активности и опрашивать
  редко) — возможное улучшение поверх того же клиентского контракта, не блокер.
- **Масштаб/один инстанс**: `pkg/livebus` — внутрипроцессный; при
  горизонтальном масштабировании монолита сигнал не пересечёт инстансы (нужен
  внешний pub/sub). Фиксируется допущением в **ADR 0012**; на текущем single-
  instance деплое корректно.
- **SSE через прокси**: заголовки `no-cache, no-transform` + heartbeat
  снижают риск буферизации; polling-fallback (NFR-2) закрывает остаток.
- **Согласованность после reconnect (NFR-6)**: полный снапшот в каждом кадре и
  первый кадр при (пере)подключении гарантируют актуальность — дельт нет
  специально ради этого.
