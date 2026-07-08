# Tasks: Профиль турнира (single-tournament)

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: done
- Дата: 2026-07-07
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах.

## Контракты

- [x] T1. `proto/hema/v1/tournament.proto` — `TournamentService`
      (`GetActiveTournament` public) + `TournamentAdminService`
      (`UpdateActiveTournament` admin), сообщения `Tournament`, `Contact`,
      `ContactInput`, enum `ContactType`. `make generate`.
      `GetActiveTournament` добавлен в `publicProcedures` интерсептора Auth.

## Server

- [x] T2. **domain** — `modules/tournament/domain/domain.go`: сущности
      `Tournament` (с `HasEventAt`), `Contact`, `ContactInput`; `ContactType`
      + `ValidContactTypes`; порт `Repository`; ошибки `ErrNotFound`,
      `ErrInvalidInput`.
- [x] T3. **service (red→green)** — 10 service-тестов (GetActive happy/notfound,
      UpdateActive happy/замена контактов/нет eventAt/пустые контакты/пустой
      title/invalid type/empty value/no active) → `service.go` (trim+валидация).
- [x] T4. **testutil** — `fake_repo.go`: in-memory, `NewFakeRepoWithActive`,
      `var _ domain.Repository = (*FakeRepo)(nil)`.
- [x] T5. **repo** — `queries/tournament.sql` (5 запросов); запись в
      `sqlc.yaml` (модуль tournament); `make sqlc`; `repo.go` — `UpdateActive`
      в `pgx.Tx` (delete+insert контактов атомарно), сборка агрегата.
- [x] T6. **migrations** — `00001_init.sql`: схема `tournament`, таблицы
      `tournaments`+`contacts`, partial unique index `tournaments_one_active`,
      CHECK на type/position, сид одной активной строки.
- [x] T7. **api (red→green)** — 8 e2e-тестов (GetActive happy/no-token/
      notfound; UpdateActive happy/empty-title/no-token/non-admin/no-active) →
      `handler.go` (Handler + AdminHandler, `mapError`, proto↔domain мапперы).
- [x] T8. **wiring** — `module.go` `Register` (public без RequireAdmin, admin
      под RequireAdmin); регистрация в `internal/platform`; Makefile
      `migrate`/`migrate-down` на два модуля.

## Web

- [x] T9. **BFF** — `api/tournament/route.ts` (GET public, PUT admin) +
      `route.test.ts` (8 тестов, mock grpc + serialize). `tournamentClient`/
      `tournamentAdminClient` в `lib/grpc/client.ts`, `tournamentToJson` в
      `serialize.ts` (+2 теста). Bump `@bufbuild/protobuf` 2.2.3 → 2.12.1
      (чинит `codegenv2` импорт у всего web).
- [x] T10. **entities/tournament** — `lib/types.ts` (`Tournament`, `ContactJson`,
      `ContactType`), `model/get-active-tournament.ts` (server-only) + 3 теста.
- [x] T11. **features/tournament-settings** — `api/keys.ts`, `requests.ts` +
      7 тестов, `use-active-tournament.ts`, `use-update-tournament.ts`,
      `ui/tournament-settings-form.tsx` (редактор списка контактов). Добавлен
      shadcn-style `shared/ui/textarea.tsx`.
- [x] T12. **widgets/tournament-hero** — `tournament-hero.tsx` (серверный,
      скрытие пустых полей FR-6/AC-4) + 9 тестов `contactHref`.
- [x] T13. **routes** — `app/page.tsx`: SSR `getActiveTournament` через
      `Promise.all`, заглушка заменена на `TournamentHero`;
      `app/(admin)/admin/tournament/page.tsx`; ссылка «Турнир» в админке.

## Проверка

- [x] T14. `make test-all` зелёный (server: auth + tournament + pkg; web: 73 теста).
- [x] T15. `pnpm exec tsc --noEmit` — чистый (0 ошибок).
- [x] T16. `go build ./...` + `pnpm build` — оба успешны (`/admin/tournament`,
      `/api/tournament` в bundle).
- [x] T17. Статусы spec/plan/tasks → `done`; индекс `docs/specs/README.md`
      обновлён.
