# Tasks: Публичное живое отображение номинации, пулов и боёв

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: done
- Дата: 2026-07-27
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах.

## Треки и параллельность

Волна 0 (контракты) — общая. Волна 1 распадается на три дизъюнктных по файлам
трека: **A** (`pkg/livebus` — примитив, ни от чего не зависит), **B** (модуль
`pool` — снапшот/публикация/стриминг, на fake-шине и существующих fake-репо/
кондукторе), **C** (web — SSE/хук/виджет на моках grpc). Волна 2 — join:
wiring `livebus` в composition root + сквозные проверки.

`bout.proto`/модуль `bout` **не трогаем** — горячие состояние/счёт `pool` уже
получает через `BoutConductor.BoutsByPool` (спека 0013). PG-схема не меняется,
миграций нет.

| Волна | Трек | Задачи | Файлы (не пересекаются внутри волны) | Зависит от |
| ----- | ---- | ------ | ------------------------------------- | ---------- |
| 0     | —    | T1     | `proto/hema/v1/pool.proto` (+ generate) | —          |
| 1     | A    | T2     | `server/pkg/livebus/**`               | —          |
| 1     | B    | T3–T6  | `server/modules/pool/**`              | волна 0    |
| 1     | C    | T7–T10 | `web/**`                              | волна 0    |
| 2     | join | T11–T14| `internal/platform/**`, `pool/integration`, статус/индекс | A, B, C смержены |

## Контракты

- [x] T1. `proto/hema/v1/pool.proto` — в **`PoolPublicService`** добавить:
      `rpc GetNominationLive(GetNominationLiveRequest) returns (GetNominationLiveResponse);`
      (unary) и `rpc WatchNominationLive(WatchNominationLiveRequest) returns
      (stream WatchNominationLiveResponse);` (server-streaming). Сообщения:
      `NominationLiveSnapshot{ nomination_id, repeated LivePool pools }`,
      `LivePool{ Pool pool, repeated BoardBout bouts, string current_bout_id }`,
      `GetNominationLiveRequest/Response`, `WatchNominationLiveRequest/Response`
      (своя пара req/resp на каждый RPC — buf lint `RPC_REQUEST_RESPONSE_UNIQUE`;
      обе response-обёртки вкладывают общий `NominationLiveSnapshot`).
      Переиспользовать `Pool`/`BoardBout`/`FighterRef`/`PoolStatus`/`BoutState`
      (без дублей). `bout.proto` — без изменений. `go tool buf lint`;
      `make generate`. _(контракты — не TDD-шаг, идут первыми.)_

## Server — Трек A: `pkg/livebus` (примитив оповещения)

- [x] T2. **`pkg/livebus` (red→green)** — `server/pkg/livebus/livebus_test.go` +
      `livebus.go`: `Bus` с `Subscribe(topic) (<-chan struct{}, func())` и
      `Publish(topic)`; канал подписчика буфер 1, **неблокирующая** отправка;
      `cancel` снимает подписку и удаляет опустевший топик; потокобезопасно
      (mutex). Тесты: подписчик получает сигнал; всплеск публикаций схлопывается
      в один пенд-сигнал (коалесинг); `cancel` больше не доставляет и чистит
      топик; конкурентные publish/subscribe под `go test -race`. Без бизнес-
      логики и payload (ADR 0012, §2).

## Server — Трек B: модуль `pool` (снапшот + публикация + стриминг)

- [x] T3. **domain — порты + типы снапшота** — `pool/domain/domain.go`: порт
      `LiveNotifier interface { PublishNominationChanged(nominationID string) }`
      (сторона публикации, зависит `service`); порт `LiveSubscriber interface
      { SubscribeNomination(nominationID string) (<-chan struct{}, func()) }`
      (сторона подписки, зависит `api`); типы `NominationSnapshot{ NominationID
      string; Pools []LivePool }`, `LivePool{ Pool; Bouts []BoutRef;
      CurrentBoutID string }` (переиспользуют `domain.Pool`/`domain.BoutRef`).
      Компиляционный red — через T5/T6.
- [x] T4. **testutil** — `pool/testutil/fake_live_bus.go`: in-memory реализация
      `LiveNotifier`+`LiveSubscriber` (`var _` обоих) — spy опубликованных
      топиков (для service-теста) + управляемый канал (для api-стриминг-теста,
      чтобы «толкнуть» сигнал).
- [x] T5. **service — снапшот + публикация (red→green)** —
      `pool/service/service_test.go` + `service.go`: метод `NominationLive(ctx,
      nominationID) (domain.NominationSnapshot, error)` — `draft` ⇒ `{Pools:[]}`
      (FR-12/AC-9); `ready` ⇒ по каждому пулу `LivePool` через существующую
      board-композицию (`GetPool`→`BoutsByPool`→`effectiveCurrentBoutID` +
      `enrichPools` для Status/ArenaName/Members). Инжектить `LiveNotifier` в
      `New(...)`; вызвать `PublishNominationChanged(nominationID)` в конце 9
      мутирующих команд: `SeatPoolOnArena`, `UnseatPool`, `SetCurrentBout`,
      `StartCurrentBout`, `ScoreCurrentBout`, `FinishCurrentBout`,
      `ReopenCurrentBout`, `ResetCurrentBout`, `SetStatus`. Тесты: композиция
      снапшота (fake-репо/кондуктор); publish вызван с верным `nominationID` в
      каждой из 9 команд; read-методы (`GetNominationLive`/`GetBoutBoard`/
      `ListPublicPools`) — **не** публикуют.
- [x] T6. **api — unary + streaming (red→green)** — `pool/api/handler_test.go` +
      `handler.go`: `GetNominationLive` (unary → `toProtoNominationSnapshot`/
      `toProtoLivePool`, переиспользуют `toProtoPool`/`toProtoBoardBouts`);
      `WatchNominationLive` (server-streaming: (1) сразу шлёт текущий снапшот;
      (2) `ch, cancel := subscriber.SubscribeNomination(id)`, `defer cancel()`;
      (3) `select { <-ctx.Done(): return nil; <-ch: перечитать NominationLive →
      stream.Send }`). `PublicHandler` получает `LiveSubscriber`; `module.go` —
      добавить `Deps.LiveBus` (тип `pool`-порта, реальный — из platform, T11;
      до этого nil при локальной сборке, как `Deps.Bouts`), прокинуть в
      `service.New` (notifier) и `NewPublicHandler` (subscriber). Тесты
      (httptest + Connect, fake-шина): unary отдаёт снапшот; streaming — первый
      кадр приходит сразу; толчок сигнала через fake-шину → второй кадр с
      обновлённым счётом; отмена контекста завершает поток и снимает подписку
      (нет утечки). Публичный доступ без admin (baseOpts).

## Web — Трек C (на моках grpc)

- [x] T7. **entities + сериализация** — `entities/nomination-live/lib/types.ts`
      (DTO `NominationLiveSnapshotDto`, `LivePoolDto{ pool: PoolDto; bouts:
      BoardBoutDto[]; currentBoutId: string }`, переиспользуют
      `PoolDto`/`BoardBoutDto` из `entities/pool`) + `boutOutcome(state,
      scoreA, scoreB)` (FR-3: A/B/ничья); `entities/nomination-live/model/
      get-nomination-live.ts` (**server-only** gRPC `getNominationLive` для
      SSR-инициала); `lib/grpc/serialize.ts` — `nominationLiveToJson`
      (proto→JSON, нормализация proto3-omitted/enum/вложенных `Pool`/`BoardBout`,
      по образцу `boutBoardToJson`) + `lib/grpc/client.ts` — `poolPublicClient`
      уже есть (регенерён с новыми RPC). Тесты: `boutOutcome`;
      `nominationLiveToJson` round-trip; `pnpm exec tsc --noEmit`.
- [x] T8. **BFF (red→green)** — `app/api/nominations/[id]/live/route.ts` — SSE:
      `Response(ReadableStream, headers text/event-stream + no-cache,no-transform)`;
      внутри `poolPublicClient.watchNominationLive({nominationId},{signal:
      req.signal})` (AsyncIterable) → `data: ${JSON.stringify(nominationLiveToJson
      (snapshot))}\n\n`; heartbeat `: ping\n\n` каждые ~20с; cleanup потока и
      таймера по `req.signal`; `runtime="nodejs"`. И `live-snapshot/route.ts`
      (unary `getNominationLive` → JSON того же shape, для fallback/SSR). Тесты
      `*.test.ts`: мок connect-стрима (AsyncIterable снапшотов) → SSE-фрейминг
      (`data: …\n\n`), heartbeat, cleanup по abort; unary → JSON.
- [x] T9. **feature `nomination-live` (хук)** — `features/nomination-live/api/
      use-nomination-live.ts`: `useNominationLive(nominationId, initialSnapshot)`
      — открывает `EventSource('/api/nominations/{id}/live')`, `onmessage` →
      `setSnapshot`; авто-reconnect ES нативный (FR-8); при `typeof EventSource
      === "undefined"` или серии ошибок ES → закрыть ES, `setInterval`-fetch
      `/live-snapshot` (fallback, NFR-2); cleanup на unmount. Стрим-состояние —
      кастомный хук (`useReducer`/`useState`), не RQ (ADR 0006). Тест: фейковый
      `EventSource` применяет снапшоты; серия ошибок/undefined → переход на
      polling (мок `fetch`); cleanup.
- [x] T10. **widget + page** — `widgets/nomination-pools-public/
      nomination-pools-public.tsx` → **client**-композиция, засеянная
      SSR-снапшотом и подписанная через `useNominationLive`; по каждому пулу:
      имя, бейдж исполнительного статуса (`готовится/идёт/завершён`), площадка,
      бои — пара, бейдж состояния, **счёт `A:B`**, исход завершённого,
      **подсветка текущего** боя. `app/nominations/[id]/page.tsx` (server) —
      SSR `getNomination` + `getNominationLive`, передать снапшот в widget
      (старые `getPublicPools`/`getPublicBouts` для этого экрана вытесняются
      снапшотом — оставить RPC/модели как есть, без удаления). Тест виджета:
      рендер state/счёта/исхода, подсветки текущего, исполнительного статуса.

## Волна 2 — join (после мержа A+B+C)

- [x] T11. **wiring** — `internal/platform/pool_live_bus.go`: адаптер
      `PoolLiveBus` над `*livebus.Bus`, реализует `pool/domain.LiveNotifier`
      (`PublishNominationChanged`→`Publish`) и `pool/domain.LiveSubscriber`
      (`SubscribeNomination`→`Subscribe`); `platform.go`: `bus := livebus.New()`,
      `poolDeps.LiveBus = NewPoolLiveBus(bus)`. Проверить, что интерсепторы
      (recovery/logging) корректно оборачивают server-streaming RPC.
- [x] T12. **integration (testcontainers)** — `pool/integration`: по
      возможности — `GetNominationLive` через реальный Connect × реальный PG на
      готовой раскладке (переиспользует сценарий 0013: посадка + ведение → в
      снапшоте виден счёт/состояние/текущий). Стриминг покрыт e2e без БД (T6).
- [x] T13. **проверка** — `make test-all` зелёный; `pnpm exec tsc --noEmit`
      (менялись protobuf-моки); `go build ./...` + `pnpm build`; ручной прогон:
      открыть публичный `/nominations/[id]`, на арене вести бой из админки →
      счёт/состояние обновляются на публичном экране без перезагрузки.
- [x] T14. **статус/индекс** — обновить статусы `spec.md`/`plan.md`/`tasks.md`
      (→done по мере); строка 0014 в `docs/specs/README.md` (`tasks`→`done`);
      пометки «изменён 0014» у 0011/0013 уже проставлены.

_Задачи адаптированы под фичу: контракты → `pkg/livebus` (независим) ‖ server
`pool` (снизу вверх) ‖ web (на моках) → join (wiring livebus, integration,
verification)._
