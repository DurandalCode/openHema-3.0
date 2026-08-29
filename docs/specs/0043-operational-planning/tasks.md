# Tasks: Пульт турнира и прогноз очереди

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: draft
- Дата: 2026-08-29
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах.

## Треки и параллельность

Спека распадается на дизъюнктные куски: чистая доменная модель оценки
(новые файлы, ничего не импортируют), провайдеры данных в чужих модулях
(`arena`, `bout`) и — после их сведения — сервис `stage`, который всё это
использует. Веб распадается на два экранных трека поверх одного общего
форматтера.

| Волна | Трек | Задачи   | Файлы (не пересекаются внутри волны)                                   | Зависит от     |
| ----- | ---- | -------- | ---------------------------------------------------------------------- | -------------- |
| 0     | —    | T1–T2    | `docs/adr/0020-*`, `proto/hema/v1/stage.proto`                          | —              |
| 1     | A    | T3–T4    | `modules/stage/domain/{pace,alerts}.go` + тесты (новые файлы)           | волна 0        |
| 1     | B    | T5–T7    | `modules/arena/**`, `modules/bout/**`                                   | волна 0        |
| 2     | join | T8–T12   | `modules/stage/{domain/domain.go,testutil,service,api}`                 | треки A и B    |
| 3     | join | T13      | `internal/platform/*`                                                   | волна 2        |
| 4     | —    | T14–T15  | `web/src/shared/ui/forecast-time.tsx`, BFF-маршруты пульта              | волна 3        |
| 5     | D    | T16–T18  | `features/tournament-console`, `widgets/tournament-console`, `app/(admin)/admin/console`, `widgets/admin-shell/admin-nav-links.tsx` | волна 4 |
| 5     | E    | T19–T21  | `widgets/home`, `widgets/nomination-public`, `widgets/dashboard`, `features/arena-management` | волна 4 |
| 6     | join | T22–T26  | проверка, статусы, индекс                                               | треки D и E    |

## Волна 0 — ADR и контракты

- [x] T1. **ADR 0020** _(написана 2026-08-29)_ — `docs/adr/0020-operational-estimation.md`: модель
      операционной оценки. Зафиксировать: такт площадки вместо длительности
      боя; медиана вместо среднего (выброс зависшего боя); окно 5 в пуле и
      20 по турниру, порог 3; **почему темп привязан к текущему пулу, а не
      к площадке** (истории посадок нет и не будет — ADR 0017); каскад
      резервов и признак «предварительно»; оценка не хранится; горизонт —
      стоящий пул; чего модель заведомо не знает (перерывы, награждения —
      спека NFR-5); **почему у прогноза пока нет почтового канала** и что
      п. 5.4 ADR 0017 при этом отложен, а не отменён. _(документ — не TDD-шаг)_
- [x] T2. **Контракты** — `proto/hema/v1/stage.proto` (единственный
      затронутый файл): `PaceEstimate`, `BoutForecast`, `ArenaIdleState`,
      `ConsoleAlertKind`, `ConsoleArena`, `ConsoleNomination`,
      `ConsoleQueueItem`, `ConsoleAlert`, `TournamentConsoleSnapshot`, RPC
      `GetTournamentConsole`/`WatchTournamentConsole`; поля `forecast` в
      `LiveFeedBout`/`BoardBout`, `next_bout_forecast` в `LiveArena`,
      `idle_state`/`free_since` в `ArenaBoardEntry`. `make generate`.
      _(контракты — не TDD-шаг, но идут первыми: от них зависят типы.)_

## Волна 1, трек A — доменная модель оценки

- [x] T3. **pace (red→green)** — `modules/stage/domain/pace_test.go`:
      таблицы на медиану (нечётное/чётное окно, окно длиннее истории,
      ровно порог 3), каскад «пул → турнир → дефолт+пауза», `Provisional`
      на каждом уровне, устойчивость к одному выбросу → затем
      `domain/pace.go` (`PaceEstimate`, `BoutForecast`, `ComputePace`,
      `ForecastPool`, константы окон и паузы).
- [x] T4. **alerts (red→green)** — `modules/stage/domain/alerts_test.go`:
      на каждый из шести видов FR-15 — «порог не достигнут → пусто»,
      «порог перейдён → запись с верным `since`», «условие снято → пусто»
      (AC-15) → затем `domain/alerts.go` (`ConsoleAlert`, `DetectAlerts`,
      константы порогов).

## Волна 1, трек B — провайдеры данных

- [x] T5. **arena: миграция** — `modules/arena/migrations/00003_last_freed_at.sql`
      (`last_freed_at TIMESTAMPTZ NULL`, комментарий по образцу плана).
      Единственная миграция всей спеки.
- [x] T6. **arena: домен→repo (red→green)** — `service/service_test.go`:
      `MarkFreed` проставляет момент, повторный вызов идемпотентен, `Get`
      отдаёт `LastFreedAt` → затем `domain.Arena.LastFreedAt`,
      `Repository.MarkFreed`, `service.MarkFreed`, запрос `MarkArenaFreed`
      (добавлен в существующий `repo/queries/arena.sql`, не в отдельный
      `arenas.sql`), `make sqlc`.
- [x] T7. **bout: отметки начала (red→green)** — тест repo/сервиса:
      `StartedAtByBouts` отдаёт **первый** `started` у боя с несколькими
      событиями (переоткрытие), пропускает бои без `started` → затем
      `domain.Repository.StartedAtByBouts`, `repo/queries/pace.sql`,
      `make sqlc`.

## Волна 2 (join) — сервис `stage`

- [x] T8. **domain: порты** — `modules/stage/domain/domain.go`:
      `ArenaRef.LastFreedAt`, `ArenaProvider.MarkFreed`,
      `BoutConductor.StartedAtByBouts`. Тест — компиляционный red через
      testutil следующего шага.
- [x] T9. **testutil** — `modules/stage/testutil/`: фейки новых методов
      (`FakeArenaProvider.MarkFreed`, `FakeBoutConductor.StartedAtByBouts`),
      `var _` проверки портов.
- [x] T10. **UnseatPool → MarkFreed (red→green)** —
      `service/unseat_test.go`: успешное снятие зовёт `MarkFreed` ровно
      один раз и **до** публикации живого кадра; отказ снятия не зовёт →
      затем правка `service/service.go`.
- [x] T11. **пульт: сборка снапшота (red→green)** —
      `service/console_test.go`: все неархивные площадки в ответе; очередь
      без стоящих пулов; номинация с непоставленными пулами отдаёт остаток
      числом, без времени; **одно прохождение по данным** (AC-8, счётчик
      обращений фейка) → затем `service/console.go`.
- [x] T12. **обогащение существующих проекций + api (red→green)** —
      `service/tournament_live_test.go` и `stage_aggregates_test.go`:
      `forecast` у не начатых боёв поставленного пула, пустой у
      непоставленного (FR-24), `Imminent` вместо минуса (AC-4),
      `idle_state`/`free_since` в `ArenaBoardEntry` (AC-16..AC-18);
      `api/console_handler_test.go` (httptest + Connect): счастливый путь,
      `RequireAdmin` для гостя и не-админа, неактивный турнир, первый кадр
      `WatchTournamentConsole` → затем сервис и `api/handler.go`.

## Волна 3 (join) — wiring

- [x] T13. **platform** — `stage_arena_provider.go` (`MarkFreed`,
      `LastFreedAt` в `ActiveArenas`), `stage_bout_conductor.go`
      (`StartedAtByBouts`). `stage_live_bus.go` не тронут: пульт
      переиспользует существующий топик `SubscribeTournament` (0034) вместо
      отдельной темы `console:<id>` из плана — все мутации, влияющие на
      пульт, уже публикуют `PublishTournamentChanged` рядом с сигналом
      номинации (`notifyNominationChanged`), второй синхронный канал не
      добавил бы пользы (обоснование — doc-комментарий
      `AdminHandler.WatchTournamentConsole`).

## Волна 4 — общий форматтер и BFF пульта

- [x] T14. **forecast-time (red→green)** —
      `web/src/shared/ui/forecast-time.test.tsx`: «ориентировочно 11:20»,
      «через ~14 мин», «вот-вот» при прошедшем времени, пометка
      «предварительно», прочерк при пустом прогнозе → затем
      `shared/ui/forecast-time.tsx`. Единственное место форматирования
      прогноза (план, «Слои»).
- [x] T15. **BFF пульта (red→green)** — `/api/tournaments/[id]/console`
      (не `/api/admin/console`, как в plan.md — путь исправлен под
      реальную конвенцию `arena-boards`, спека 0041) —
      `app/api/admin/console/route.test.ts` и `stream/route.test.ts`
      (mock connect, маппинг `connect.Code`→HTTP, SSE-кадры) → затем
      `route.ts` обоих маршрутов.

## Волна 5, трек D — экран пульта

- [ ] T16. **feature (red→green)** — `features/tournament-console/api/`
      (`requests.ts`, `keys.ts`, RQ-хук + SSE-подписка) с тестами
      фетчеров → затем `ui/`: `console-arena-card`,
      `console-nomination-row`, `console-queue-list`, `attention-feed`,
      `alert-row`. Тест ленты: шесть видов рендерятся, у каждого верный
      переход (AC-10..AC-14).
- [ ] T17. **widget + route (red→green)** —
      `widgets/tournament-console/console-screen.test.tsx` (SSR-снапшот,
      пустой турнир без падения, пульт ничего не мутирует — AC-9) → затем
      `console-screen.tsx` и `app/(admin)/admin/console/page.tsx`.
- [ ] T18. **навигация** — пункт «Пульт» первым в
      `widgets/admin-shell/admin-nav-links.tsx` + правка
      `admin-shell.test.tsx`.

## Волна 5, трек E — прогноз и простой на существующих экранах

- [ ] T19. **публичная главная (red→green)** — тесты `widgets/home/*`:
      ориентировочное время в ленте боёв, время следующего боя на карточке
      площадки, замена сноски «прогноза нет» (FR-20/FR-21), **простой
      публично не показывается** (AC-19) → затем виджеты.
- [ ] T20. **страница номинации и кабинет (red→green)** — тесты
      `widgets/nomination-public/*` (FR-22) и
      `widgets/dashboard/next-bout-card.test.tsx`: время и обратный отсчёт
      при поставленном пуле (AC-6), «вы следующий» (AC-7), объяснение при
      непоставленном (AC-5) → затем виджеты.
- [ ] T21. **доска площадок (red→green)** — тесты
      `features/arena-management/*`: «ждёт первый пул» (AC-16),
      «Свободна · 12 мин» (AC-17), доигранный пул площадку не освобождает
      (AC-18) → затем UI.

## Волна 6 (join) — проверка

- [ ] T22. `make test-all` зелёный.
- [ ] T23. `pnpm exec tsc --noEmit` (менялись protobuf-типы — обязательно).
- [ ] T24. `go build ./...` + `pnpm build`.
- [ ] T25. `make migrate` на чистой БД: единственная новая миграция
      (`arena/00003_last_freed_at.sql`) применяется и откатывается.
- [ ] T26. Обновить статусы `spec.md`/`plan.md`/`tasks.md` на `done` и
      строку `0043` в `docs/specs/README.md`; отметить в
      `docs/adr/0017-*.md`, что порядок пройден, а единственный оставшийся
      его пункт — п. 5.4 (прогнозные уведомления) — ждёт своей спеки.
