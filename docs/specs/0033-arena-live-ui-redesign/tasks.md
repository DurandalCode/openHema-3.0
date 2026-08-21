# Tasks: Редизайн живого UI площадки — табло, панель секретаря, страница арены

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: done
- Дата: 2026-08-15
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах.

## Треки и параллельность

Инкремент распадается на дизъюнктные по файлам куски: серверное чтение
журнала (`modules/bout` → затем `modules/stage`), чистая клиентская логика
(`entities/arena-live/lib`, `features/*/model`), табло
(`widgets/arena-scoreboard`) и живой канал с постановкой пула
(`features/{arena-live,pool-seating}`). Сборка консоли площадки трогает
файлы сразу нескольких треков — она идёт join-волной.

| Волна | Трек | Задачи | Файлы (не пересекаются внутри волны) | Зависит от |
| ----- | ---- | ------ | ------------------------------------- | ---------- |
| 0 | — | T1 | `proto/hema/v1/stage.proto` | — |
| 1 | A · server-bout | T2–T6 | `server/modules/bout/**` | волна 0 |
| 1 | B · web-pure | T7–T12 | `web/src/entities/arena-live/lib/**`, `web/src/shared/hooks/use-local-preference.ts`, `web/src/features/bout-board/model/**` | волна 0 |
| 2 | D · server-stage | T13–T17 | `server/modules/stage/**`, `server/internal/platform/**` | трек A смержен |
| 2 | E · web-scoreboard | T18–T20 | `web/src/widgets/arena-scoreboard/**`, `web/src/features/arena-timer/ui/TimerDisplay.tsx` | трек B смержен |
| 2 | F · web-live | T21–T22 | `web/src/features/arena-live/api/**`, `web/src/features/pool-seating/ui/**` | трек B смержен |
| 3 | join | T23–T28 | BFF-ручка, `features/arena-journal/**`, `features/arena-timer/ui/TimerControls.tsx`, `widgets/arena-console/**`, страница арены | треки D, E, F смержены |
| 4 | — | T29–T33 | проверка и документация | волна 3 |

После мержа трека — сразу `git worktree remove` и `git branch -d` за собой
(правило корневого `AGENTS.md`).

## Контракты

- [x] **T1.** `proto/hema/v1/stage.proto` — `GetArenaJournal` в
      `StageAdminService`, сообщения `GetArenaJournalRequest`/
      `GetArenaJournalResponse`/`BoutJournalEntry`, enum `BoutEventKind`
      (без `scheduled` — spec FR-34/FR-36). `make generate`.
      _(контракты — не TDD-шаг, но идут первыми: от них зависят типы.)_

## Волна 1 · трек A — server/bout (чтение журнала)

- [x] **T2. domain** — `modules/bout/domain/domain.go`: тип `EventRecord`
      (read-model журнала: `BoutID`/`PoolID`/`SequenceNumber`/`FighterA`/
      `FighterB`/`Type`/`ScoreA`/`ScoreB`/`ActorID`/`OccurredAt`) + метод
      порта `Repository.EventsForPools(ctx, poolIDs, limit)`. Red — `service`
      и `testutil` перестают собираться без реализации.
- [x] **T3. service (red→green)** — `service/service_test.go`:
      клэмп лимита (`0 → 50`, `250 → 200`), пустой `poolIDs` → пустой срез
      **без обращения к репо**, `scheduled` в выдаче отсутствует → затем
      `service.ListEventsForPools`.
- [x] **T4. testutil** — `modules/bout/testutil/fake_repo.go`: `EventsForPools`
      поверх уже хранимого фейком журнала (`var _ domain.Repository =
      (*FakeRepo)(nil)` держит компиляционный контракт).
- [x] **T5. repo** — `repo/queries/bout.sql`: `-- name: EventsForPools :many`
      (`bout_events` join `bouts`, `pool_id = ANY(...)`, `event_type <>
      'scheduled'`, `ORDER BY occurred_at DESC, version DESC`, `LIMIT`);
      `make sqlc`; `repo/repo.go` — реализация порта с разбором `payload`
      jsonb в `ScoreA`/`ScoreB`.
- [x] **T6. integration** — `modules/bout/integration/bout_integration_test.go`:
      прогнать бой командами ЖЦ (start → score → finish → reopen) и
      проверить, что `EventsForPools` отдаёт события в ожидаемом порядке,
      без `scheduled`, со счётом из payload. **Единственное место, где
      проверяется реальный SQL.**
      _Миграций в этом треке нет — `bout.bout_events` заведена спекой 0013._

## Волна 1 · трек B — web/чистая логика

- [x] **T7 (red→green).** `entities/arena-live/lib/journal.test.ts` →
      `journal.ts`: `JournalEntryDto`, `journalEntryText` для всех пяти
      видов («бой 7 начат», «бой 6 завершён · Ильин 2 : 5 Дерюгин», счёт,
      переоткрыт, сброшен), `journalEntryTime`.
- [x] **T8 (red→green).** `entities/arena-live/lib/connection.test.ts` →
      `connection.ts`: `connectionLabel(lostForMs)` («Связь потеряна · 12
      секунд» / минуты), `isOffline`.
- [x] **T9 (red→green).** `entities/arena-live/lib/scoreboard-phase.test.ts`
      → `scoreboard-phase.ts`: шесть исходов `idle`/`waiting`/`running`/
      `endgame`/`expired`/`announced`, включая границу «концовка ↔ истекло»
      на 0 (AC-15) и удержание оглашения при уже продвинутом
      `currentBoutId` (AC-17).
- [x] **T10 (red→green).** `shared/hooks/use-local-preference.test.ts` →
      `use-local-preference.ts`: SSR-безопасный дефолт (нет `window`),
      чтение существующего значения, запись, изоляция по ключу.
- [x] **T11 (red→green).** `features/bout-board/model/pending-score.test.ts`
      → `pending-score.ts`: три шага в офлайне схлопываются в **одно**
      абсолютное значение (AC-13), клэмп к нулю, сброс после успешной
      отправки.
- [x] **T12 (red→green).** `features/bout-board/model/score-undo.test.ts` →
      `score-undo.ts`: метка «Отменить +1 красному» (AC-8), возврат к
      предыдущему абсолютному значению, недоступность без шагов, сброс при
      смене боя.

## Волна 2 · трек D — server/stage (RPC журнала)

- [x] **T13. domain** — `modules/stage/domain/domain.go`: `BoutEventRecord`
      (собственный тип модуля, не импорт `bout` — граница ADR 0002),
      `BoutConductor.EventsForPools`, новый порт `UserProvider.DisplayNames`
      (дословно приём 0025).
- [x] **T14. service (red→green)** — `service/service_test.go` с фейками:
      площадка без пула → пустой журнал **без ошибки** (AC-20), дедупликация
      `ActorID` в батче имён, пустой `ActorID` → пустое имя, отсутствие
      пользователя в карте → пустое имя → затем `Service.GetArenaJournal`
      + седьмой аргумент `users` в `New(...)` (правка всех существующих
      конструкций в тестах).
- [x] **T15. testutil** — `modules/stage/testutil/`: `EventsForPools` у
      `FakeBoutConductor`, новый `FakeUserProvider` (копия приёма
      `modules/application/testutil/fake_user_provider.go`).
- [x] **T16. api (red→green)** — `api/handler_test.go` (httptest + Connect,
      фейки): счастливый путь, маппинг `EventType` → `BoutEventKind`,
      `ErrNotFound` → `CodeNotFound` → затем `api/handler.go`.
- [x] **T17. wiring** — `internal/platform`: `EventsForPools` в адаптере
      `BoutConductor` (перекладка `bout/domain.EventRecord` →
      `stage/domain.BoutEventRecord`), прокидывание
      `auth.NewDisplayNameProvider(...)` в `stage.Service` — того же
      объекта, что уже получает `application`.

## Волна 2 · трек E — web/табло

- [x] **T18 (red→green).** `features/arena-timer/ui/TimerDisplay.test.tsx` →
      `TimerDisplay.tsx`: компонент становится презентационным (решение
      «концовка/истекло» приходит пропсом из `scoreboardPhase`, T9),
      появляется размер полосы табло. Существующие тесты правятся, а не
      удаляются.
- [x] **T19 (red→green).** `widgets/arena-scoreboard/arena-scoreboard.test.tsx`
      → `arena-scoreboard.tsx`: полоса таймера сверху и крупнее счёта
      (AC-14), пять фаз по `scoreboardPhase` (AC-15/AC-16/AC-17), шапка
      «площадка · номинация · пул» + «Бой N из M», нижняя полоса «Далее» /
      «Последний бой пула». `prefers-reduced-motion` уважается (NFR-4).
- [x] **T20 (red→green).** `widgets/arena-scoreboard/appearance-toggle.test.tsx`
      → `appearance-toggle.tsx`: тумблер тёмное/светлое поверх
      `use-local-preference` (T10), ключ на площадку, сохранение между
      открытиями (AC-18); тема приложения (`next-themes`) не читается —
      правило 0015 (NFR-2) остаётся в силе.

## Волна 2 · трек F — web/живой канал и постановка пула

- [x] **T21 (red→green).** `features/arena-live/api/use-arena-live.test.ts` →
      `use-arena-live.ts`: в результат добавляются `connection`,
      `lostSinceMs`, `reconnect()`; `lost` выставляется на пороге
      `SSE_ERROR_THRESHOLD` (там, где сейчас молчаливый
      `fallbackToPolling`), снимается первым успешным кадром; `reconnect()`
      пересоздаёт `EventSource`. Роль подписчика **не меняется** — комната
      табло не затрагивается (NFR-3).
- [x] **T22 (red→green).** `features/pool-seating/ui/pool-seating.test.tsx`
      → `pool-seating.tsx`: карточки готовых пулов с составом (FR-12),
      взаимоисключающие чипы номинаций с явным «Все номинации» (AC-6),
      объясняющее пустое состояние с переходом к посеву (AC-7).

## Волна 3 · join — сборка консоли площадки

- [x] **T23 (red→green).** `app/api/arenas/[id]/journal/route.test.ts` +
      `route.e2e.test.ts` → `route.ts`: `GET`, Node runtime, admin-only по
      образцу соседнего `board/route.ts`. E2E — по правилу ADR 0010
      (`Timestamp` в ответе).
- [x] **T24 (red→green).** `features/arena-journal/`: `api/{keys,requests,
      use-arena-journal}.ts` + тесты fetcher'а → `ui/arena-journal.tsx`:
      лента новыми сверху, время и имя автора у каждой записи (AC-19),
      пустое состояние, объясняющее, что записи появятся с первым действием
      по бою, и не называющее себя журналом площадки (AC-20).
- [x] **T25 (red→green).** `features/arena-timer/ui/TimerControls.tsx` —
      переписать в колонку таймера панели (FR-17): значение с сотыми,
      Старт/Пауза/Сброс, `±1/2/3/5` c, смена сторон, дефолтная длительность
      **только на чтение**. `model/timer-authority.ts`,
      `model/timer-follower.ts`, `api/use-arena-timer.ts` не трогаются.
- [x] **T26 (red→green).** `widgets/arena-console/`:
      `arena-console.tsx` (один `useArenaLive` на страницу, чтение и смена
      `?mode`, `Esc`, авто-возврат после последнего боя пула),
      `mode-switch.tsx`, `connection-bar.tsx`, `management-view.tsx`,
      `bout-panel-view.tsx`. Тесты на AC-1, AC-2, AC-3, AC-9, AC-10, AC-11,
      AC-12, AC-13.
      _Проверить тестом, что смена `?mode` не размонтирует поддерево
      (риск из `plan.md`); если размонтирует — перейти на запасной вариант
      `history.pushState` + `popstate`._
- [x] **T27 (red→green).** Сборка страницы: `app/(admin)/admin/arenas/[id]/
      page.tsx` → `<ArenaConsole/>` с SSR-доской, `AdminHeader` →
      `PageHeader` внутри виджета. **Удалить** `features/bout-board/ui/
      bout-board.tsx` вместе с ручным вводом счёта и кнопкой «Задать»
      (FR-7); `features/bout-board/api/**` остаётся.
- [x] **T28.** Тост-обратная связь по правилу 0023 на снятие пула
      («Отменить», действие обратимо — AC-5) и на успешную досылку
      удержанного счёта (AC-13); отказы сервера — тост-ошибка **без**
      «Повторить» (мутация event-sourced боя не идемпотентна, ADR 0011 —
      прецедент 0025/0026).

## Волна 4 · проверка

- [x] **T29.** `make test-all` зелёный.
- [x] **T30.** `pnpm exec tsc --noEmit` (менялись protobuf-моки — новый
      `BoutJournalEntry`; правило `web/AGENTS.md`).
- [x] **T31.** `go build ./...` + `pnpm build`.
- [x] **T32.** Ручной смоук на `make demo-bouts`: переход в панель посреди
      боя (таймер не сброшен, `scoreboardCount` не изменился — AC-1/AC-21),
      обрыв сети в devtools (AC-11…AC-13), табло во втором окне в пяти
      фазах, журнал после серии действий (AC-19).
      **Если headless-браузера в среде реализации нет** (как в 0026/0027/
      0030/0031) — сделать функциональный смоук через реальный BFF и
      зафиксировать здесь, что проверено кликами, а что осталось на
      автотестах. Не отчитываться о непроведённых проверках.
      **Headless-браузера в среде реализации нет** (как в 0026/0027/0030/
      0031) — сделан функциональный смоук через реальный BFF+сервер+Postgres
      (`docker` был поднят, найден и убит посторонний stale-процесс сервера
      от 15 августа, слушавший 8080 поверх кода без `GetArenaJournal` —
      без этого журнал молча 404-ил). Реально пройдено curl'ом от
      залогиненного admin: `GET /board` и `GET /journal` на живой площадке
      (`Ристалище 2`, живой бой из демо-сида) — журнал отдаёт новые записи
      первыми с резолвленным именем автора (`SCORED` перед `STARTED`,
      корректные fighterId/name/club); `POST /pools/[id]/bout` (score
      6:5) — счёт применился и тут же появился в журнале новой записью;
      `POST /pools/[id]/unseat` → `board.pool` стал `null` → `POST
      /pools/[id]/seat` с тем же `arenaId` вернул пул на ту же площадку
      (ровно семантика undo-тоста, AC-5); SSR-рендер страницы площадки в
      обоих режимах (`?mode=bout` и без) — оба возвращают 200 и содержат
      ожидаемый текст (имена бойцов, «КРАСНЫЙ»/«СИНИЙ» в панели,
      «Управление ареной»/«Ведение боя» в обоих); табло (`/scoreboard`) —
      200, фаза «ИДЁТ» с именами бойцов. **Не проверено кликами** (осталось
      на автотестах T18–T26): визуальный размер кнопок 64/48px, фактическое
      обновление счёта в другой открытой вкладке без перезагрузки (AC-4),
      реальный обрыв `EventSource` в devtools (AC-11…AC-13 покрыты юнитами
      `use-arena-live.test.ts`/`use-bout-score-control.test.tsx`, не живым
      браузером), клавиатурные сочетания `Ctrl+Enter`/`Space` (юнит-тест
      `bout-panel-view.test.tsx`), `scoreboardCount` живой комнаты при
      переключении режима (AC-21, логически гарантировано архитектурой —
      один `useArenaLive` на страницу, роль `panel` не меняется — но не
      замерено вручную).
- [x] **T33.** Документация: строка «Страница арены» в `docs/design-sync.md`
      («новый API нужен» — журнал боёв, RPC `GetArenaJournal`; ср. правки
      0025/0026), строки «Arena Scoreboard» и «Secretary Panel» с новыми
      repo-путями (`widgets/arena-console/**`); статусы `spec.md`/`plan.md`/
      `tasks.md` → `done`; строка 0033 в индексе `docs/specs/README.md`.
