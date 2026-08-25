# Tasks: Доменные пробелы, вскрытые редизайном

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: draft
- Дата: 2026-08-25
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах.

## Треки и параллельность

Девять дизъюнктных кусков после контрактов: пять серверных модулей
(`nomination`, `stage`, `bout`, `fighter`, `tournament` — каждый со своими
файлами, cross-module порты закрыты фейками в юнит-тестах, как в 0037) и
четыре web-куска (тесты на моках Connect-клиента, от готовности сервера не
зависят — тот же приём, что трек C в 0037). Wiring (`internal/platform`) и
сквозные интеграционные тесты трогают файлы нескольких треков — join-волна.

| Волна | Трек | Задачи  | Файлы (не пересекаются внутри волны)                                    | Зависит от |
| ----- | ---- | ------- | ------------------------------------------------------------------------ | ---------- |
| 0     | —    | T1      | `proto/hema/v1/{nomination,fighter,tournament}.proto`                    | —          |
| 1     | A    | T2–T4   | `server/modules/nomination/**`                                           | волна 0    |
| 1     | B    | T5–T9   | `server/modules/stage/**`                                                | волна 0    |
| 1     | C    | T10–T12 | `server/modules/bout/**`                                                 | волна 0    |
| 1     | D    | T13–T17 | `server/modules/fighter/**`                                              | волна 0    |
| 1     | E    | T18–T21 | `server/modules/tournament/**`                                           | волна 0    |
| 1     | F    | T22–T23 | `web/src/{app/api/nominations,features/nomination-management}`           | волна 0    |
| 1     | G    | T24–T26 | `web/src/{app/api/fighters,entities/fighter,features/fighter-management}` | волна 0   |
| 1     | H    | T27–T28 | `web/src/{entities/tournament,features/tournament-settings,widgets/home,widgets/tournament-about}` | волна 0 |
| 1     | I    | T29     | `web/src/{features/application-review,widgets/my-applications}` (публичная история заявки) | волна 0 |
| 2     | join | T30–T33 | `server/internal/platform/**`                                            | треки A–I смержены |

## Контракты

- [ ] T1. `proto/hema/v1/nomination.proto` — без изменений (гейт — доменная
      ошибка по тексту, не proto). `proto/hema/v1/fighter.proto` —
      `FindFighterByAccount`/`MergeFighters` RPC, `FIGHTER_STATUS_MERGED`,
      `Fighter.linked_account_id`/`linked_account_display_name`/
      `merged_into_id`. `proto/hema/v1/tournament.proto` —
      `TournamentProgramDay`/`TournamentProgramItem`, поле `program` в
      `Tournament` и `UpdateActiveTournamentRequest`. `make generate`.
      _(контракты — не TDD-шаг, но идут первыми: от них зависят типы.)_

## Трек A — `nomination`: гейт на удаление (сценарий 1)

- [ ] T2. **domain** — `nomination/domain/domain.go`: порты
      `PoolOccupancyChecker`/`BoutOccupancyChecker`, ошибки
      `ErrHasDistributedFighters`/`ErrHasBouts` (plan.md, «modules/nomination»).
- [ ] T3. **service (red→green)** — `service/service_test.go`: fake-чекеры
      на все четыре комбинации true/false → `Delete` отказывает/проходит
      корректно; happy path без изменений → `service.go` (`Deps` + условия
      перед `repo.Delete`).
- [ ] T4. **api (red→green)** — `api/handler_test.go`: обе ошибки маппятся в
      `connect.CodeFailedPrecondition` с различимым текстом → `handler.go`.

## Трек B — `stage`: адаптер гейта + память посева + репойнт (сценарии 1, 2, 3)

- [ ] T5. **migrations** — `migrations/00005_withdrawn_seeds.sql`: таблица
      `stage.withdrawn_seeds` (plan.md, DDL целиком).
- [ ] T6. **repo (red→green, testcontainers)** —
      `repo/queries/stage.sql`: `ExistsDistributedFighterForNomination`,
      `DraftMembershipsByFighter`, `CaptureWithdrawnSeed`,
      `RestoreWithdrawnSeed`, `RepointFighter` (pool_members),
      `RepointWithdrawnSeed`; `make sqlc`; тест на реальной PG (partial-unique
      и каскады) → `repo.go` — реализация.
- [ ] T7. **service (red→green)** — `service/service_test.go`:
      `OnFighterWithdrawn` переносит только `draft`-членства в память и
      удаляет их из `pool_members`, не трогает членства вне `draft`;
      `OnFighterReturned` восстанавливает при (`draft` + пул существует),
      иначе тихо освобождает память; `RepointFighter` переносит
      `pool_members` и `withdrawn_seeds` от source к target, коллизия по
      `uq_members_stage_fighter` не репойнтится молча (plan.md) → код.
- [ ] T8. **testutil** — `testutil/fake_repo.go`: методы новых операций
      порта in-memory.
- [ ] T9. **адаптеры** — `stage/occupancy_adapter.go`
      (`nomination/domain.PoolOccupancyChecker`),
      `stage/seeding_sink_adapter.go`
      (`fighter/domain.SeedingWithdrawalSink`), `stage/repoint_adapter.go`
      (`fighter/domain.StageRepointer`) — тонкие обёртки поверх
      `service.Service`, без собственных тестов сверх T7 (адаптер = прямой
      делегат).

## Трек C — `bout`: адаптер гейта + репойнт при слиянии (сценарии 1, 3)

- [ ] T10. **repo (red→green)** — `repo/queries/bout.sql`:
      `ExistsBoutForNomination`, `RepointFighter` (`fighter_a_id`/
      `fighter_b_id`, без изменения снапшота имени/клуба — plan.md,
      «Риски»); `make sqlc` → `repo.go`.
- [ ] T11. **service (red→green)** — тонкая обёртка сервиса над этими двумя
      репо-методами с тестом на fake-репо.
- [ ] T12. **адаптеры** — `bout/occupancy_adapter.go`
      (`nomination/domain.BoutOccupancyChecker`), `bout/repoint_adapter.go`
      (`fighter/domain.BoutRepointer`).

## Трек D — `fighter`: обратная проекция и слияние (сценарий 3), хуки withdraw/return (сценарий 2)

- [ ] T13. **migrations** — `migrations/00002_merge.sql`: `merged_into_id`,
      `chk_fighters_status_merge`, `chk_fighters_merged_into_when`,
      `idx_fighters_merged_into` (plan.md, DDL целиком).
- [ ] T14. **domain** — `domain/domain.go`: `StatusMerged`, `MergedIntoID`,
      порты `SeedingWithdrawalSink`/`StageRepointer`/`BoutRepointer`/
      `AccountDirectory`, ошибки `ErrSameFighter`/`ErrCrossTournamentMerge`/
      `ErrAlreadyMerged`.
- [ ] T15. **testutil** — `testutil/fake_repo.go` + новые fake-адаптеры
      (`FakeSeedingSink`, `FakeStageRepointer`, `FakeBoutRepointer`,
      `FakeAccountDirectory`) для сервисных тестов T16.
- [ ] T16. **service (red→green)** — `service/service_test.go`:
      `WithdrawFighter`/`ReturnFighter` вызывают `Seeding.OnFighterWithdrawn`/
      `OnFighterReturned`; `FindByAccount` (обёртка над `FindByOrigin`);
      обогащение `Roster`/`GetFighter` `LinkedAccountID`/
      `LinkedAccountDisplayName` батчем через `AccountDirectory`;
      `MergeFighters` — участия объединяются без дублей по номинации,
      `origin_user_id` снят у source, `status`/`merged_into_id`
      выставлены, `Stage.RepointFighter`/`Bout.RepointFighter` вызваны;
      `ErrSameFighter`/`ErrCrossTournamentMerge`/`ErrAlreadyMerged` → код.
- [ ] T17. **repo + api (red→green)** — `repo/queries/fighter.sql`:
      `MergeParticipations`, `ClearOriginUserID`, `SetMerged`; `make sqlc`
      → `repo.go`. `api/handler_test.go`: `FindFighterByAccount`,
      `MergeFighters` в `FighterAdminService`; регресс-тест границы
      ADR 0016 — `linked_account_*`/`merged_into_id` отсутствуют в ответах
      `FighterPublicService`/`FighterService` → `handler.go` (два разных
      Fighter-маппера, plan.md).

## Трек E — `tournament`: программа по дням (сценарий 5)

- [ ] T18. **migrations** — `migrations/00004_program.sql`:
      `tournament.program_days`/`tournament.program_items` (plan.md, DDL
      целиком).
- [ ] T19. **domain** — `domain/domain.go`: `ProgramDay`, `ProgramItem`,
      `Tournament.Program`, `UpdateInput.Program`.
- [ ] T20. **repo (red→green, testcontainers)** — full-replace `program`
      (пустой↔непустой↔другой набор) в той же транзакции, что уже
      full-replace делает для `contacts` → `repo.go`.
- [ ] T21. **service + api (red→green)** — валидация непустого `Text`
      каждого пункта (`service_test.go`) → `service.go`; маппинг proto↔domain
      `program` в `GetActiveTournament`/`UpdateActiveTournament`
      (`api/handler_test.go`) → `handler.go`.

## Трек F — web: гейт на удаление номинации (сценарий 1)

- [ ] T22. **BFF (red→green)** — `app/api/nominations/[id]/route.ts` (DELETE)
      + `*.test.ts` (mock grpc): различение двух `FailedPrecondition` по
      `err.rawMessage` → код ошибки в JSON вместо generic 409.
- [ ] T23. **UI** — `features/nomination-management/ui/nominations-screen.tsx`
      (+ тест): диалог удаления показывает конкретную причину отказа.

## Трек G — web: обратная проекция, слияние, тост восстановления посева (сценарии 2, 3)

- [ ] T24. **entities** — `entities/fighter/lib/types.ts`: `linkedAccountId`,
      `linkedAccountDisplayName`, `mergedIntoId`, `status: 'merged'`
      (+ тест парсера).
- [ ] T25. **BFF (red→green)** — `app/api/fighters/find-by-account/route.ts`,
      `app/api/fighters/merge/route.ts` + тесты (mock grpc).
- [ ] T26. **UI** — `features/fighter-management/ui/*` (+ тесты): бейдж
      привязанной учётки, форма поиска по учётке, диалог слияния
      (подтверждение — канон 0028/0038); тост после `ReturnFighter` —
      «восстановлен в пул N» / «не восстановлен» по факту положения бойца в
      рефетченном `Layout` (без нового API — plan.md, «Восстановление
      посева»).

## Трек H — web: программа турнира по дням (сценарий 5)

- [ ] T27. **entities** — `entities/tournament/lib/types.ts`: `program`
      (+ тест парсера).
- [ ] T28. **UI** — `features/tournament-settings/ui/*` (редактор дней/
      пунктов, + тест), `widgets/home/tournament-strip.tsx` и
      `widgets/tournament-about/tournament-about-screen.tsx` (блок
      программы, пустая — не рендерится, + тесты).

## Трек I — web: история заявки для заявителя (сценарий 4)

- [ ] T29. **UI** — публичная страница/диалог своей заявки подключает блок
      истории (переиспользует `application-history.tsx` из
      `application-review` — прямой импорт либо перенос в `entities/
      application`, решить по месту, plan.md) + тест: owner видит историю,
      чужая заявка — нет (BFF `route.test.ts` уже проверяет доступ,
      расширяется на присутствие `history` в ответе, если не покрыто).

## Join (после треков A–I)

- [ ] T30. **wiring** — `internal/platform`: конструирование
      `stage.PoolOccupancyAdapter`/`bout.BoutOccupancyAdapter` →
      `nomination.Deps`; `stage.SeedingSinkAdapter`/`stage.RepointAdapter`/
      `bout.RepointAdapter`/`auth.DisplayNameProvider` → `fighter.Deps`;
      порядок регистрации модулей (stage/bout до nomination и до fighter) —
      plan.md, «modules/fighter → wiring».
- [ ] T31. **интеграционные тесты (testcontainers)** — сквозной сценарий
      «удаление заблокировано → снять посев вручную → удаление проходит»
      (nomination+stage+bout реальные); сквозной «withdraw в draft → return
      → восстановлен в тот же пул» и «withdraw → стадия ушла из draft →
      return → нераспределён» (fighter+stage реальные); сквозной
      `MergeFighters` с реальным репойнтом в stage и bout.
- [ ] T32. `make test-all` зелёный; `pnpm exec tsc --noEmit`.
- [ ] T33. `go build ./...` + `pnpm build`; обновить статус спеки/плана/
      индекс в `docs/specs/README.md` (`0040` → `done`).
