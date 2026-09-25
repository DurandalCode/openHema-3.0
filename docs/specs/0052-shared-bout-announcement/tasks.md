# Tasks: Общее оглашение результата и надёжные команды арены

- Статус: draft
- Дата: 2026-09-25
- План: [plan.md](./plan.md)
- Исполнение начинается после утверждения пакета и D-API (включает current semantics и command foundation).

## Порядок и границы

Один владеющий трек **ARENA**, отдельные ветка и git worktree. B01/B02/B03
не раздавать параллельным чатам: они меняют одну консоль. Внутри задачи
red → green → refactor; падение проверять до правки реализации. Уже
существующие тесты, противоречащие утверждённой новой семантике, обновлять
с привязкой к AC, а не удалять без замены.

Зависимости: от других новых фич пакет не зависит. Технические исходы и
сходы начинают изменения bout/stage только после интеграции этого трека.
Граф плейоффа может параллельно менять свои UI-файлы, но не stage.proto и
не серверную модель; protobuf-типы он регенерирует после общей join-волны.
Фильтр выбора пулов независим в `features/pool-seating`, пока не меняет
management-view.tsx/stage.proto/stage service. Индекс, аудит и номера ADR
редактирует координатор на интеграции.

## Подготовка и контракты

- [ ] **T01. Baseline и воспроизведение B02 — AC-4/5/6.** В
  `web/src/widgets/arena-console/use-bout-score-control.test.tsx`,
  `bout-panel-view.test.tsx`, `server/modules/stage/service/service_test.go`
  добавить deferred-request/fake-repository barriers: два быстрых шага;
  шаг→finish; задержанная команда старой пары; offline→reconnect;
  два клиента. Записать, какой сценарий реально падает. Это red текущей
  реализации, не заявление о доказанной причине полевого инцидента.
- [ ] **T02. Contract-first v2 — AC-1..8/11/12.** До server/web-кода
  создать `proto/hema/v2/arena_control.proto`: ArenaControlService,
  ApplyBoutCommand/SelectBout/RevealNextBout/ControlTimer/PublishTimerFrame/
  SetScoreboardSides/WatchArenaBoard, selection и command contexts из плана.
  В `proto/hema/v1/stage.proto` только additive read-поля и deprecated
  отметки, без обязательного context в старых requests. Утвердить D-API:
  cutover в паузе, retirement перечисленных v1 методов, обновление всех
  вкладок; наличие внешних клиентов не меняет классификацию breaking.
  `make generate`, buf lint штатным инструментом, проверка breaking diff
  v1 schema. Это подготовка типов, не TDD-инкремент. Номер ADR — координатор.

## Server: команды и данные

- [ ] **T03. Идемпотентность bout — AC-5/6/11.** Сначала red в
  `server/modules/bout/service/service_test.go`: identical replay,
  reused ID/different input, stale expected_version, append conflict,
  принятая команда после потери ответа. Затем CommandContext/CommandInput
  в `domain/domain.go`, порт и fake в `testutil/fake_repo.go`, bounded
  command path в `service/service.go`. При явной версии не подменять её
  свежей после конфликта. Green → refactor без смены expected semantics.
- [ ] **T04. Хранение command metadata — AC-6/11.** Red PG integration
  в `server/modules/bout/integration/bout_integration_test.go` на identical
  parallel append, identity collision и rollback event+projection.
  Затем `migrations/00003_command_identity.sql` (DDL plan),
  `repo/queries/bout.sql`, `repo/repo.go`; `make sqlc`. Проверить старые
  события с NULL metadata и применение/откат миграции на тестовой БД.
- [ ] **T05. Ревизия выбора — AC-1/3/7.** Red integration stage: CAS
  устаревшего выбора не обновляет указатель, новая посадка инвалидирует
  старую ревизию, сохранённый current переживает новый service instance.
  Затем `migrations/00007_bout_selection_revision.sql`,
  `repo/queries/stage.sql`, `repo/repo.go`,
  `domain/{domain.go,distribute.go}`, `testutil/fake_repo.go`;
  `make sqlc`. Все pool query projections возвращают revision.
- [ ] **T06. Серверное оглашение — AC-1/2/3/7.** Red в
  `stage/service/service_test.go` и `arena_room_test.go`: finish держит B1;
  reveal выбирает B2; последний остаётся; новый subscriber видит то же;
  double reveal не пропускает; reopening возвращает ведение B1.
  Затем service.go/arena_room.go, порт BoutConductor,
  `testutil/fake_bout_conductor.go`,
  `internal/platform/stage_bout_conductor.go`. Явно закрепить fallback current
  до append, убрать ephemeral generation как источник показа.
- [ ] **T07. Межкомандные гонки и recovery — AC-5/6/7/11.** Red с
  управляемыми барьерами: score/finish и set-current; seat/unseat против
  задержанной команды; два finish; сбой sync после успешного append.
  Затем instance-owned command guard и необходимые изменения существующих
  entrypoints stage (включая bracket/seeding/schema при удалении боёв).
  Payload replay проверять до отвергания уже выполненной команды новым
  current. Повторно согласовать производные данные без дубликата события.
  Тестировать release/cancel guard, отсутствие deadlock/утечки ключей.
- [ ] **T08. Публичные читатели и прогноз — AC-10.** Red в
  `stage/service/{tournament_live,stage_aggregates,bracket,console}_test.go`
  и существующих тестах прогноза: finished current не running, следующий
  остаётся в очереди, рейтинг/сетку не задерживает оглашение, empty pool idle.
  Затем минимальные изменения соответствующих service-файлов и forecast.go.
  Продуктовый редизайн публичной сводки сюда не добавлять.
- [ ] **T09. Connect v2 и retirement — AC-1..8/11/12.** Red
  `stage/api/arena_control_v2_test.go` через httptest+Connect: admin ACL,
  actual version/revision сериализация, UUID/oneof validation, 409,
  replay, reveal последнего боя. В `api/handler_test.go` проверить каждый
  retired v1 метод: прямой вызов не пишет в PG и не входит в комнату,
  возвращает ARENA_API_V1_RETIRED. Затем новый api/arena_control_v2.go,
  регистрация в stage/module.go, retirement в handler.go и error mapping.
  Подтвердить DB-путь через
  `stage/integration/stage_integration_test.go` с реальными миграциями.

## Web: transport, общая модель и UI

- [ ] **T10. BFF v2/cutover — AC-5/6/7/11/12.** Red соседние route
  tests/e2e round-trip новых `app/api/v2/arenas/[id]/{bout-command,selection,
  reveal-bout,timer,timer-frame,scoreboard-sides,live}`; затем обработчики
  и v2 client в `lib/grpc/client.ts`. Передавать revision строкой, command
  UUID не менять на retry. Старые pool bout/current-bout и arena control/
  live routes возвращают 410 и не делают upstream write/join. Board GET
  остаётся чтением. Новый `features/arena-live/api/use-arena-live.ts` ходит
  в v2 stream, никакого v1 write fallback. Проверить HTTP 409, retirement
  и старое табло, которое не может занять source. `pnpm exec tsc --noEmit`.
- [ ] **T11. Очередь и pending — AC-4/5/6/11.** Red в новом
  `features/bout-board/model/command-queue.test.ts` и T01-тестах; затем
  command-queue.ts, `features/bout-board/api/{requests,use-score-bout,
  use-finish-bout,use-start-bout,use-reopen-bout,use-reset-bout}.ts`,
  pending-score model и `widgets/arena-console/use-bout-score-control.ts`.
  Очередь сохраняет все быстрые шаги, finish ждёт drain, одинаковый retry
  сохраняет ID, conflict хранит локальное намерение для сверки. Не только
  disabled кнопки; кнопка и Ctrl+Enter используют один метод.
- [ ] **T12. Общий контекст — AC-1/2/3/7.** Red
  `entities/arena-live/lib/{types,scoreboard-phase,status}.test.ts`,
  `widgets/arena-scoreboard/arena-scoreboard.test.tsx`,
  `widgets/arena-console/{bout-panel-view,management-view,arena-console}.test.tsx`.
  Затем types/helper, оба виджета и reveal mutation/cache. Проверить parity
  на первом snapshot без предыдущего running кадра, номер/далее, последний
  результат, ручной выход и выбранный завершённый бой при reopening.
- [ ] **T13. Таймер и клавиши — AC-8.** Red server arena_room tests,
  BFF timer/timer-frame tests, `features/arena-timer/api/use-arena-timer.test.ts`
  и тесты TimerControls/BoutTimerStrip. Затем адресация frame/command,
  pause при finished, single reset при reveal, запрет space/start при
  оглашении, initial finished и source handoff. Убедиться, что устаревший
  кадр не применится к новой паре. Не обещать persistence времени.
- [ ] **T14. B03 clipping — AC-9.** Сначала воспроизвести переполнение
  в браузере в полной колонке 300 px и на breakpoint; записать viewport,
  значение, ширины. Добавить нужные unit/component проверки формата и
  вариантов `TimerDisplay`, затем исправить адаптивную геометрию
  `features/arena-timer/ui/{TimerDisplay,TimerControls}.tsx`,
  `widgets/arena-console/{bout-timer-strip,bout-panel-view}.tsx` по факту.
  Повторить ручное измерение/визуальную проверку всей матрицы AC-9; проверка
  CSS-строки в Vitest не считается доказательством устранения clipping.

## Join и приёмка

- [ ] **T15. End-to-end rehearsal — AC-1..12.** Реальные сервер+БД+BFF,
  две панели и табло: два боя, быстрый счёт, оглашение/переход/последний,
  потеря ответа/reconnect/перезапуск, выход, переоткрытие и downstream gate.
  Провести учебный cutover: старые панели/табло и прямые v1 RPC отклонены,
  после reload v2 работает; результат в PG сохранён, таймер при надобности
  восстановлен оператором. Не проводить эксперимент на живом турнире.
  Проверить все записанные AC; ограничения окружающей среды сообщить,
  не отмечать непроведённые проверки выполненными.
- [ ] **T16. Проверки.** `make generate`, `make sqlc`, `make test-all`,
  `make test-integration`; в server `go test -race ./modules/stage/...
  ./modules/bout/...`, `go vet ./...`, `go build ./...`; в web
  `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`. Если миграции
  переименованы из-за новой базы — актуализировать plan перед merge.
- [ ] **T17. Документы/интеграция.** С координатором обновить требования
  спек 0013/0015/0033/0045, ADR 0011/0013, audit B01/B02/B03; B02 отмечать
  воспроизведённым только для проверенных сценариев. Статусы и индекс
  изменять после фактической приёмки. Поставить зависимые 0056/0058 на
  новую базу и регенерировать у них код; generated не переносить.

## Ownership для раздачи чатам

ARENA владеет следующими существующими зонами и соседними тестами;
расширение списка перед правкой согласуется с координатором:

| Зона | Конкретные общие файлы / каталоги | Возможное пересечение |
| --- | --- | --- |
| Контракт | `proto/hema/v1/stage.proto`, новый `proto/hema/v2/arena_control.proto` | граф с server API; technical/exchanges; любой новый Stage RPC |
| Stage core | `server/modules/stage/domain/domain.go`, `domain/distribute.go`, `service/service.go`, `service/arena_room.go`, `repo/repo.go`, `repo/queries/stage.sql`, `api/handler.go`, новый `api/arena_control_v2.go`, `module.go`, `testutil/fake_repo.go`, `testutil/fake_bout_conductor.go` | technical/exchanges, seeding, фильтр с серверными изменениями |
| Stage projections | `service/{bracket,seeding,schema,tournament_live,forecast,console,stage_aggregates}.go` внутри stage | technical/exchanges, объяснение отбора при server-расширении |
| Bout | `server/modules/bout/{domain/domain.go,service/service.go,repo/repo.go,repo/queries/bout.sql,testutil/fake_repo.go}` | technical/exchanges/экспорт при расширении event store |
| Adapter | `server/internal/platform/stage_bout_conductor.go` | technical/exchanges |
| BFF | `web/src/lib/grpc/client.ts`; новые `web/src/app/api/v2/arenas/[id]/{bout-command,selection,reveal-bout,live,timer,timer-frame,scoreboard-sides}/route.ts`; retirement старых pool bout/current-bout и arena control/live routes | technical/exchanges |
| Live client | `web/src/features/arena-live/api/use-arena-live.ts` | technical/exchanges и любые изменения live transport |
| Shared DTO | `web/src/entities/pool/lib/types.ts`, `web/src/entities/arena-live/lib/{types,status,scoreboard-phase}.ts` | граф/фильтр, если меняют общий DTO; общий файл отдаётся ARENA |
| Commands | `web/src/features/bout-board/`, `web/src/widgets/arena-console/` | technical/exchanges; фильтр не правит management-view параллельно |
| Timer/scoreboard | `web/src/features/arena-timer/`, `web/src/widgets/arena-scoreboard/` | сходы при времени таймера |
| Общие документы | `docs/specs/README.md`, аудит, ADR 0011/0013 и старые спеки | только join координатора |

Новые миграции принадлежат этому треку целиком. Следующие волны расширяют
схему новыми миграциями, не редактируют уже применённые. Эта таблица — lock
на файлы, а не разрешение массового рефакторинга перечисленных каталогов.
