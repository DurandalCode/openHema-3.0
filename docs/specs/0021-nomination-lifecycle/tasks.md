# Tasks: ЖЦ номинации целиком — статусы, итоговый протокол, призёры

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: done
- Дата: 2026-08-10
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах.

## Треки и параллельность

Три дизъюнктных по файлам куска после контрактов: модуль `nomination` (вторая
ось состояния), чистые функции `stage/domain` (протокол и статусы) и web.
Все три опираются только на сгенерированные из proto типы и друг друга не
ждут.

**Важно для трека B:** изменение порта `NominationProvider` (переименование в
`SyncNominationState`) в трек **не входит** — оно ломает компиляцию
`stage/service`, `stage/testutil` и `internal/platform`, которых трек B не
касается. Порт и вся обвязка правятся в join-волне. Трек B добавляет только
новые типы и функции — аддитивно.

| Волна | Трек | Задачи   | Файлы (не пересекаются внутри волны)                       | Зависит от            |
| ----- | ---- | -------- | ---------------------------------------------------------- | --------------------- |
| 0     | —    | T1       | `proto/hema/v1/*.proto`                                     | —                     |
| 1     | A    | T2–T6    | `server/modules/nomination/**`                              | волна 0               |
| 1     | B    | T7–T10   | `server/modules/stage/domain/results.go` + его тесты        | волна 0               |
| 1     | C    | T11–T14  | `web/src/**`                                                | волна 0               |
| 2     | join | T15–T20  | `stage/{domain/domain.go,service,api,testutil}`, `internal/platform`, `*/integration` | треки A и B смержены |
| 3     | —    | T21–T25  | проверка, документация                                      | волна 2               |

## Контракты

- [x] **T1.** `proto/hema/v1/stage.proto` — `enum StageStatus`;
      `Stage.execution_status`; `NominationResultEntry` (`place_from`/
      `place_to`), `NominationResultsSection`, `NominationResults`;
      `NominationLiveSnapshot.results`; RPC `GetNominationResults` +
      Request/Response. `proto/hema/v1/nomination.proto` — только комментарий
      у `NominationStatus` (ACTIVE/FINISHED перестают быть закладками).
      Затем `make generate` и `go tool buf lint`.
      _(контракты — не TDD-шаг, но идут первыми: от них зависят типы.)_

## Трек A — модуль `nomination`: ось исполнения

- [x] **T2. domain (red→green)** — `modules/nomination/domain/domain.go`:
      `ExecutionState` (`none`/`active`/`finished`), поле
      `Nomination.Execution`, метод `PublicStatus()`, метод порта
      `Repository.SetExecutionState`. Тест: `domain/domain_test.go` —
      `PublicStatus` вытесняет регистрационный статус при `active`/`finished`
      и отдаёт `Status` при `none` (spec NFR-4).
- [x] **T3. testutil** — `modules/nomination/testutil/fake_repo.go`:
      реализация `SetExecutionState`, хранение оси
      (`var _ domain.Repository = (*FakeRepo)(nil)`).
- [x] **T4. service (red→green)** — `service/service_test.go`:
      `SyncExecutionState` пишет ось идемпотентно; `SyncRegistrationState`,
      `CloseRegistration`, `ReopenRegistration` не изменились в поведении
      (регресс 0012, AC-13) → затем `service/service.go`.
- [x] **T5. repo + миграция** — `repo/queries/nomination.sql`
      (`SetExecutionState :one`, `execution_state` во всех `SELECT`/
      `RETURNING`), `make sqlc`, `repo/repo.go`;
      `migrations/00003_execution_state.sql` — DDL из `plan.md` (колонка +
      CHECK, сужение `chk_nominations_status` до `open`/`closed`).
- [x] **T6. api (red→green)** — `api/handler_test.go`: номинация с
      `Execution == active` отдаётся как `NOMINATION_STATUS_ACTIVE` во всех
      RPC модуля → затем маппер в `api/handler.go` (`PublicStatus()`).

## Трек B — `stage/domain`: чистые функции протокола и статусов

- [x] **T7. типы + статус этапа (red→green)** —
      `domain/results_test.go`: `ComputeStageStatus` — draft; ready без боёв;
      active; finished; finished при пустом контейнере (AC-16); контейнер
      сетки, завершённый одними баями. `ComputeNominationExecution` — пусто /
      смесь / всё завершено (AC-1..AC-3) → затем `domain/results.go`
      (`StageStatus`, `NominationExecution`, `StageContainer`, обе функции).
- [x] **T8. терминальные этапы (red→green)** — тест: линейная схема, две
      параллельные ветки (AC-9), несимметричные ветки (ADR 0014 §1) →
      `TerminalStages`.
- [x] **T9. места сетки (red→green)** — тест: сетка на 8 с боем за 3-е —
      `1`, `2`, `3`, `4`, четыре `5–8` (AC-6); без боя за 3-е — две `3–4`
      (AC-7); шесть посеянных в сетке на 8 — выбывшие в первом круге всё
      равно `5–8` (AC-8); сетка на 4; недоигранная сетка не паникует →
      `ComputeBracketPlaces`.
- [x] **T10. места группового этапа (red→green)** — тест: одна группа с
      двумя равными → `1`, `2–3`, `2–3`, `4` (AC-10); несколько групп →
      сводный порядок в диапазонах, `PlacesFromOverallOrder = true` (AC-11)
      → `ComputeGroupPlaces` (обёртка над `ComputeOverallOrder`).

## Трек C — web

- [x] **T11. BFF (red→green)** — `app/api/nominations/[id]/results/route.test.ts`
      (mock транспорта connect-es, маппинг `connect.Code` → HTTP) → затем
      `route.ts` (Node runtime, публичный, без токена).
- [x] **T12. entities (red→green)** — `entities/nomination/lib/types.ts`:
      подписи «идёт»/«завершена» + тест;
      `entities/nomination-results/lib/types.ts`: `formatPlace` (`5–8` против
      `5`), `podium` (диапазон `3–4` → обе строки), `hasPlaces` + тесты;
      `model/get-nomination-results.ts` (server-only fetch).
- [x] **T13. widget** — `widgets/nomination-results/`: секции, пьедестал
      (NFR-3 — крупно), таблица «место — боец — клуб — происхождение»,
      оговорка при `placesFromOverallOrder` (FR-12), пропс `showUnfinished`
      (FR-15/FR-19) + тест фильтрации секций.
- [x] **T14. страницы** — публичная `app/nominations/[id]/page.tsx`: блок
      итогов выше пулов, данные из живого снапшота (FR-17/FR-18 — рендер
      внутри клиентского дерева `useNominationLive`, не отдельным серверным
      блоком); админская `app/(admin)/admin/nominations/[id]/stages/page.tsx`
      — тот же виджет с `showUnfinished`.

## Волна 2 — join (после мержа треков A и B)

- [x] **T15. порт** — `stage/domain/domain.go`: `NominationProvider.SyncRegistrationState`
      → `SyncNominationState(ctx, id, hasDistributedFighters, execution)`;
      `Stage.ExecutionStatus`. Обновить `stage/testutil/fake_nomination_provider.go`
      (запоминать обе оси).
- [x] **T16. service: протокол (red→green)** — `service/results_test.go`
      (fake-репо): `NominationResults` собирает секции по терминальным
      этапам, прячет места недоигранных (AC-12), заполняет
      `PlacesFromOverallOrder` → затем `service/results.go`
      (`stageStatuses`, `NominationResults`, вынос `groupsWithStandings` из
      `sourceGroupsForRule`).
- [x] **T17. service: синхронизация (red→green)** — тесты на каждый
      мутирующий путь: `active` после `StartCurrentBout` (AC-1), `finished`
      после последнего `FinishCurrentBout` (AC-3), назад в `active` после
      `ReopenCurrentBout` (AC-4), `active` при `CreateStage` и `finished`
      после `DeleteStage` (AC-5), не `finished` при недоигранном этапе
      (AC-2) → затем `syncNomination` и его вызовы в `service/service.go`,
      `bracket.go`, `schema.go`, `seeding.go` (список точек — в `plan.md`).
- [x] **T18. service: снапшот и статус этапа** — `NominationLive` заполняет
      `Results`; `stagesForRead`/`StagesForNomination` проставляют
      `Stage.ExecutionStatus` + тесты.
- [x] **T19. api (red→green)** — `api/handler_test.go`: `GetNominationResults`
      (счастливый путь + `NotFound`), `execution_status` в `ListStages`,
      `results` в `GetNominationLive` → затем хендлер и мапперы в
      `api/handler.go`. Добавить RPC в `publicProcedures` интерсептора `Auth`.
- [x] **T20. wiring** — `internal/platform/stage_nomination_provider.go`:
      `SyncNominationState` → `SyncRegistrationState` + `SyncExecutionState`.

## Волна 3 — проверка

- [x] **T21. интеграционные (`nomination`)** — миграция 00003 применяется,
      `execution_state` читается/пишется, публичный `GetNomination` отдаёт
      `ACTIVE` после push'а.
- [x] **T22. интеграционные (`stage`)** — сквозной сценарий: группы →
      доиграть → сформировать сетку → доиграть → номинация `FINISHED` +
      протокол; пересмотр результата возвращает `ACTIVE` (AC-3/AC-4).
- [x] **T23.** `make test-all` зелёный; `make test-integration` (Docker).
- [x] **T24.** `pnpm exec tsc --noEmit`; `go build ./...` + `pnpm build`.
- [x] **T25.** Обновить статус спеки/плана/задач и строку в
      `docs/specs/README.md`; отметить в ADR 0014, что инкремент 0021
      реализован (план закрыт целиком).

_Ручная проверка перед закрытием (по образцу 0015): `make demo-bouts`,
доиграть номинацию до конца в браузере — призёры появляются на публичной
странице без перезагрузки (FR-18), пересмотр результата убирает их (AC-4)._
