# Plan: Редизайн живого UI площадки — табло, панель секретаря, страница арены

> Артефакт SDD (ADR 0008). Описывает **КАК** реализуем `spec.md` в архитектуре
> проекта. Заполняется только когда в `spec.md` нет открытых
> `[NEEDS CLARIFICATION]`.

- Статус: draft
- Дата: 2026-08-15
- Спека: `./spec.md`

## Обзор решения

Инкремент состоит из четырёх слабо связанных кусков, и только один из них
трогает сервер.

1. **Композиция страницы площадки.** Четыре карточки в колонку
   (`arenas/[id]/page.tsx`) заменяются виджетом `widgets/arena-console/` с
   двумя видами — управление и панель секретаря. Вид выбирается
   query-параметром `?mode=bout` на том же пути (spec FR-1). Виджет —
   единственный владелец живого канала арены на странице: `useArenaLive`
   вызывается **один раз** в корне и раздаёт доску/таймер/комнату обоим
   видам пропсами. Это же чинит spec-проблему №2 — `useBoutBoard` как
   источник доски со страницы уходит (хук остаётся для инвалидации мутаций).
2. **Состояние связи.** `useArenaLive` перестаёт молча падать на polling и
   отдаёт `connection` (`live`/`lost` + `lostSinceMs`) и `reconnect()`.
   Поверх него — полоса потери связи, гейт необратимых действий и удержание
   счёта (spec FR-23…FR-27).
3. **Табло.** `widgets/arena-scoreboard/` перестраивается: полоса таймера
   наверх на 40% высоты, пять фаз вместо двух с половиной, локальный
   тумблер оформления. Фаза — чистая функция в `entities/arena-live/lib/`.
4. **Журнал боёв площадки** — единственная серверная часть. Данные уже
   лежат в `bout.bout_events` с 0013 (ADR 0011) и не отдаются наружу ни
   одним RPC. Добавляется чтение: порт `BoutConductor` (stage → bout)
   получает метод выборки событий по пулам, `stage` — RPC `GetArenaJournal`
   рядом с `GetBoutBoard`, имена авторов обогащаются на чтении приёмом
   0025 (`UserProvider.DisplayNames`). **Новых миграций нет** — ни одной
   таблицы и ни одной колонки эта спека не добавляет.

Направление зависимостей не меняется: `stage → bout` остаётся
односторонним, `bout` остаётся листом.

## Контракты (proto)

> Источник истины API — `/proto`. Меняем только там, потом `make generate`.

- Файл: `proto/hema/v1/stage.proto`
- Сервис: `StageAdminService` (существующий, admin-only) — новый RPC рядом с
  `GetBoutBoard`, потому что адресация журнала — **арена**, а связь
  «арена → пул» знает модуль `stage`, а не `bout`. Класть RPC в
  `BoutAdminService` значило бы заставить клиента делать два вызова и
  самому резолвить пул.

```proto
// GetArenaJournal — журнал боёв пула, стоящего на площадке (спека 0033,
// FR-33). Читает существующий event-sourced журнал боя (0013, ADR 0011),
// который до сих пор не отдавался наружу ни одним RPC. Новой
// персистентности не вводит.
rpc GetArenaJournal(GetArenaJournalRequest) returns (GetArenaJournalResponse);

message GetArenaJournalRequest {
  string arena_id = 1;
  // limit — сколько последних записей вернуть; 0 = дефолт сервера (50).
  int32 limit = 2;
}

message GetArenaJournalResponse {
  // entries — новыми событиями вперёд (сервер сортирует, клиент не
  // пересортировывает).
  repeated BoutJournalEntry entries = 1;
}

// BoutEventKind — вид записи журнала. `scheduled` наружу не отдаётся:
// формирование пар — системное действие без человека-автора (спека 0010),
// и в журнале площадки ему не место (spec FR-34/FR-36).
enum BoutEventKind {
  BOUT_EVENT_KIND_UNSPECIFIED = 0;
  BOUT_EVENT_KIND_STARTED     = 1;
  BOUT_EVENT_KIND_SCORED      = 2;
  BOUT_EVENT_KIND_FINISHED    = 3;
  BOUT_EVENT_KIND_REOPENED    = 4;
  BOUT_EVENT_KIND_RESET       = 5;
}

message BoutJournalEntry {
  string bout_id = 1;
  // sequence_number — номер боя в контейнере (спека 0010), «бой 7».
  int32 sequence_number = 2;
  FighterRef fighter_a = 3;
  FighterRef fighter_b = 4;
  BoutEventKind kind = 5;
  // score_a/score_b — значимы для SCORED и FINISHED (снапшот итога).
  int32 score_a = 6;
  int32 score_b = 7;
  google.protobuf.Timestamp occurred_at = 8;
  // actor_display_name — имя того, кто вызвал событие (обогащение на
  // чтении, приём спеки 0025). Пусто, если пользователь удалён.
  string actor_display_name = 9;
}
```

`FighterRef` и `google.protobuf.Timestamp` в `stage.proto` уже есть — новых
импортов не нужно.

## Server (модули и слои)

> См. ADR 0002 (модульный монолит) и `server/AGENTS.md`.

### Модуль `bout` — расширение чтения (миграций нет)

- `domain/domain.go`:
  - новый тип `EventRecord` — плоская запись журнала для чтения наружу:
    `BoutID`, `PoolID`, `SequenceNumber`, `FighterA`, `FighterB
    (FighterRef)`, `Type EventType`, `ScoreA`, `ScoreB`, `ActorID`,
    `OccurredAt`. Это read-model, а не агрегат: свёртки не требует, из
    журнала читается как есть;
  - порт `Repository` дополняется
    `EventsForPools(ctx, poolIDs []string, limit int) ([]EventRecord, error)`.
- `repo/queries/bout.sql` — `-- name: EventsForPools :many`: `bout_events`
  join `bouts` по `bout_id`, фильтр `bouts.pool_id = ANY($1)` и
  `event_type <> 'scheduled'`, сортировка `occurred_at DESC, version DESC`,
  `LIMIT $2`. Индекс `idx_bout_events_bout (bout_id, version)` для этого
  паттерна не подходит (доступ идёт от пулов) — но объём заведомо мал
  (журнал одного пула — десятки-сотни строк), поэтому **новый индекс не
  заводится**; при появлении медленного плана это правка миграции, а не
  решение этой спеки. `make sqlc`.
- `service/service.go` — `ListEventsForPools(ctx, poolIDs, limit)`:
  прокси к репо с клэмпом лимита (0 → 50, максимум 200) и защитой от
  пустого списка пулов (no-op → пустой срез, как `AnyStartedInPools`).
- `api/` — **не меняется**: наружу этот метод идёт не своим RPC, а через
  порт в `stage` (см. ниже). `BoutAdminService`/`BoutPublicService` без
  изменений.
- `testutil/fake_repo.go` — реализация `EventsForPools` в in-memory
  фейке (журнал уже хранится фейком для команд ЖЦ).
- `migrations/` — **пусто**. Таблица `bout.bout_events` (миграция 00002,
  спека 0013) уже содержит всё нужное: `event_type`, `payload` (jsonb со
  `score_a`/`score_b`), `actor_id`, `occurred_at`, `version`.

### Модуль `stage` — новый RPC + порт имён

- `domain/domain.go`:
  - порт `BoutConductor` дополняется
    `EventsForPools(ctx, poolIDs []string, limit int) ([]BoutEventRecord, error)`
    и собственным типом `BoutEventRecord` (модуль не импортирует типы
    `bout` — граница ADR 0002; адаптер в `internal/platform` перекладывает);
  - новый порт `UserProvider` с `DisplayNames(ctx, ids []string)
    (map[string]string, error)` — дословно как в
    `modules/application/domain/domain.go:391` (приём 0025). Реализация уже
    существует и переиспользуется: `modules/auth/display_name_provider.go`.
- `service/service.go`:
  - конструктор `New(...)` получает седьмой аргумент `users
    domain.UserProvider` (правка всех вызовов: `internal/platform` и
    `service_test.go`);
  - `GetArenaJournal(ctx, arenaID string, limit int) ([]JournalEntry, error)`:
    резолв пула на арене (существующий путь `GetBoutBoard`) → если пула нет,
    пустой журнал без ошибки (spec AC-20 — площадка свободна) → 
    `bouts.EventsForPools([]string{poolID}, limit)` → батч
    `users.DisplayNames` по дедуплицированным непустым `ActorID` →
    склейка. Порядок сервер задаёт сам (новые вперёд), клиент не
    пересортировывает.
- `api/handler.go` — маппинг `JournalEntry` → `BoutJournalEntry`,
  `domain.EventType` → `BoutEventKind`; ошибки как у соседних чтений
  (`ErrNotFound` → `CodeNotFound`, `ErrInvalidInput` → `CodeInvalidArgument`).
- `testutil/` — `FakeBoutConductor` дополняется `EventsForPools`; новый
  `FakeUserProvider` (копия приёма
  `modules/application/testutil/fake_user_provider.go`).
- `migrations/` — **пусто**.
- Межмодульные зависимости: `stage → bout` (существующая, расширяется
  методом), `stage → auth` через `UserProvider` (**новая для stage**;
  такая же уже есть у `application`, адаптер общий).

### Wiring

- `internal/platform`: адаптер `BoutConductor` дополняется
  `EventsForPools` (перекладка `bout/domain.EventRecord` →
  `stage/domain.BoutEventRecord`); в конструктор `stage.Service`
  прокидывается `auth.NewDisplayNameProvider(authSvc)` — тот же объект, что
  уже отдаётся модулю `application`.

## Web (FSD + BFF)

> См. ADR 0005 (UI) и ADR 0006 (state), `web/AGENTS.md`.

### BFF

- `app/api/arenas/[id]/journal/route.ts` — `GET`, Node runtime, admin-only
  по образцу соседнего `app/api/arenas/[id]/board/route.ts`; проксирует
  `GetArenaJournal`, сериализует `toJson`. Тест — `route.test.ts` (мок
  транспорта) + `.e2e.test.ts` по правилу ADR 0010 (`Timestamp` в ответе —
  ровно тот случай, ради которого e2e-суффикс заведён).

### entities

- `entities/arena-live/lib/journal.ts` (новый) — DTO `JournalEntryDto` +
  **чистые** `journalEntryText(entry): string` («бой 7 завершён · Ильин
  2 : 5 Дерюгин») и `journalEntryTime(entry): string`. Тестируется целиком.
- `entities/arena-live/lib/connection.ts` (новый) — чистые
  `connectionLabel(lostForMs): string` («Связь потеряна · 12 секунд») и
  `isOffline(state)`. Без React.
- `entities/arena-live/lib/scoreboard-phase.ts` (новый) — чистая
  `scoreboardPhase({ board, displayedBout, timer }): "idle" | "waiting" |
  "running" | "endgame" | "expired" | "announced"` (spec FR-29). Вся
  логика решения о виде табло уходит сюда — виджет только рисует. Порог
  концовки (< 5.00 c) переезжает из `TimerDisplay` в эту функцию.
- `entities/arena-live/lib/types.ts` — без изменений (DTO живого канала
  уже полные).

### shared

- `shared/hooks/use-local-preference.ts` (новый) — типизированное чтение/
  запись одного значения в `localStorage` с SSR-безопасным дефолтом.
  Потребитель — тумблер оформления табло (spec FR-31, ключ
  `scoreboard-appearance:<arenaId>`). Общий, без доменного смысла →
  `shared`, не `features`.

### features

- `features/arena-live/api/use-arena-live.ts` — **правится**:
  - в возвращаемый тип добавляются `connection: "live" | "lost"`,
    `lostSinceMs: number | null`, `reconnect(): void`;
  - `lost` выставляется по достижении `SSE_ERROR_THRESHOLD` (сейчас в этот
    момент происходит молчаливый `fallbackToPolling`) и снимается на первом
    успешном кадре — падение на polling остаётся как есть, меняется только
    его видимость;
  - `reconnect()` закрывает polling и пересоздаёт `EventSource`.
  - Роль подписчика **не меняется**: консоль площадки подписывается как
    `role="panel"` (как сегодня `TimerControls`), поэтому комната табло и
    выбор авторитета таймера не затрагиваются (spec NFR-3, AC-21).
- `features/bout-board/model/pending-score.ts` (новый) — **чистая** модель
  удержания счёта в офлайне (spec FR-26): `applyPendingStep(state, side,
  delta)`, `pendingScore(state)`, `clearPending(state)`. Схлопывание в одно
  абсолютное значение живёт здесь и тестируется без React.
- `features/bout-board/model/score-undo.ts` (новый) — чистая память
  предыдущего абсолютного счёта для «Отменить <шаг>» (spec FR-19):
  `pushStep`, `undoLabel`, `undoTarget`, сброс при смене боя.
- `features/bout-board/ui/bout-board.tsx` — **удаляется**. Его содержимое
  расходится по двум видам виджета консоли; ручной ввод счёта и кнопка
  «Задать» уходят вместе с ним (spec FR-7).
- `features/pool-seating/ui/pool-seating.tsx` — переписывается под
  карточки макета 16b с фильтром по номинации (spec FR-12…FR-14).
  `api/` фичи не меняется.
- `features/arena-timer/ui/TimerControls.tsx` — переписывается в колонку
  таймера панели (spec FR-17); `model/timer-authority.ts`,
  `model/timer-follower.ts`, `api/use-arena-timer.ts` **не трогаются** —
  протокол таймера (ADR 0013) остаётся как есть.
- `features/arena-timer/ui/TimerDisplay.tsx` — правится: `size` получает
  третий вариант, решение «концовка/истекло» уезжает в
  `scoreboard-phase.ts`, компонент становится чисто презентационным.
- `features/arena-journal/` (новый срез): `api/{keys,requests,use-arena-journal}.ts`
  + `ui/arena-journal.tsx`. Хук — `useQuery` с той же инвалидацией, что и
  доска (мутации боя), плюс обновление по кадру живого канала.

### widgets

- `widgets/arena-console/` (новый) — композиция страницы площадки:
  - `arena-console.tsx` — корень (client): один `useArenaLive`, чтение
    `?mode` через `useSearchParams`, переключение через
    `router.replace`/`push` (push — чтобы «назад» работал, spec FR-3),
    обработчик `Esc`, гейт офлайна, полоса связи;
  - `management-view.tsx` — вид управления (16a/16b);
  - `bout-panel-view.tsx` — панель секретаря (2d/2e);
  - `mode-switch.tsx` — переключатель режимов;
  - `connection-bar.tsx` — полоса потери связи.
  Виджет, а не фича: композиция четырёх фич
  (`pool-seating`/`bout-board`/`arena-timer`/`arena-journal`) — фича не
  может импортировать фичу (`web/AGENTS.md`, правило 6). Прецедент —
  `widgets/nomination-schema/` (0031).
- `widgets/arena-scoreboard/arena-scoreboard.tsx` — перестраивается под
  макет: полоса таймера сверху (~40% высоты), цветной раскол ниже, нижняя
  полоса «Далее». Пять фаз рисуются по `scoreboardPhase`. Добавляется
  `appearance-toggle.tsx` (локальный тумблер, `use-local-preference`).
  Правило 0015 (табло вне дизайн-системы) сохраняется: цвета остаются
  захардкоженными, `next-themes` табло по-прежнему не читает — тумблер
  переключает **собственную** пару палитр.

### Роуты

- `app/(admin)/admin/arenas/[id]/page.tsx` — server component: `getArena` +
  SSR-доска (`getArenaLiveBoard`, как уже делает страница табло, чтобы
  консоль не мигала пустотой) → `<ArenaConsole …/>`. `AdminHeader`
  заменяется на `PageHeader` (правило `web/AGENTS.md` для экранов 0025+),
  рендерит его сам виджет.
- `app/(admin)/admin/arenas/[id]/scoreboard/page.tsx` — без изменений
  (передаёт те же пропсы).
- Новых роутов нет: режим — query-параметр (spec FR-1).

### Server components vs client

Обе страницы остаются server components-обёртками над клиентскими
виджетами: живой канал, таймер и `localStorage` требуют браузера.

### State

- server state (доска, журнал) → TanStack Query + живой канал 0015;
- эфемерное состояние связи, режима, удержанного счёта и отмены →
  `useState`/`useReducer` внутри виджета поверх чистых моделей из
  `features/bout-board/model/*`. Zustand не нужен: всё состояние живёт в
  одном поддереве.

## События

> Placeholder. Event-Driven Design ещё не введён (ADR появится с первой
> событийной фичей).

- Издаёт: нет. Журнал боя — существующий event-sourced поток внутри
  агрегата (ADR 0011), а не межмодульное событие; эта спека только **читает**
  его.
- Потребляет: нет.

## Тестирование

> См. ADR 0003 (стратегия) и ADR 0009 (TDD-цикл).

### Server

- Юнит `bout/service` с fake-репо: клэмп лимита (0 → 50, > 200 → 200),
  пустой список пулов → пустой срез без обращения к репо, исключение
  `scheduled`.
- Юнит `stage/service` с фейками `BoutConductor`/`UserProvider`: пустая
  арена → пустой журнал без ошибки (AC-20); дедупликация id при батче имён;
  событие с пустым `ActorID` → пустое имя без падения; удалённый
  пользователь (нет в карте) → пустое имя.
- E2E ручки `stage/api` (httptest + Connect, фейки): счастливый путь +
  маппинг ошибок в `connect.Code`.
- Интеграционный с БД (`modules/bout/integration/`): запись событий
  командами ЖЦ → `EventsForPools` отдаёт их в ожидаемом порядке и без
  `scheduled`. Это единственное место, где проверяется реальный SQL.

### Web (Vitest)

- Чистые функции — по одному файлу тестов на каждую:
  `journalEntryText` (все пять видов + счёт), `connectionLabel`
  (секунды/минуты), `scoreboardPhase` (шесть исходов, включая границу
  «концовка ↔ истекло» и удержание оглашения), `pending-score`
  (схлопывание нескольких шагов в одно значение — AC-13), `score-undo`
  (метка шага, сброс при смене боя — AC-8).
- BFF `route.test.ts` + `route.e2e.test.ts` для журнала (ADR 0010).
- Компонентные (Testing Library): переключатель режимов меняет
  query-параметр и не размонтирует канал (AC-1/AC-2); неактивный вход без
  пула (AC-3); полоса связи и гейт необратимых действий (AC-11/AC-12);
  фильтр номинаций и пустое состояние постановки (AC-6/AC-7); фазы табло
  (AC-14…AC-17); тумблер оформления и его сохранение (AC-18); журнал и его
  пустое состояние (AC-19/AC-20).
- Скриншотных тестов нет (ADR 0003).

### Ручная проверка

Смоук на `make demo-bouts`: переход в панель посреди идущего боя
(проверить, что таймер не сбросился и `scoreboardCount` не изменился —
AC-1/AC-21), обрыв сети в devtools (AC-11…AC-13), табло на втором окне в
пяти фазах. В прошлых спеках редизайна (0026/0027/0030/0031) headless-браузера
в среде реализации не было — если его нет и здесь, зафиксировать в
`tasks.md`, что именно проверено функционально, а что осталось на
автотестах, вместо того чтобы отчитаться о непроведённых кликах.

## Риски и открытые вопросы

- **Смена сигнатуры `stage.service.New`** (седьмой аргумент `users`)
  задевает `internal/platform` и все конструкции в `service_test.go`
  модуля `stage` — файл большой. Правка механическая, но шумная в диффе;
  это цена приёма 0025 и она принимается сознательно.
- **`?mode=bout` и Next.js App Router.** `router.push` с изменением только
  query-параметра на том же сегменте не размонтирует поддерево — на этом
  держится FR-2 (живой канал переживает переход). Это надо **проверить
  тестом**, а не принять на веру: если в текущей версии Next поведение
  иное, запасной вариант — держать режим в `useState`, а историю
  синхронизировать через `history.pushState` + `popstate` вручную (тогда
  FR-1 выполняется, FR-3 тоже, а гарантия FR-2 становится безусловной).
- **Порядок журнала при одинаковом `occurred_at`.** Внутри одного боя
  порядок доопределяется `version DESC`, но события **разных** боёв с
  совпадающей меткой времени лягут в произвольном порядке. Практически
  недостижимо (события порождаются кликами человека), но при появлении
  дублей — стабилизировать `(occurred_at, bout_id, version)`.
- **Удержание счёта в офлайне и оптимистичный показ.** Пока связь
  потеряна, экран показывает локальное значение, а сервер — старое. Если
  вкладку закрыть до восстановления связи, удержанное значение потеряется.
  Спека этого не запрещает (FR-26 обещает досылку, а не персистентность),
  но предупреждение на полосе связи должно быть недвусмысленным.
- **Конфликт версии при досылке.** Досылка идёт абсолютным значением
  (`ScoreCurrentBout`), и если за время офлайна счёт правил кто-то другой,
  досылка его перезапишет. Это поведение самой команды с 0013 («абсолютная
  установка», решение №7), а не новая проблема; в UI оно должно быть
  честно названо, а не замаскировано словом «синхронизация».
- **Плотность панели на 1280×800.** Макет 2d нарисован ровно под эту
  высоту с точностью до пикселей (82 + 56 + 64 + 58 + 52 + 54 + 78).
  Портирование в токены и `rem` неизбежно даст другую сумму — вертикальную
  посадку надо будет подбирать, а не транскрибировать.
