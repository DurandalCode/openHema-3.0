# Tasks: Плейофф-сетка с ручным посевом (playoff bracket)

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: draft
- Дата: 2026-08-03
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах.

## Треки и параллельность

| Волна | Трек | Задачи | Файлы (не пересекаются внутри волны) | Зависит от |
| ----- | ---- | ------ | ------------------------------------- | ---------- |
| 0     | —    | T1–T2  | `proto/hema/v1/stage.proto`, `server/modules/stage/migrations/` | — |
| 1     | A    | T3–T5  | `server/modules/stage/domain/**`      | волна 0    |
| 1     | B    | T6–T8  | `server/modules/bout/**`              | волна 0    |
| 1     | C    | T9–T10 | `web/src/entities/bracket/**`, `web/src/widgets/bracket-view/**` | волна 0 |
| 2     | join | T11–T19 | `server/modules/stage/{repo,service,api,testutil,integration}/**`, `server/internal/platform/**` | треки A и B смержены |
| 3     | D    | T20–T22 | `web/src/app/api/**`, `web/src/lib/grpc/serialize.ts` | волна 2 |
| 3     | E    | T23–T25 | `web/src/features/**`, `web/src/entities/stage/**` | волна 2 (типы) + трек C |
| 4     | join | T26–T31 | страницы `web/src/app/(admin)/**`, `web/src/app/nominations/**`, демо-сид, проверка | треки D и E смержены |

Трек C стартует на фикстурах (виджет сетки — чистое отображение пропсов), не
дожидаясь сервера. Трек B трогает только модуль `bout`; адаптер
`internal/platform` — join-волна, потому что он ссылается на типы обоих
модулей. Интеграционные тесты (T19) остаются в серверной волне: они
проверяют миграцию и инварианты БД и не должны ждать web.

## Контракты

- [x] T1. `proto/hema/v1/stage.proto` — `STAGE_TYPE_BRACKET`, `BracketConfig`,
      `Stage.status`/`Stage.bracket`, `Pool.stage_id`, `BracketSlotState`,
      `BracketSlot`/`BracketPair`/`BracketHalf`/`BracketRound`/`Bracket`;
      шесть новых RPC (`ListStages`, `CreateStage`, `DeleteStage`,
      `GetBracket`, `SeedBracketSlot`, `ClearBracketSlot`); переезд запросов
      раскладки с `nomination_id` на `stage_id`;
      `NominationLiveSnapshot.brackets`. Слот адресуется полем `slot`
      (не `position`) везде — в `BracketSlot` и в запросах. Затем
      `make generate`.
      _(контракты — не TDD-шаг, но идут первыми: от них зависят типы.)_
- [x] T2. `server/modules/stage/migrations/00002_bracket.sql` (goose) — тип
      `bracket` в `chk_stages_type`, колонки `bracket_size`/`third_place`
      с `chk_stages_bracket`, `pool_members.slot` + `uq_members_pool_slot`.
      Прогнать `make migrate` и откат `migrate-down` на локальной БД.

## Server — трек A (домен сетки)

- [x] T3. **domain (red→green)** — `modules/stage/domain/bracket_test.go` →
      `bracket.go`: `BracketConfig`, `Seed`, `Slot`/`Pair`/`Half`/`Round`,
      `BracketView`, `ResolveBracket`. Таблица случаев: размеры 4/8/16/32,
      полный посев, недобор с баем, каскад бая, продвижение победителя,
      pending-метки пары-источника, бронза (в т.ч. полуфинал-бай), чемпион,
      «половина завершена» (план, правила 1–7).
- [x] T4. **domain — координаты и подписи (red→green)** — там же:
      `RoundTitle`, `RoundCount`, `ValidBracketSize`, `HalvesInRound`,
      `ContainerNumberOf`/`ContainerCoords` (взаимная обратимость),
      `PairOfBout`, `HalfOfSlot`, `ContainerTitle` (FR-19a),
      `SourceLabel` (FR-13).
- [x] T5. **domain — типы и порты** — `modules/stage/domain/domain.go`:
      `StageTypeBracket`, `Stage.Bracket`, `Pool.StageID`, новые ошибки
      (`ErrStageTypeMismatch`, `ErrDrawNotAllowed`, `ErrDownstreamStarted`,
      `ErrSlotOccupied`, `ErrStageNotDeletable`, `ErrNotEnoughSeeds`),
      `UndoState` со слотами (`ResetMember`), расширение портов
      `Repository` (`CreateStage`/`DeleteStage`/`MaxStagePosition`/
      `SeedSlot`/`SeedsByStage`/`DeleteContainers`, `slot` в
      `AssignFighter`) и `BoutConductor` (`ScheduleBout`/`DeleteBouts`).
      Red — несобирающийся `service` на следующем шаге.

## Server — трек B (модуль `bout`)

- [ ] T6. **порт и фейк (red→green)** — `modules/bout/domain/domain.go`:
      `ReplaceForNomination` → `ReplaceForPools(poolIDs, bouts)`,
      `ScheduleBouts`, `DeleteBouts` в порту `Repository`;
      `modules/bout/testutil/fake_repo.go` — реализация новых методов.
- [ ] T7. **service (red→green)** — `modules/bout/service/service_test.go`:
      `GenerateForStage` через `ReplaceForPools` **не трогает бои пулов
      другого этапа той же номинации** (регресс на латентный баг 0017);
      `ScheduleBout` создаёт поток с событием `scheduled` и заданными
      round/sequence; `DeleteBouts` удаляет только перечисленные потоки →
      затем `service.go`.
- [ ] T8. **repo (PG)** — `modules/bout/repo/repo.go`: `ReplaceForPools`
      (delete by pools + insert в одной транзакции), `ScheduleBouts`,
      `DeleteBouts` (каскад событий на уровне БД).

## Web — трек C (отображение сетки)

- [ ] T9. **entities/bracket** — `web/src/entities/bracket/lib/types.ts`
      (`Bracket`, `BracketRound`, `BracketHalf`, `BracketPair`,
      `BracketSlot`, `BracketConfig`) + `lib/labels.ts` (подписи состояний
      слота/половины) + тесты меток.
- [ ] T10. **widgets/bracket-view (red→green)** —
      `web/src/widgets/bracket-view/bracket-view.test.tsx` на фикстурах:
      круги → половины → пары; подпись пары-источника у pending; «бай» у
      пустого слота; счёт и состояние боя; площадка и статус половины;
      чемпион и бронза; сетка на 32 не переполняет контейнер по ширине
      (NFR-2) → затем `bracket-view.tsx`.

## Server — волна 2 (join: repo → service → api → wiring)

- [ ] T11. **testutil** — `modules/stage/testutil/fake_repo.go` +
      `fake_bout_conductor.go`: новые методы порта (посев со слотами,
      этапы, контейнеры, `ScheduleBout`/`DeleteBouts`), `var _
      domain.Repository = (*FakeRepo)(nil)`.
- [ ] T12. **service — этапы (red→green)** —
      `modules/stage/service/bracket_test.go`: `CreateStage` (позиция
      `max+1`, две половины первого круга, валидация размера, отказ для
      `GROUPS`), `DeleteStage` (гейты «только сетка» и «нет начатых боёв»),
      `ListStages` (материализация группового этапа) → затем
      `service/bracket.go`.
- [ ] T13. **service — посев (red→green)** — там же: `SeedBracketSlot`
      (диапазон слота, выбор контейнера по `HalfOfSlot`, обмен местами,
      `ErrSlotOccupied`), `ClearBracketSlot`, `ResetLayout`/`Undo` на
      сетке (снапшот со слотами), `GetBracket` (резолв + `unassigned`,
      **без** материализации).
- [ ] T14. **service — фиксация и материализация (red→green)** — там же:
      `SetStatus` для сетки (гейт `< 2` посеянных; создание контейнеров
      кругов ≥ 2; `syncBracket` формирует бои только полных пар; баи
      продвигаются без боя), расфиксация (бои и контейнеры ≥ 2 удаляются,
      посев остаётся), `computeHalfStatus`.
- [ ] T15. **service — ведение (red→green)** —
      `modules/stage/service/service_test.go`: ничья в сетке отклоняется
      (`ErrDrawNotAllowed`), в группе — нет; завершение боя материализует
      следующую пару; `Reopen`/`Reset` снимают продвижение и удаляют
      неначатый бой; начатый следующий бой → `ErrDownstreamStarted`;
      `CreatePool`/`AutoDistribute` на сетке → `ErrStageTypeMismatch`.
- [ ] T16. **service — реконсиляция и подпись контейнера (red→green)** —
      `PruneMembers` не трогает зафиксированные сетки, в черновике работает
      как раньше (AC-16, FR-22); `Pool.Name` заполняется сервисом через
      `ContainerTitle` — «Пул N» у группы, «1/4 финала, верхняя половина» у
      сетки (FR-19a), в т.ч. в списке готовых контейнеров для площадки.
- [ ] T17. **service — переезд адресации** — `service.go`: методы раскладки
      принимают `stageID`; `stageForWrite` → `StageByID`; `NominationLive`
      отдаёт `brackets`; `ListPublicPools` — только групповые контейнеры;
      регресс-тесты групповых сценариев не меняют **ожиданий** (FR-23).
- [ ] T18. **repo** — `modules/stage/repo/queries/stage.sql` (`CreateStage`,
      `DeleteStage`, `MaxStagePosition`, `SeedsByStage`, `SeedSlot` с
      обменом в транзакции, `DeleteContainers`, `slot` в `AssignFighter`,
      исключение зафиксированных сеток в `PruneMembers`); `make sqlc`;
      `repo/repo.go` — реализация порта.
- [ ] T19. **api + wiring + интеграционные (red→green)** —
      `modules/stage/api/handler_test.go`: шесть новых RPC (счастливый путь
      + коды ошибок), существующие RPC на `stage_id`, `brackets` в живом
      снапшоте → затем `handler.go` (мапперы `bracketToProto`/`stageToProto`/
      `poolToProto`, `poolName` уходит в сервис);
      `internal/platform/stage_bout_conductor.go` — `ScheduleBout`/
      `DeleteBouts`; `modules/stage/integration/` (testcontainers):
      миграция `00002` применяется, `uq_members_pool_slot`,
      `chk_stages_bracket` не пропускает `groups` с размером, удаление
      этапа каскадит контейнеры и членства, посев переживает
      фиксацию/расфиксацию.

## Web — трек D (BFF)

- [ ] T20. **serialize (red→green)** — `web/src/lib/grpc/serialize.ts`:
      `stageToJson` (+`status`/`bracket`), `poolToJson` (+`stageId`),
      новый `bracketToJson`, `nominationLiveToJson` (+`brackets`) с тестами.
- [ ] T21. **BFF — этапы (red→green)** —
      `app/api/nominations/[id]/stages/route.ts` (GET/POST),
      `app/api/stages/[stageId]/route.ts` (DELETE) + `*.test.ts`: маппинг
      `connect.Code` → HTTP, admin-гейт.
- [ ] T22. **BFF — состав и сетка (red→green)** —
      `app/api/stages/[stageId]/{layout,pools,reset,assign,unassign,distribute,undo,status,bracket,seed}/route.ts`
      + тесты; удалить `app/api/nominations/[id]/pool-*`.

## Web — трек E (фичи)

- [ ] T23. **features/stage-management (red→green)** — `api/` (список,
      создание, удаление) + `ui/` (карточки этапов, диалог создания:
      название, размер 4/8/16/32, флаг боя за 3-е место) с тестами на
      fetch-моках.
- [ ] T24. **features/bracket-seeding (red→green)** — `api/` (посев,
      освобождение слота, reset, undo, фиксация) + `ui/` (DnD `@dnd-kit`:
      нераспределённые слева, пары первого круга по половинам справа;
      занятый слот; фиксация с ошибкой «меньше двух посеянных») с тестами.
- [ ] T25. **features/nomination-pools — переезд на `stage_id`** —
      `api/requests.ts`, ключи RQ, хуки; `entities/stage/lib/types.ts`
      (+`status`, `bracket`); UI-ожидания существующих тестов **не
      меняются** (FR-23).

## Волна 4 — страницы, сид, проверка

- [ ] T26. **страницы админки** —
      `app/(admin)/admin/nominations/[id]/stages/page.tsx` (список этапов +
      добавление) и `.../stages/[stageId]/page.tsx` (групповой этап →
      существующий экран раскладки, сетка → посев/сетка); удалить
      `.../[id]/pools/page.tsx`; поправить ссылки в списке номинаций.
- [ ] T27. **публичный экран** — `app/nominations/[id]/page.tsx` +
      `widgets/nomination-pools-public`: группы как раньше, сетки — через
      `widgets/bracket-view` из живого снапшота; тест на рендер обоих типов
      этапов (AC-12).
- [ ] T28. **демо-сид** — `server/internal/demoseed` + `cmd/demo-bouts`:
      номинации добавляется этап-сетка с частично сыгранными половинами
      кругов (проверка AC-5a/AC-11 в браузере одним `make demo-bouts`).
- [ ] T29. `make test-all` зелёный; `pnpm exec tsc --noEmit`;
      `go build ./...` + `pnpm build`.
- [ ] T30. **Регресс на реальном стеке** — `docker compose up --build`
      (миграция `00002` в прод-образе), `make demo-bouts`, затем вручную:
      обе половины «1/4 финала» на двух площадках одновременно (AC-5a),
      табло и таймер (AC-5), ничья отклоняется (AC-6), продвижение
      победителя и пересмотр результата (AC-7/AC-8/AC-9), публичный экран
      живьём (AC-12), полный групповой сценарий без изменений (AC-17).
- [ ] T31. Обновить статус спеки/плана/`tasks.md` и строку в
      `docs/specs/README.md`; при необходимости — пометку в ADR 0014
      (инкремент 0018 выполнен, контейнер уточнён до половины круга).

_Порядок сохранён: контракты → server снизу вверх → web → проверка._
