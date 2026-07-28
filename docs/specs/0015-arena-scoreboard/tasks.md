# Tasks: Табло арены (arena scoreboard) с таймером боя

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: in progress
- Дата: 2026-07-28
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах.

## Треки и параллельность

Волна 0 (контракты + ADR) — общая. Волна 1 распадается на три дизъюнктных по
файлам трека: **A** (модуль `arena` — персист `default_duration`), **B** (модуль
`pool` — реле-комната/стриминг/команды, на fake-arena-провайдере и существующих
fake-репо/кондукторе), **C** (web — SSE/хуки/ядро таймера/виджет на моках grpc).
Волна 2 — join: wiring в composition root (реле-комната + adapter `arena→pool` +
регистрация RPC под admin), integration `arena`, сквозные проверки.

Доменной логики нет: горячие данные табло = существующий `GetBoutBoard` (0013);
вся таймерная логика — **на клиенте** (`features/arena-timer`), сервер — тупое
реле (не «тикает»). Персист — только колонка `arena.default_duration_seconds`
(миграция у `arena`); у `pool` миграций нет.

| Волна | Трек | Задачи | Файлы (не пересекаются внутри волны) | Зависит от |
| ----- | ---- | ------ | ------------------------------------- | ---------- |
| 0     | —    | T1, T2 | `proto/hema/v1/{arena,pool}.proto` (+generate); `docs/adr/0013-*` | — |
| 1     | A    | T3–T8  | `server/modules/arena/**`             | волна 0    |
| 1     | B    | T9–T12 | `server/modules/pool/**`              | волна 0    |
| 1     | C    | T13–T17| `web/**`                              | волна 0    |
| 2     | join | T18–T21| `internal/platform/**`, `arena/integration`, `README.md`, verification | A, B, C смержены |

## Контракты + ADR (волна 0)

- [x] T1. **proto** — `make generate` после правок:
      - `proto/hema/v1/arena.proto`: в `message Arena` добавить
        `int32 default_duration_seconds = 9;`; в `ArenaAdminService` —
        `rpc SetArenaDefaultDuration(SetArenaDefaultDurationRequest) returns
        (SetArenaDefaultDurationResponse);` с
        `SetArenaDefaultDurationRequest{ string arena_id=1; int32
        default_duration_seconds=2; }` / `...Response{ Arena arena=1; }`.
      - `proto/hema/v1/pool.proto`: в `PoolAdminService` —
        `rpc WatchArenaBoard(WatchArenaBoardRequest) returns (stream
        WatchArenaBoardResponse);`,
        `rpc PublishTimerFrame(PublishTimerFrameRequest) returns
        (PublishTimerFrameResponse);`,
        `rpc ControlArenaTimer(ControlArenaTimerRequest) returns
        (ControlArenaTimerResponse);`,
        `rpc SetScoreboardSides(SetScoreboardSidesRequest) returns
        (SetScoreboardSidesResponse);`. Сообщения/enum: `ScoreboardRole`,
        `TimerStatus`, `TimerCommand{ TimerCommandKind kind; int32 amount_seconds }`
        + `TimerCommandKind`, `TimerFrame{ status, remaining_cs, sampled_unix_ms,
        default_cs }`, `ScoreboardRoom{ scoreboard_count, this_ordinal,
        this_is_source, sides_swapped }`, `ArenaLiveSnapshot{ BoutBoard board;
        TimerFrame timer; ScoreboardRoom room; int32 default_duration_seconds;
        int64 server_now_unix_ms }`, `WatchArenaBoardResponse{ oneof event {
        ArenaLiveSnapshot snapshot=1; TimerCommand command=2; } }`,
        `WatchArenaBoardRequest{ string arena_id=1; ScoreboardRole role=2; }`,
        req/resp на `PublishTimerFrame`/`ControlArenaTimer`/`SetScoreboardSides`
        (своя пара на RPC — buf lint). Переиспользовать `BoutBoard`/`Pool`/
        `BoardBout`/`FighterRef`/`BoutState` (без дублей). `go tool buf lint`.
      _(контракты — не TDD-шаг, идут первыми.)_
- [x] T2. **ADR 0013** — `docs/adr/0013-arena-scoreboard-timer-relay.md`
      (расширяет ADR 0012): решение по транспорту таймера — клиент-№1-авторитет +
      сервер тупое SSE-реле+кеш + синхронизация **полного времени** с easing +
      **отказ от WebRTC** (выигрыш только для followers) + эфемерная реле-комната/
      ordinals/хэндофф + допущение одного инстанса монолита + путь апгрейда. Doc-
      задача, кода нет.

## Server — Трек A: модуль `arena` (персист `default_duration`)

- [ ] T3. **domain (red→green)** — `arena/domain/domain.go` + `domain_test.go`:
      поле `DefaultDurationSeconds int` в `Arena`; валидатор диапазона `1..3600`
      (доменная ошибка при выходе). Тест: валидные/невалидные значения.
- [ ] T4. **service (red→green)** — `arena/service/service_test.go` + `service.go`:
      `SetDefaultDuration(ctx, arenaID, seconds)` — арена существует, **не
      архивна** (иначе доменная ошибка), валидация диапазона, `repo`-обновление,
      вернуть свежую арену. Тесты (fake-репо): успех; архивная → отказ; вне
      диапазона → `InvalidArgument`-эквивалент.
- [ ] T5. **testutil** — `arena/testutil/fake_repo.go`: хранить/обновлять
      `DefaultDurationSeconds` (дефолт 90 у сидов), метод под новый repo-запрос.
- [ ] T6. **repo** — `arena/repo/queries/arena.sql`: `UpdateArenaDefaultDuration`
      (`:one`, `SET default_duration_seconds=$2, updated_at=now() WHERE id=$1
      RETURNING *`); `make sqlc`; `arena/repo/repo.go` — реализация + маппинг
      новой колонки в существующих `Get/List`.
- [ ] T7. **migrations** — `arena/migrations/00002_default_duration.sql` (goose):
      `ALTER TABLE arena.arenas ADD COLUMN default_duration_seconds INTEGER NOT
      NULL DEFAULT 90 CONSTRAINT chk_arenas_default_duration CHECK BETWEEN 1 AND
      3600;` + `-- +goose Down` (DROP COLUMN).
- [ ] T8. **api (red→green)** — `arena/api/handler_test.go` + `handler.go`:
      `SetArenaDefaultDuration` (httptest + Connect, fake-репо) — успех + маппинг
      ошибок (архив→`FailedPrecondition`, диапазон→`InvalidArgument`); `toProtoArena`
      маппит `default_duration_seconds`.

## Server — Трек B: модуль `pool` (реле-комната + стриминг + команды)

- [ ] T9. **domain — порт arena (red→green)** — `pool/domain/domain.go`:
      расширить порт `ArenaProvider` методом `DefaultDurationSeconds(ctx,
      arenaID) (int, error)`. Обновить `pool/testutil/fake_arena_provider.go`
      (или аналог) — вернуть настраиваемый дефолт (90). Компиляционный red — через
      T11/T12.
- [ ] T10. **реле-комната (red→green)** — `pool/service/arena_room.go` +
      `arena_room_test.go`: in-memory `arenaRooms` под mutex; `member{ role;
      ordinal; ch chan any }`; `room{ members; lastFrame *TimerFrame; swapped
      bool }`. Методы: `Join(arenaID, role) (member, snapshotFn)` /
      `Leave(member)` (реиндекс ordinals табло, при пустой комнате — сброс
      `lastFrame`), `PublishFrame(arenaID, from, frame)` (только `from` = ordinal
      1 SCOREBOARD, иначе отказ), `RelayCommand(arenaID, cmd)` (пуш `command`-event
      в каналы всех членов), `SetSwapped(arenaID, bool)`, `SignalBoardChanged
      (arenaID)` (пуш snapshot-триггера). Fan-out — **через `member.ch`**
      (типизированные события: snapshot-триггер | command), не через livebus.
      Тесты: ordinals 1/2/3; выход №1 → реиндекс (бывшее №2 → №1, `is_source`);
      panel без ordinal; пустая комната → `lastFrame` сброшен; `PublishFrame` от
      не-источника → отказ; `RelayCommand` доставляет всем; swap кешируется.
      **Таймерной математики нет** (её ведёт клиент).
- [ ] T11. **service — ArenaLive + сигнал доски (red→green)** —
      `pool/service/service_test.go` + `service.go`: `ArenaLive(ctx, arenaID,
      member) (ArenaLiveSnapshot, error)` — собрать board (`GetBoutBoard`-путь) +
      `room.lastFrame`/`room` + `arena.DefaultDurationSeconds` (порт) +
      `server_now`. Добавить `room.SignalBoardChanged(pool.ArenaID)` в конце
      board-мутирующих команд (`SeatPoolOnArena`, `UnseatPool`, `SetCurrentBout`,
      `StartCurrentBout`, `ScoreCurrentBout`, `FinishCurrentBout`,
      `ReopenCurrentBout`, `ResetCurrentBout`) — рядом с существующей публикацией
      в топик номинации (0014). Тесты: композиция снапшота (fake-arena/кондуктор);
      каждая из 8 команд сигналит комнату верной арены; read-методы — не сигналят.
- [ ] T12. **api — стриминг + команды (red→green)** — `pool/api/handler_test.go`
      + `handler.go`: `WatchArenaBoard` (server-streaming: `Join` → первый
      `snapshot`; цикл `select { <-ctx.Done(): Leave+return; ev := <-member.ch:
      если command → Send command-event; иначе перечитать ArenaLive → Send
      snapshot }`); `PublishTimerFrame` (→ `room.PublishFrame`),
      `ControlArenaTimer` (→ `room.RelayCommand`), `SetScoreboardSides` (→
      `room.SetSwapped`). Все — **под `adminOpts` (RequireAdmin)**. Тесты
      (httptest + Connect, fake-arena/кондуктор): первый `snapshot` сразу;
      `ControlArenaTimer` → приходит `command`-event; `PublishTimerFrame` от №1 →
      `snapshot` с кадром; `StartCurrentBout`/`ScoreCurrentBout` → `snapshot` с
      новой доской; `SetScoreboardSides` → `snapshot` со swap; отмена контекста →
      `Leave`/реиндекс; не-admin → `PermissionDenied` (AC-15).

## Web — Трек C (на моках grpc)

- [ ] T13. **entities + сериализация (red→green)** — `entities/arena` — тип +
      `defaultDurationSeconds`; `entities/arena-live/lib/types.ts` (DTO
      `ArenaLiveSnapshotDto`/`TimerFrameDto`/`ScoreboardRoomDto`, переиспользуют
      `BoutBoardDto` из `entities/bout`); `entities/arena-live/lib/` хелперы
      `boutOutcome` (переиспользовать из `nomination-live`), `nextBout(board)`,
      `boutNumber(board)`; `entities/arena-live/model/get-arena-live.ts`
      (server-only `getBoutBoard` для SSR); `lib/grpc/serialize.ts` —
      `arenaLiveToJson` (`oneof` snapshot/command; переиспользует `boutBoardToJson`).
      Тесты: `boutOutcome`/`nextBout`/`boutNumber`; `arenaLiveToJson` round-trip;
      `pnpm exec tsc --noEmit`.
- [ ] T14. **ядро таймера — чистые функции (red→green)** —
      `features/arena-timer/model/timer-authority.ts` + `*.test.ts`:
      `apply(state, command, now)` (START якорит по `now`/`performance.now`; PAUSE
      фиксирует точный `remaining_cs`; RESET→default/STOPPED; ADJUST ±N клэмп ≥0;
      на 0 → EXPIRED, FR-9), `tick(state, now)` (монотонно), `frameOf(state, now)`,
      `onCurrentBoutChanged(state, default)` (авто-сброс → default+PAUSED, FR-15).
      `features/arena-timer/model/timer-follower.ts` + `*.test.ts`: приём
      `TimerFrame` → easing-коррекция + локальный довод rAF (без скачка на паузе).
      Тесты: PAUSE не «дёргает» (точное значение); клэмп; EXPIRED; авто-сброс;
      follower сглаживает и не прыгает.
- [ ] T15. **BFF-роуты (red→green)** — `app/api/arenas/[id]/`:
      `live/route.ts` (SSE-прокси `watchArenaBoard` `?role=`, event
      `{type:"snapshot"|"command",...}`, heartbeat, cleanup по `req.signal`,
      admin-токен, `runtime="nodejs"`; образец — `nominations/[id]/live`),
      `timer-frame/route.ts` (POST→`publishTimerFrame`),
      `timer/route.ts` (POST→`controlArenaTimer`),
      `scoreboard-sides/route.ts` (POST→`setScoreboardSides`);
      `app/api/admin/arenas/[id]/default-duration/route.ts` (PUT→
      `setArenaDefaultDuration`). Тесты `*.test.ts` (мок connect/grpc): SSE-фрейминг
      обоих event + heartbeat + cleanup; проброс команд в gRPC; маппинг
      `connect.Code`→HTTP.
- [ ] T16. **хуки (red→green)** — `features/arena-live/api/use-arena-live.ts`
      (`EventSource('/api/arenas/{id}/live?role=...')`, применяет `snapshot`/
      `command`, `serverOffset = server_now − Date.now()`, fallback polling
      `/board`, авто-reconnect; local state, не RQ) + `features/arena-timer/api/
      use-arena-timer.ts` (если `room.is_source` — гоняет `timer-authority` по rAF,
      применяет `command`-event, публикует кадры `/timer-frame` ~200мс пока RUNNING
      + на переходах; иначе — follower через `timer-follower`). Тесты: фейковый
      `EventSource` (snapshot/command); роль source vs follower; source публикует
      кадры (мок fetch); fallback на polling.
- [ ] T17. **виджет + страница + панель (red→green)** —
      `features/arena-timer/ui/TimerDisplay.tsx` (сотые, подсветка `<5.00` FR-19,
      сигнал на 0) + `TimerControls.tsx` (старт/пауза/сброс/`±1·2·3·5`, инпут
      дефолта, кнопка swap); `widgets/arena-scoreboard/arena-scoreboard.tsx`
      (client, засеян SSR, `useArenaLive(scoreboard)`+`useArenaTimer`: шапка
      арена/пул/«Бой N из M», синий/красный с `sides_swapped` (счёт у A/B — FR-6),
      `TimerDisplay`, следующая пара / «последний бой», оглашение победителя при
      `FINISHED` до смены боя (FR-14), «ожидание» при пустой доске FR-5, read-only
      FR-17); `app/(admin)/admin/arenas/[id]/scoreboard/page.tsx` (server, SSR
      `getArena`+`getBoutBoard`, полноэкранный `layout.tsx` сегмента без хрома);
      панель — на `app/(admin)/admin/arenas/[id]/page.tsx` / в `features/bout-board`
      добавить `TimerControls` (`role=panel`), кнопку **«Открыть табло»** (`Link`).
      Тесты виджета: синий/красный со swap (счёт у своих); следующая пара /
      «последний бой»; оглашение победы/ничьей; «ожидание»; подсветка `<5 c`.

## Волна 2 — join (после мержа A+B+C)

- [ ] T18. **wiring** — `internal/platform`: создать `arenaRooms` (из `pool`) в
      composition root, прокинуть в `pool` service/handler; адаптер
      `ArenaProvider` над модулем `arena` расширить `DefaultDurationSeconds`
      (вызывает `arena`-сервис/чтение); зарегистрировать `WatchArenaBoard`/
      `PublishTimerFrame`/`ControlArenaTimer`/`SetScoreboardSides` под `adminOpts`
      и `SetArenaDefaultDuration` в `arena`. Проверить, что интерсепторы
      (recovery/logging) корректно оборачивают server-streaming RPC.
- [ ] T19. **integration (testcontainers)** — `arena/integration`: миграция
      `00002` применяется; `default_duration_seconds` пишется/читается через
      реальный Connect × реальный PG (дефолт 90; `SetArenaDefaultDuration`
      меняет). (`pool`-стриминг покрыт e2e без БД, T12.)
- [ ] T20. **проверка** — `make test-all` зелёный; `pnpm exec tsc --noEmit`
      (менялись protobuf-моки); `go build ./...` + `pnpm build`; ручной прогон:
      открыть `/admin/arenas/[id]/scoreboard` на одном экране и панель арены на
      другом → счёт/состояние обновляются на табло; таймер: старт/пауза/±/сброс с
      панели идут синхронно, сотые плавные, на паузе нет скачка; смена текущего
      боя сбрасывает таймер; завершение боя показывает победителя; подсветка `<5c`.
- [ ] T21. **статус/индекс** — обновить статусы `spec.md`/`plan.md`/`tasks.md`
      (→done по мере); строка 0015 в `docs/specs/README.md` (`plan`→`tasks`→`done`);
      проставить пометки «изменён 0015» у 0008 (колонка `default_duration` +
      admin-табло), 0013 (таймер/swap на панель), 0014 (переиспользован паттерн
      живого канала).

_Задачи адаптированы под фичу: контракты+ADR → `arena` (персист, снизу вверх) ‖
`pool` (реле-комната/стриминг, на fake-arena) ‖ web (ядро таймера на клиенте, на
моках) → join (wiring реле-комнаты + adapter arena→pool, integration, verification)._
