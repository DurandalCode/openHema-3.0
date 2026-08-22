# Tasks: Редизайн публичной главной — афиша до старта и живой турнир

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: draft
- Дата: 2026-08-22
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах.

## Треки и параллельность

Инкремент даёт четыре дизъюнктных по файлам куска: модуль `bout` (времена),
модуль `stage` (сборка сводки), чистые web-функции (не зависят ни от
сервера, ни от разметки) и — позже — BFF-мост против презентационных
виджетов. Каждый пишется на своих фейках и не ждёт соседа; сходятся они в
join-волнах (wiring платформы и композиция страницы).

| Волна | Трек | Задачи   | Файлы (не пересекаются внутри волны)                            | Зависит от        |
| ----- | ---- | -------- | --------------------------------------------------------------- | ----------------- |
| 0     | —    | T1       | `proto/hema/v1/stage.proto`                                       | —                 |
| 1     | A    | T2–T5    | `server/modules/bout/**`                                          | волна 0           |
| 1     | B    | T6–T10   | `server/modules/stage/**`                                         | волна 0           |
| 1     | C    | T11–T12  | `web/src/entities/{tournament-live,tournament,application}/lib/**` | волна 0           |
| 2     | join | T13–T14  | `server/internal/platform/**` (общие файлы треков A и B)           | A и B смержены    |
| 3     | D    | T15–T17  | `web/src/app/api/tournament/**`, `web/src/features/tournament-live/**` | волна 2, трек C |
| 3     | E    | T18–T22  | `web/src/widgets/**`, `web/src/entities/tournament/ui/**`          | трек C            |
| 4     | join | T23      | `web/src/app/page.tsx`, `widgets/home/home-screen.tsx` (общие D и E) | D и E смержены |
| 5     | —    | T24–T28  | проверка                                                          | волна 4           |

## Контракты

- [ ] T1. `proto/hema/v1/stage.proto` — `GetTournamentLive` и
      `WatchTournamentLive` в `StagePublicService`; сообщения
      `TournamentLiveSnapshot`, `LiveArena`, `LiveFeedBout`,
      `LiveNomination`, пары Request/Response; enum `LiveArenaState`,
      `LiveNominationPhase`. `make generate`.
      _(контракты — не TDD-шаг, но идут первыми: от них зависят типы.)_

## Server — трек A (модуль `bout`: времена боёв)

- [ ] T2. **domain** — `modules/bout/domain/domain.go`: тип
      `BoutTimes{ StartedAt, FinishedAt *time.Time }` (собственный тип
      модуля, ADR 0002).
- [ ] T3. **repo** — `repo/queries/bout.sql`: `-- name: BoutTimesForPools :many`
      (агрегат `MAX(occurred_at) FILTER` по `started`/`finished` с join на
      `bout.bouts` по `pool_id = ANY(...)`); `make sqlc`; реализация метода
      порта в `repo/repo.go`. Миграций нет.
- [ ] T4. **service (red→green)** — `service/service_test.go`:
      `TimesForPools` на пустом списке пулов не ходит в репо и возвращает
      пустую карту → затем `service/service.go`.
- [ ] T5. **интеграционный с БД (red→green)** — `modules/bout/integration`:
      реальный журнал — бой начат; завершён; завершён и переоткрыт
      (побеждает последняя отметка, AC-14); сброшен.

## Server — трек B (модуль `stage`: сборка сводки)

- [ ] T6. **domain** — `modules/stage/domain/domain.go`: типы
      `LiveArenaState`, `NominationPhase`, `FeedBout`, `LiveArenaView`,
      `LiveNominationView`, `TournamentSnapshot`; аддитивные методы портов
      `ArenaProvider.ActiveArenas`, `NominationProvider.NominationsByTournament`,
      `BoutConductor.BoutTimesForPools`, `LiveNotifier.PublishTournamentChanged`,
      `LiveSubscriber.SubscribeTournament`; поля `ArenaRef.Position`,
      `NominationRef.Position`.
- [ ] T7. **рефактор публикации (при зелёных тестах)** — свести ~14 вызовов
      `s.liveBus.PublishNominationChanged(...)` в `service.go`/`seeding.go`/
      `bracket.go`/`schema.go` к одному хелперу
      `s.notifyNominationChanged(id)`; поведение не меняется, тесты зелёные
      до и после. **Только после этого** добавить внутрь хелпера парный
      `PublishTournamentChanged()`.
- [ ] T8. **testutil** — `modules/stage/testutil/*`: фейки новых методов
      портов (площадки с позициями, номинации турнира, времена боёв,
      топик турнира в fake-шине).
- [ ] T9. **service (red→green)** — `service/tournament_live_test.go`:
      площадка с идущим боем / с готовящимся пулом / свободная
      (AC-7..AC-9); черновая раскладка не попадает ни в ленту, ни в список
      номинаций (AC-10); фаза номинации из `execution_status` этапов;
      времена проставлены по состоянию боя (AC-11..AC-14);
      `BoutTimesForPools` вызван один раз на все пулы → затем
      `service/tournament_live.go` (+ passthrough `SubscribeTournament`).
- [ ] T10. **api (red→green)** — `api/handler_test.go` (httptest + Connect,
      fake-репо): `GetTournamentLive` отвечает без токена (NFR-3);
      `WatchTournamentLive` отдаёт первый кадр сразу и следующий по сигналу
      шины; поток закрывается по отмене контекста → затем `api/handler.go`
      (хендлеры + `toProtoTournamentSnapshot`).

## Web — трек C (чистые функции, без разметки)

- [ ] T11. **entities/tournament-live/lib (red→green)** — тесты на
      `phase.ts` (три фазы, AC-1/AC-6/AC-18), `feed.ts` (порядок FR-17,
      фильтр AC-15, подписи времени AC-11..AC-14, итог боя FR-15),
      `arena.ts` (подписи состояний), `counters.ts` (боёв проведено,
      площадок занято, номер дня турнира) → затем сами модули + `types.ts`
      (DTO снапшота).
- [ ] T12. **entities/{tournament,application}/lib (red→green)** — тесты на
      `daysUntil` (AC-2, «сегодня» в день старта) и
      `applicationsSummary` (AC-3/AC-4, номинация без вместимости) →
      затем реализация.

## Server — волна 2 (join)

- [ ] T13. **wiring** — `internal/platform`: `stage_arena_provider.ActiveArenas`
      (фильтр неархивных + позиция), `stage_nomination_provider.NominationsByTournament`,
      `stage_bout_conductor.BoutTimesForPools`, топик турнира в
      `stage_live_bus.go`; регистрация `GetTournamentLive`/
      `WatchTournamentLive` в `publicProcedures` интерсептора Auth
      (`platform.go`).
- [ ] T14. `make test` и `go build ./...` зелёные после слияния треков A и B.

## Web — трек D (BFF + живой хук)

- [ ] T15. **BFF (red→green)** — `app/api/tournament/live-snapshot/route.ts`
      + тест: маппинг `connect.Code` → HTTP, форма ответа.
- [ ] T16. **BFF (red→green)** — `app/api/tournament/live/route.ts` + тест:
      SSE-кадр, закрытие потока по обрыву клиента.
- [ ] T17. **features/tournament-live (red→green)** —
      `api/use-tournament-live.ts` + тест: переход на polling после серии
      ошибок SSE (AC-17); подписка не открывается в фазах `before` и
      `finished` (FR-23).

## Web — трек E (презентационные компоненты)

- [ ] T18. **афиша (red→green)** — рестайл
      `entities/tournament/ui/tournament-hero.tsx` под FR-3/FR-4
      (обратный отсчёт, скрытие пустых полей); компонент остаётся
      презентационным без хуков — его рендерит превью редактора 0029.
- [ ] T19. **карточки номинаций (red→green)** — рестайл
      `widgets/nominations-list/nominations-list.tsx` под FR-6..FR-8:
      полоса заполнения, «осталось K мест», «приём завершён» вместо кнопки
      (AC-3/AC-4/AC-5).
- [ ] T20. **блоки «до старта» (red→green)** — `widgets/home/`:
      `applications-summary.tsx` (FR-5), `join-steps.tsx` (FR-9),
      `venue-contacts.tsx` (FR-10/FR-22).
- [ ] T21. **блоки «идёт» (red→green)** — `widgets/home/`:
      `tournament-strip.tsx` (FR-12/FR-13 + подпись «завершён», AC-18),
      `arenas-now.tsx` + `arena-card.tsx` (AC-7..AC-9),
      `bout-feed.tsx` + `bout-feed-row.tsx` (FR-15..FR-18),
      `nominations-rail.tsx` (FR-20), `registration-closed.tsx` (FR-21).
- [ ] T22. **скелетон и пустые состояния** — `widgets/home/home-skeleton.tsx`
      в форме будущего контента (NFR-5, правила 0022/0023).

## Web — волна 4 (join)

- [ ] T23. **композиция (red→green)** — `widgets/home/home-screen.tsx`
      (единственный `useTournamentLive`, выбор блоков по фазе) +
      `entities/tournament-live/model/get-tournament-live.ts` (SSR) +
      `app/page.tsx`, сведённый к server-обёртке. Тесты: заглушка без
      турнира (AC-19); «до старта» не рендерит площадки и ленту (AC-1);
      «идёт» не рендерит сводку заявок и «Как участвовать» (AC-6); первый
      рендер идёт по SSR-снапшоту без подписки (NFR-1/AC-20).

## Проверка

- [ ] T24. `make test-all` зелёный.
- [ ] T25. `pnpm exec tsc --noEmit`.
- [ ] T26. `go build ./...` + `pnpm build`.
- [ ] T27. **Регресс живого превью редактора турнира** (0029, FR-3) после
      рестайла `tournament-hero.tsx` — превью и главная показывают одно и
      то же; проверить руками на `/admin/tournament`.
- [ ] T28. Обновить статусы `spec.md`/`plan.md`/`tasks.md` и строку в
      `docs/specs/README.md`. Строка «Публичная главная v2» в
      `docs/design-sync.md` уже исправлена при написании спеки (там стояло
      «новый API нужен? — нет»); при реализации сверить её с фактом —
      если repo-пути разъехались с планом, поправить, а не оставлять карту
      протухать.
