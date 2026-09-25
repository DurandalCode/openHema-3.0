# Plan: Общее оглашение результата и надёжные команды арены

- Статус: draft
- Дата: 2026-09-25
- Спека: [spec.md](./spec.md)

## Обзор решения

Предложение для согласования: `stage.pools.current_bout_id` становится
персистентным указателем выбранной/объявленной пары. `FinishCurrentBout`
сохраняет его, а `RevealCurrentBout` явно продвигает к следующему
непроведённому бою. Отдельного клиентского удержания и второго указателя
показа не требуется. Номер, следующая пара и фаза вычисляются от одного
снимка, включая первое чтение после перезапуска сервера.

B02 начинается с воспроизведения управляемыми задержками. Предлагаемая
защита — последовательная клиентская очередь + ожидание всех подтверждений
перед finish + ожидаемый ID/версия на сервере. Единый механизм команд боя
также служит основанием последующих технических исходов и сходов: этим
трекам не следует создавать собственный слой идемпотентности.

## Подтверждённое текущее устройство

- `stage/service/service.go:FinishCurrentBout` записывает событие через
  BoutConductor, синхронизирует сетку, затем передвигает указатель.
- `stage/service/arena_room.go:RevealCurrentBout` сейчас меняет только
  эфемерный `revealGeneration`. Комната исчезает после ухода всех клиентов.
- `arena-scoreboard.tsx` локально удерживает бой; `bout-panel-view.tsx`
  использует серверный current и автоматически уходит после последнего боя.
- `bout/service/service.go:act` уже использует event sourcing и optimistic
  append, но автоматически повторяет решение после конфликта версии.
  Клиентская ожидаемая версия и ID команды пока отсутствуют.
- `bout.bout_events` — фактическое имя журнала; `bout.bouts.version`
  существует. Новый общий event store не нужен.

## Контракты (proto): явная миграция управления арены на v2

**D-API (на согласование):** обязательный context в существующем v1 RPC
был бы breaking change независимо от наличия внешних клиентов. Поэтому
вводится отдельный `hema.v2.ArenaControlService` в
`proto/hema/v2/arena_control.proto`, с Go package
`github.com/hema/server/gen/hema/v2;hemav2`. Контракт начинается здесь,
затем `make generate`; runtime-изменения до контракта не выполняются.

В `proto/hema/v1/stage.proto` допустимы только additive read-поля:
`BoardBout.version` (10, int32), `BoutBoard.selection_revision` (4, int64),
`TimerFrame`/`TimerCommand.bout_id` и `selection_revision`. DTO чтения
переиспользуются v2-ответами через import v1, без копии всей модели этапа.
JSON int64 — строка, не неточный JS number. Старые request-поля не
переопределяются, новые обязательные поля туда не добавляются.
`ScoreboardRoom.reveal_generation` остаётся на wire, deprecated; новый UI
от него не зависит.

### Новый сервис

Все RPC требуют admin, включая stream и публикацию кадров. Каждый RPC
имеет собственные Request/Response, соблюдая buf naming; таблица задаёт
их содержимое, не предлагает переиспользовать одну request-структуру.

| RPC v2 | Запрос | Ответ |
| --- | --- | --- |
| `ApplyBoutCommand` | `ArenaSelectionContext selection`, `BoutCommandContext command`, `oneof action { StartBout start; ScoreBout score; FinishBout finish; ReopenBout reopen; ResetBout reset; }`; ScoreBout содержит абсолютные score_a/score_b | `hema.v1.BoutBoard board`, int32 applied_bout_version |
| `SelectBout` | selection ожидаемой текущей пары, string target_bout_id | `hema.v1.ArenaLiveSnapshot snapshot` |
| `RevealNextBout` | selection оглашаемой пары | `hema.v1.ArenaLiveSnapshot snapshot` |
| `ControlTimer` | selection, `hema.v1.TimerCommand command` | `hema.v1.ArenaLiveSnapshot snapshot` |
| `PublishTimerFrame` | selection, `hema.v1.TimerFrame frame` | `hema.v1.ArenaLiveSnapshot snapshot` |
| `SetScoreboardSides` | selection, bool swapped | `hema.v1.ArenaLiveSnapshot snapshot` |
| `WatchArenaBoard` | string arena_id, `hema.v1.ScoreboardRole role` | stream: oneof snapshot/command с v1 read DTO |

`ArenaSelectionContext`: arena_id, pool_id, bout_id,
int64 expected_selection_revision. `BoutCommandContext`: UUID command_id,
int32 expected_version. Идентичность команды включает bout_id из selection,
но сама bout-команда не зависит от аренного selection guard. Это позволяет
0056/0058 использовать тот же внутренний bout command foundation; каскад
0056 не обязан делать нетекущий бой выбранным на арене.

Mismatch пары/ревизии/версии → `Aborted` (HTTP 409), неверный UUID/oneof/счёт →
`InvalidArgument`. Ожидаемая версия потока >0, selection revision может быть
0. Для пустой арены timer/sides context содержит пустые pool_id/bout_id
и revision=0; сервер проверяет фактическое отсутствие посаженного пула.
Проведение боя без пула запрещено, но существующая возможность управлять
таймером пустой арены сохраняется. Для SelectBout из старого завершённого
пула без указателя ожидаемый bout_id пуст, а target задан явно.
Новый UI применяет snapshot от Select/Reveal немедленно в cache, затем SSE
обновляет другие экраны. Кадры/команды чужой пары не принимаются и не
меняют авторитет времени: сервер по-прежнему лишь реле. Поля адресации
в frame/command обязаны совпадать с selection; иначе InvalidArgument.

### Cutover и старые вкладки

Это **запланированная миграция версии с прекращением старых write RPC**, а
не заявление об обратной совместимости. Во время подготовки старый релиз
продолжает работать как сейчас. Гарантии 0052 действуют после cutover;
периода одновременной записи через небезопасный v1 и guarded v2 нет.

1. В согласованную паузу проведения боя остановить старый server/BFF,
   применить миграции и запустить новый server/BFF согласованной версии.
   Результаты из PG сохраняются; эфемерный таймер может сброситься, поэтому
   бесшовное обновление посреди идущего боя не обещается.
2. В новом сервере v1 `Start/Score/Finish/Reopen/ResetCurrentBout`,
   `SetCurrentBout`, `RevealCurrentBout`, `ControlArenaTimer`,
   `PublishTimerFrame`, `SetScoreboardSides`, `WatchArenaBoard` всегда
   возвращают `FailedPrecondition` с кодом причины `ARENA_API_V1_RETIRED`
   и текстом «Обновите страницу для продолжения». Они не вызывают service,
   не пишут события и не подключаются к комнате. Прямой старый Connect
   клиент не обходит запрет через BFF. Остальные v1 read/management API
   сохраняются; mutating management продолжает проходить stage guard.
3. Старые BFF routes проведения/управления и старый `/api/arenas/[id]/live`
   возвращают HTTP 410 + тот же текст. Никакого fallback нового клиента на
   старую запись. Старый EventSource может повторять connect, но сервер
   не назначает ему роль источника. Пользователь обновляет все панели и
   табло; обещать, что уже закешированный старый JS сам корректно обработает
   новый код, нельзя. Памятка релиза требует reload всех окон.
4. Новые endpoints: `/api/v2/arenas/[id]/bout-command`, `/selection`,
   `/reveal-bout`, `/timer`, `/timer-frame`, `/scoreboard-sides`, `/live`.
   Старый GET `/api/arenas/[id]/board` остаётся read-only fallback.
   Guarded клиент использует v2 во всех кнопках, клавишах, offline flush,
   retry и публикациях источника, отдельный v2 Connect client в BFF.
5. В приёмке проверить старую вкладку и прямой v1 Connect вызов после
   cutover: ноль изменений и ноль членов комнаты; v2 продолжает работу.
   Откат после начала использования v2 — отдельная пауза и forward-fix /
   совместимая сборка; не включать небезопасные v1 writes как авто-fallback.

## Server (модули и слои)

Расширяются существующие stage и bout; новых bounded context нет.
`stage/module.go` регистрирует новый v2 handler с admin-опциями на том же
service instance; `api/arena_control_v2.go` выполняет transport mapping,
`api/handler.go` прекращает перечисленные v1 вызовы на cutover.
`web/src/lib/grpc/client.ts` экспортирует server-only v2 client.

### Указатель и проведение боя

- `stage/domain/{domain.go,distribute.go}`: selection revision в Pool и
  BoutBoard, version в BoutRef, команды и ошибки. Порт BoutConductor
  принимает собственные stage-типы ожидаемой версии/ID команды;
  адаптер `internal/platform/stage_bout_conductor.go` переводит их в bout.
- `stage/repo/queries/stage.sql` и repo.go: считывание selection_revision;
  CAS выбора `WHERE id=$pool AND selection_revision=$expected`, increment
  при фактической смене выбранной пары или arena_id. Нулевая ревизия
  допустима для старых пулов. Изменение счёта не меняет ревизию выбора.
- Start закрепляет эффективный current в PG **до** записи первого события
  боя, если он пока вычислен fallback'ом. Finish также закрепляет его для
  существующих идущих боёв после обновления. Если append затем не удался,
  выбранная пара остаётся прежней; результата ещё нет, это безопасное состояние.
- Finish пишет событие и синхронизирует сетку/номинацию, но не меняет current.
  Уже явный current сохраняется даже в finished; последний бой не очищается.
- Reveal проверяет арену, pool, expected ID/revision, finished-состояние;
  выбирает `nextUnfinishedAfter` в существующем порядке. Если следующего
  нет, возвращает тот же снимок без очистки. CAS и повторное чтение под
  guard гарантируют, что два перехода не пропустят бой. На mismatch —
  409, клиент перечитывает; автоматического повторения перехода нет.
- SetCurrentBout — явный просмотр/выбор, виден обоим экранам. Reopen действует
  над этой парой; `gateDownstream`, syncBracket и ограничения Reset остаются.
  Unseat очищает экран за счёт отсутствия seated pool; удержание не глобально
  привязано к arena_id. Повторная посадка сохраняет выбор того же пула.
- До записи команда проверяет принадлежность bout к pool и ожидания;
  в bout передаётся именно проверенный ID, никогда повторно найденный current.
- Предлагается instance-owned keyed guard по nomination_id в stage service:
  сериализовать проведение/выбор/посадку и мутации состава, способные удалить
  эти бои. Это защищает несколько панелей и межпульные операции syncBracket
  в принятом одноинстансном монолите (ADR 0012/0013). Общие внутренние методы
  не захватывают guard повторно; внешний entrypoint владеет им до завершения
  синхронизации. Ожидание отменяется с context; ключи освобождаются без утечки.
  CAS и event version сохраняются дополнительно. Не выдавать локальный
  mutex за поддержку нескольких экземпляров сервера.

### Идемпотентные команды event-sourced боя

- `bout/domain/domain.go`: CommandContext и отдельный CommandInput
  (kind, expected_version, actor_id, неизменяемые аргументы команды).
  ID команды создаётся один раз на пользовательское действие; retry после
  сетевой ошибки использует тот же ID и те же аргументы.
- `bout/service/service.go`: сначала поиск command_id в потоке. Совпавшие
  command_input возвращают подтверждение ранее применённой версии без
  append; несовпавшие — ошибка повторного использования ключа. Для новой
  команды expected_version сравнивается с восстановленным агрегатом и
  используется при атомарном Append. При явной версии автоматический
  reload→redecide с новой версией **запрещён**. На unique race перечитать
  запись команды: идентичный повтор успешен, иной конфликт возвращается.
- `bout/repo/repo.go` и `repo/queries/bout.sql`: событие, command metadata
  и инлайн-проекция обновляются в одной существующей транзакции. CommandInput
  сравнивается структурно, а не по порядку JSON-ключей. Payload события и
  вход команды различаются: finish payload содержит итог, вход содержит
  намерение finish; это не основание отклонять корректный retry.
- На повторе stage сначала распознаёт ранее принятую команду и её payload,
  а не отбрасывает её из-за уже изменённого current/version. Он возвращает
  подтверждение + актуальный board и повторяет необходимые идемпотентные
  syncBracket/syncNomination. Новая команда проходит обычные guards.
- Failpoint между append и sync должен воспроизводиться тестом. Не вводить
  общую транзакцию с прямыми запросами stage к bout. Если нынешняя
  материализация syncBracket не идемпотентна при таком повторе, исправление
  её существующего пути входит сюда до приёмки AC-11, без нового event bus.

### Миграции (полный DDL предложения)

`server/modules/stage/migrations/00007_bout_selection_revision.sql`:

```sql
-- +goose Up
ALTER TABLE stage.pools
  ADD COLUMN selection_revision BIGINT NOT NULL DEFAULT 0,
  ADD CONSTRAINT chk_pools_selection_revision CHECK (selection_revision >= 0);

-- +goose Down
ALTER TABLE stage.pools DROP CONSTRAINT chk_pools_selection_revision;
ALTER TABLE stage.pools DROP COLUMN selection_revision;
```

Это дополнительная версия существующего указателя, не снимок результата.
Новые FK, таблицы, индексы и сиды stage не нужны: lookup по существующему PK.
Ссылку current_bout_id на чужую PG-схему не добавлять. Исторические указатели
не переписывать: у старого завершённого пула без current нет достоверной
истории показа, выбор доступен вручную. Новые завершения сохраняют current.

`server/modules/bout/migrations/00003_command_identity.sql`:

```sql
-- +goose Up
ALTER TABLE bout.bout_events
  ADD COLUMN command_id UUID,
  ADD COLUMN command_input JSONB,
  ADD CONSTRAINT chk_bout_events_command_input CHECK (
    (command_id IS NULL AND command_input IS NULL)
    OR (command_id IS NOT NULL AND command_input IS NOT NULL
        AND jsonb_typeof(command_input) = 'object')
  );
CREATE UNIQUE INDEX uq_bout_events_command
  ON bout.bout_events (bout_id, command_id)
  WHERE command_id IS NOT NULL;

-- +goose Down
DROP INDEX bout.uq_bout_events_command;
ALTER TABLE bout.bout_events DROP CONSTRAINT chk_bout_events_command_input;
ALTER TABLE bout.bout_events DROP COLUMN command_input;
ALTER TABLE bout.bout_events DROP COLUMN command_id;
```

Метаданные нужны для повторной доставки команды к одному агрегату. Старые
события и scheduled имеют NULL; backfill/сиды не нужны. Existing
UNIQUE(bout_id,version), FK на bout.bouts и индексы сохраняются. Новых
кросс-модульных FK нет. Номера миграций перепроверить на базе волны до старта;
в рамках пакета именно 0052 единолично владеет этим DDL.

### Аудит читателей current

`stage/service/tournament_live.go`, `forecast.go`, `bracket.go`,
`stage_aggregates.go` и тесты: отличать выбранный бой от непроведённого
кандидата очереди. Статусы/рейтинг считаются по state, не по пустоте current.
Карточка арены не помечает finished как running; публичная очередь берёт
следующий непроведённый бой даже во время оглашения. Предпочтительно сохранить
существующий публичный контракт и его тестируемую семантику, а не добавлять
новую публичную фазу. Прогноз не включает законченный бой в remaining work.

## Web (FSD + BFF)

- BFF: новые `app/api/v2/arenas/[id]/{bout-command,selection,reveal-bout,
  live,timer,timer-frame,scoreboard-sides}/route.ts`: context → v2 proto,
  409 без автоматического повтора, реальная proto JSON сериализация
  version/revision. Старые write/SSE routes → 410, старый board GET остаётся.
  Generated mocks только `create(Schema)`. Новая подписка в
  `features/arena-live/api/use-arena-live.ts` использует v2 live.
- `entities/pool/lib/types.ts`, `entities/arena-live/lib/{types,status,scoreboard-phase}.ts`:
  единый helper контекста current/номер/next/фаза. Два независимых вычисления
  показанной пары в виджетах удалить. Idle только при отсутствии выбранной пары.
- `features/bout-board/api/*`: контекст команды во всех мутациях, один UUID
  на намерение. `use-reveal-bout` применяет возвращённый снимок и обновляет
  board cache; больше не является fire-and-forget отображенческим сигналом.
- `widgets/arena-console/use-bout-score-control.ts`: последовательная очередь
  намерений; быстрые +1/+2 считаются от локального накопленного значения,
  следующий запрос использует подтверждённую версию. Новый общий модельный
  helper в `features/bout-board/model/command-queue.ts`; очередь одна для
  панели, не отдельная для кнопки/горячей клавиши/режима управления.
- Завершение ждёт drain очереди, затем использует последний acknowledged
  version. Любая ошибка останавливает drain/finish. UI блокировка помогает
  пользователю, серверный guard остаётся обязательным.
- Offline pending хранит исходные bout_id/version/revision; reconnect
  отправляет только после сверки. При конфликте сохранить локальный ввод
  для ручной сверки, не очищать при первом сменившемся snapshot и не
  перезаписывать новый счёт автоматически. Полная offline persistence после
  закрытия вкладки не входит в объём.
- `widgets/arena-console/{bout-panel-view,management-view,bout-actions-sheet,arena-console}.tsx`
  и `widgets/arena-scoreboard/arena-scoreboard.tsx`: общий announced,
  правильные подписи, запрет score/finish/start во время оглашения, доступные
  reopen/выход. Удалить auto-return последнего боя. Все keyboard paths
  используют те же guards и очередь, что кнопки.
- `features/arena-timer/api/use-arena-timer.ts`: источник, увидев finished,
  ставит отсчёт на паузу и публикует кадр этой пары; на смене ID/revision
  сбрасывает время один раз. Обработать initial finished snapshot и source
  handoff, не продолжая running. Отбрасывать кадры предыдущей пары. Таймер
  остаётся эфемерным: после полного исчезновения комнаты точное значение
  не восстанавливается; итог счёта от таймера не зависит.
- B03: адаптивный размер `features/arena-timer/ui/TimerDisplay.tsx` с учётом
  ширины контейнера, проверка колонок TimerControls/BoutTimerStrip; не
  уменьшать читаемость полноэкранного табло как побочный эффект.

## События и ADR

Используются существующие scheduled/started/scored/finished/reopened/reset
в bout.bout_events, ADR 0011. Оглашение/Reveal не создают спортивное событие.
`signalArenaBoard` и livebus — существующее уведомление «перечитай», не
межмодульная шина. После утверждения дополнить ADR 0011 политикой явной
expected_version/idempotency; ADR 0013 — границей персистентного выбора и
эфемерного таймера. Присвоение нового ADR при необходимости согласует
координатор, исполнитель не занимает общий номер параллельно.

При реализации обновить прежние требования 0013 (auto-advance), 0015
(reveal/local hold), 0033 (автовыход/офлайн), 0045 (комментарии mobile exit)
со ссылкой на 0052. Сейчас эти артефакты не изменяются.

## Тестирование

- Service с fakes: AC-1..8/10/11, управляемые гонки/сбои вместо sleep.
- Connect httptest: адресация, ACL, v1 retirement/запрет обхода, version conflict,
  повтор команды, reveal mismatch; BFF e2e round-trip новых полей.
- PG integration: обе миграции, параллельные Append и CAS, одинаковый
  command_id с одинаковыми/разными входами, projection+event atomicity,
  перезапуск service с сохранённым current.
- Vitest: очередь и reconnect; parity двух виджетов из одинакового initial
  snapshot; номер/next, последний бой, клавиши, timer source/handoff.
- Browser AC-9: измерение геометрии и ручная визуальная приёмка всех размеров
  и длин времени. Vitest форматтера не доказывает отсутствие clipping;
  скриншотные regression-тесты не добавлять (ADR 0003).
- Полная проверка: make generate, make sqlc, make test-all,
  make test-integration, go test -race ./modules/stage/... ./modules/bout/...,
  go vet ./..., go build ./..., pnpm exec tsc --noEmit, pnpm lint, pnpm build.

## Риски и решения для приёмки пакета

- **D-ARENA:** перенести продвижение current в Reveal, сохранить до него
  finished pointer. Продуктовое удержание утверждено; этот способ реализации
  предлагается впервые. Альтернатива — отдельный durable display pointer,
  но она требует синхронизировать два состояния и не выбрана в этом плане.
- **D-COMMAND:** единый command_id/expected_version и migration foundation
  принимаются здесь; последующие технические исходы/сходы расширяют их.
- **D-API:** явный переход на ArenaControlService v2 с прекращением старых
  write/stream RPC требует согласования окна обновления и reload вкладок;
  это breaking retirement v1, а не additive ужесточение его validation.
- Одноинстансный guard требует осознанной приёмки; несколько серверных
  экземпляров в этот план не входят.
- B02 не называется установленной причиной жалобы. Если воспроизведение
  выявит меньший дефект, подтверждённые guards всё равно нужны для AC-5/6;
  сокращение foundation согласуется с зависимыми спеками до реализации.
- Таймер не становится долговечным; точность его восстановления после
  полного закрытия клиентов не входит в обещание одинакового результата.
