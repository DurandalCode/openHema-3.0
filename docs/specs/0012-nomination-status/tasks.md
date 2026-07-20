# Tasks: Статусная модель номинации

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: done
- Дата: 2026-07-20
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах.

## Треки и параллельность

После контрактов — четыре дизъюнктных по файлам куска: три server-модуля
(`nomination`, `pool`, `application`) и весь web-слой. Все три модуля
тестируются на fake-портах своих межмодульных зависимостей (у `pool` и
`application` уже есть fake `NominationProvider`, только расширяются), поэтому
ни один не ждёт реальной реализации соседей. Web работает на моках BFF (как в
0011, трек B) — не ждёт сервера вовсе. Реальная склейка (адаптеры
`internal/platform`, которым нужны типы из `nomination`+`pool`+`application`
одновременно) и интеграционный тест миграции — join-волна после мержа всех
трёх server-треков.

| Волна | Трек | Задачи | Файлы (не пересекаются внутри волны)              | Зависит от |
| ----- | ---- | ------ | -------------------------------------------------- | ---------- |
| 0     | —    | T1     | `proto/hema/v1/nomination.proto` + `make generate` | —          |
| 1     | A    | T2–T7  | `server/modules/nomination/**`                     | волна 0    |
| 1     | B    | T8–T10 | `server/modules/pool/**`                           | волна 0    |
| 1     | C    | T11–T13| `server/modules/application/**`                    | волна 0    |
| 1     | D    | T14–T18| `web/**`                                           | волна 0    |
| 2     | join | T19–T21| `server/internal/platform/**`, integration-тест    | A, B, C смержены |
| 3     | —    | T22–T25| проверка/сборка/индекс                             | всё смержено |

## Контракты

- [x] T1. `proto/hema/v1/nomination.proto`:
      - новый enum `NominationStatus` (`UNSPECIFIED/OPEN/CLOSED/ACTIVE/
        FINISHED` — последние два зарезервированы, без переходов);
      - `Nomination.status` (поле 10);
      - `NominationAdminService`: `CloseRegistration`/`ReopenRegistration` +
        их Request/Response (пара `{id}`/`{nomination}`).
      - `make generate` (Go + TS). _(контракты — не TDD-шаг, идут первыми.)_

## Server — трек A (`nomination`)

- [x] T2. **migrations** — `nomination/migrations/00002_registration_status.sql`:
      колонки `status TEXT NOT NULL DEFAULT 'open'`, `closed_reason TEXT NULL`,
      `has_distributed_fighters BOOLEAN NOT NULL DEFAULT false`; констрейнты
      `chk_nominations_status`, `chk_nominations_closed_reason`,
      `chk_nominations_closed_reason_presence` (см. `plan.md`). Down —
      дропнуть три колонки + констрейнты.
- [x] T3. **domain** — `nomination/domain/domain.go`: `Status`/`ClosedReason`
      типы+константы; `Nomination.{Status,ClosedReason,HasDistributedFighters}`;
      `ErrCannotReopen`; `Repository.SetRegistrationState(ctx, id, status,
      reason, hasDistributed) (Nomination, error)`.
- [x] T4. **testutil** — `nomination/testutil/fake_repo.go`: реализовать
      `SetRegistrationState` (in-memory), `var _ domain.Repository = …` не
      ломается.
- [x] T5. **service (red→green)** — `nomination/service/service_test.go`:
      - `Create` → `Status == StatusOpen` (AC-1);
      - `CloseRegistration`: open→closed(manual) (AC-3); идемпотентный no-op
        на уже closed **любой** причины, `ClosedReason` не перезаписывается
        (регрессия из «Риски» plan.md);
      - `ReopenRegistration`: closed(manual, !hasDistributed)→open (AC-4);
        `ErrCannotReopen` при closed(drawing) (AC-9); `ErrCannotReopen` при
        closed(manual, hasDistributed=true) (AC-16); идемпотентный no-op на
        уже open;
      - `SyncRegistrationState`: open+true→closed(drawing) (AC-7 серверная
        часть); closed(drawing)+false→open (AC-10); closed(manual)+false —
        статус/причина не меняются, `HasDistributedFighters` обновляется
        (AC-11); closed(manual)+true — то же с `true` (AC-16 сценарий).
      Затем `nomination/service/service.go`: `CloseRegistration`,
      `ReopenRegistration`, `SyncRegistrationState`.
- [x] T6. **repo (red→green)** — `nomination/repo/queries/nomination.sql`:
      добавить `status, closed_reason, has_distributed_fighters` в
      `ListNominationsByTournament`/`GetNomination`/`CreateNomination`
      (SELECT/RETURNING); новый `SetRegistrationState :one`. `make sqlc`;
      `nomination/repo/repo.go` — implement `SetRegistrationState`, обновить
      `toDomain`.
- [x] T7. **api (red→green)** — `nomination/api/handler_test.go`:
      `CloseRegistration`/`ReopenRegistration` (счастливый путь + маппинг
      `ErrCannotReopen → FailedPrecondition`); `RequireAdmin` на обоих
      (AC-13); `ListNominations`/`GetNomination` отдают `status` без токена
      (AC-2). Затем `nomination/api/handler.go`: RPC-обёртки,
      `toProtoNomination` мапит `Status→NominationStatus` (без
      `ClosedReason`/`HasDistributedFighters` — не существуют в proto),
      `mapError` — новая ветка.

## Server — трек B (`pool`)

- [x] T8. **domain** — `pool/domain/domain.go`: добавить в `NominationProvider`
      `SyncRegistrationState(ctx, nominationID string, hasDistributedFighters
      bool) error`.
- [x] T9. **testutil** — `pool/testutil/fake_nomination_provider.go`:
      реализовать `SyncRegistrationState` (пишет в map) + `LastSynced(nominationID)
      (value bool, called bool)` для ассертов.
- [x] T10. **service (red→green)** — `pool/service/service_test.go`: спай
      `SyncRegistrationState` получает `true` после первого `AssignFighter`
      на пустой раскладке (AC-7), не вызывается на `CreatePool` пустых пулов
      (AC-8); `false` после `UnassignFighter`/`DeletePool`/`ResetLayout`,
      опустошающих раскладку (AC-10 серверная часть); `true` после первого
      `AutoDistribute`; не вызывается на no-op ветках `AutoDistribute`/
      `ResetLayout` (пусто/нечего); все три вида `Undo` (`auto`/`delete_pool`/
      `reset`), пересекающие границу 0↔≥1 в любую сторону, зовут sync с
      верным значением (регрессия на пробел FR-10 из ревалидации спеки).
      Затем `pool/service/service.go`: `loadLayoutAndSync`/`hasDistributed`
      хелперы; заменить финальный `loadLayout` на `loadLayoutAndSync` в
      `DeletePool`/`ResetLayout`/`AssignFighter`/`UnassignFighter`/
      `AutoDistribute`/`Undo`.

## Server — трек C (`application`)

- [x] T11. **domain** — `application/domain/domain.go`:
      `NominationInfo.RegistrationOpen bool`; `ErrRegistrationClosed`.
- [x] T12. **service (red→green)** — `application/service/service_test.go`:
      `Submit` в номинацию с `RegistrationOpen=false` → `ErrRegistrationClosed`
      до `ActiveExists`/repo-записи (AC-6); `DeclarePayment`/`ConfirmPayment`/
      `Register`/`Withdraw` не читают `RegistrationOpen`, работают как раньше
      (AC-15). Затем `application/service/service.go`, `Submit` — гейт сразу
      после резолва `NominationInfo`.
- [x] T13. **api (red→green)** — `application/api/handler_test.go`:
      `SubmitApplication` → `FailedPrecondition` при закрытой номинации (через
      fake `NominationProvider`). Затем `application/api/handler.go`,
      `mapError`: `ErrRegistrationClosed → connect.CodeFailedPrecondition`.

## Web — трек D (на моках BFF)

- [x] T14. **entities + serialize** — `entities/nomination/lib/types.ts`:
      `NominationStatus` тип, `nominationStatusLabel()`, `Nomination.status`.
      `lib/grpc/serialize.ts`, `nominationToJson` — маппинг `status`
      (+ тест-кейс в `lib/grpc/serialize.test.ts`).
- [x] T15. **BFF (red→green)** — новые роуты + тесты:
      `app/api/nominations/[id]/close-registration/route.ts`,
      `.../reopen-registration/route.ts` (`POST`, только admin, по образцу
      `app/api/admin/arenas/[id]/archive/route.ts`) + `*.test.ts` (мок grpc,
      маппинг `connect.Code`→HTTP). Расширить существующий
      `app/api/nominations/[id]/pool-status/route.ts` GET: посчитать
      `hasDistributedFighters` из уже полученного `layout.pools` (без нового
      gRPC-вызова) + обновить `route.test.ts`.
- [x] T16. **features/nomination-management api** — `api/requests.ts`:
      `closeRegistrationRequest`/`reopenRegistrationRequest`; расширить
      `getPoolLayoutStatusRequest`/`PoolLayoutStatus` полем
      `hasDistributedFighters` (+ тесты `requests.test.ts`). Новые
      `api/use-close-registration.ts`/`api/use-reopen-registration.ts`
      (мутации, инвалидируют `nominationManagementKeys.list`).
- [x] T17. **features/nomination-management ui** — `ui/nomination-management.tsx`:
      `NominationStatusBadge`; чистые функции `canClose(status)`/
      `canReopen(status, hasDistributedFighters)` (+ юнит-тест таблицей
      истинности, FR-9/AC-12/AC-16) — вынести в `api/requests.ts` или соседний
      файл, чтобы тестировать без рендера компонента; кнопки «Закрыть/Открыть
      приём» в `NominationRow`.
- [x] T18. **публичные экраны** — `widgets/nominations-list/nominations-list.tsx`:
      бейдж статуса при `status !== OPEN`; `SubmitApplicationButton` — условие
      `status === OPEN`, иначе текст «Приём заявок завершён» для
      аутентифицированных (AC-14). `app/nominations/[id]/page.tsx`: тот же
      бейдж рядом с `<h1>`.

## Join — трек platform (волна 2)

- [x] T19. **`internal/platform/nomination_provider.go`** (адаптер для
      `application`): `info.RegistrationOpen = n.Status == nomdomain.StatusOpen`.
- [x] T20. **`internal/platform/pool_nomination_provider.go`** (адаптер для
      `pool`): реализовать `SyncRegistrationState`, проксируя на
      `nomservice.Service.SyncRegistrationState`.
- [x] T21. **интеграционный** — `nomination/integration`: миграция
      применяется; `chk_nominations_closed_reason_presence` реально блокирует
      рассинхрон `status`/`closed_reason` на уровне PG (testcontainers).

## Проверка (волна 3)

- [x] T22. `make test-all` зелёный.
- [x] T23. `pnpm exec tsc --noEmit` (менялись protobuf-моки/типы).
- [x] T24. `go build ./...` + `pnpm build`; миграция `nomination` проверена в
      полном докеризованном стеке (`docker compose up --build`).
- [x] T25. Обновить статусы `spec.md`/`plan.md`/`tasks.md` на `done`; строка
      0012 в `docs/specs/README.md`.

_Порядок сохранён: контракты → server снизу вверх (по трекам) → web →
проверка. Треки A/B/C/D одной волны дизъюнктны по файлам; join-волна трогает
общие точки (платформа, интеграционный тест)._
