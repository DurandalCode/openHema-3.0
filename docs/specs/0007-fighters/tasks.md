# Tasks: Бойцы турнира (fighters)

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: done
- Дата: 2026-07-13
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах.

## Контракты

- [x] T1. `proto/hema/v1/fighter.proto` — `FighterAdminService` (Create/Edit/
      Withdraw/Return/AddToNomination/RemoveFromNomination/Move/ListRoster/
      GetFighter), `FighterPublicService` (ListNominationRoster), сообщения
      `Fighter`/`Participation`/`RosterEntry`, enum `FighterStatus`/
      `WithdrawalReason`/`ParticipationStatus`. `make generate`.
- [x] T2. `proto/hema/v1/application.proto` — `NominationParticipant.club`
      (поправка 0006). `make generate`.
- [x] T3. Зарегистрировать `FighterPublicService.ListNominationRoster` в
      `publicProcedures` интерсептора Auth (публичный RPC без токена).

## Server — модуль fighter (снизу вверх)

- [x] T4. **domain** — `modules/fighter/domain/domain.go`: сущности `Fighter`/
      `Participation`, типы статусов/причин, методы агрегата (`Withdraw`,
      `Return`, `AddParticipation`, `RemoveParticipation`, `Move`, `Edit`),
      доменные ошибки, порты `Repository` и `NominationProvider`.
      Тест: `domain/domain_test.go` (red→green) — переходы статусов, обратимость
      снятия, идемпотентный повторный `AddParticipation`, запрет `Return` не
      выведенного, непустое имя.
- [x] T5. **testutil** — `modules/fighter/testutil/fake_repo.go`: in-memory
      `domain.Repository` (`var _ domain.Repository = (*FakeRepo)(nil)`) +
      fake `NominationProvider` + fake `ActiveTournamentProvider`.
- [x] T6. **service (red→green)** — `service/service_test.go` (fake-репо +
      fake nomProv): `RegisterFromApplication` дедуп (второй раз → +участие;
      разный `origin_user_id` → два бойца), `CreateManual` (валидация номинаций,
      мульти-номинация, без предупреждений), `Withdraw/Return`, `Remove/Move`,
      `Edit`, `ListRoster`, `ListNominationRoster` → затем `service/service.go`.
- [x] T7. **repo** — `repo/queries/fighter.sql` (`-- name: X :one/:many`:
      upsert бойца+участий в транзакции, загрузка агрегата с участиями,
      ростер турнира/номинации join); `make sqlc`; `repo/repo.go` — реализация
      порта (`Move` и upsert-участий — в одной транзакции).
- [x] T8. **migrations** — `migrations/00001_init.sql` (goose): схема `fighter`,
      таблицы `fighters` (+ partial-unique дедуп, CHECK-и) и `participations`
      (+ unique пары, CHECK статуса) по DDL из плана.
- [x] T9. **api (red→green)** — `api/handler_test.go` (httptest + Connect,
      fake-репо): happy-path всех RPC (admin+public), маппинг доменных
      ошибок в `connect.Code`, require-admin на admin-сервисе, «выбыл» в
      публичном ростере → затем `api/handler.go`.

## Server — кроссдоменное подключение и wiring

- [x] T10. **порт sink в application** — `application/domain/domain.go`:
      `FighterRegistrationSink` + `RegisteredFighter`. `application.Deps` +=
      `Fighters`; проброс в `service.New`. Тест (red→green): `Register`-тест с
      fake-sink — вызывается с корректными `name`(override/auth)/`club`/
      `origin_user_id`/`nomination_id`/`tournament_id` после успешного append;
      отдельный тест на распространение ошибки sink наверх.
- [x] T11. **sink-адаптер fighter** — `fighter.NewRegistrationSink(pool, nomProv)`
      реализует `application/domain.FighterRegistrationSink` (идемпотентно по
      дедупу). Идемпотентность и гонка покрыты в integration (T14,
      `TestIntegration_DedupRace`).
- [x] T12. **wiring** — `modules/fighter/module.go` (`Register`),
      `internal/platform/fighter_provider.go` (адаптер номинаций для fighter),
      `platform.go`: регистрация `fighter`, инъекция `Fighters` в
      `applicationDeps`. Также обновлён `cmd/demo/main.go` (демо-сидер).
- [x] T13. **инфра-точки нового модуля** — `server/sqlc.yaml`,
      `internal/testdb/testdb.go` (`moduleMigrations`), корневой `Makefile`
      (`migrate`/`migrate-down`), `server/Dockerfile` (`COPY ... fighter/migrations`).
- [x] T14. **integration (build-tag `integration`)** —
      `modules/fighter/integration/*_integration_test.go` (testcontainers):
      миграции применяются, дедуп-констрейнт держит гонку параллельных
      регистраций (`TestIntegration_DedupRace`), `ListNominationRoster` через
      реальный PG. Также обновлён `application/integration` — реальный
      зарегистрированный applicant (не синтетический JWT) для непустого
      снапшота имени при регистрации бойца.

## Web

- [x] T15. **BFF (red→green)** — `app/api/admin/fighters/**` (list/create/get/
      edit/withdraw/return/move/nominations add-remove) и
      `app/api/nominations/[id]/roster` + `*.test.ts` (mock grpc,
      `connect.Code`→HTTP).
- [x] T16. **entities/features** — `entities/fighter` (типы);
      `features/fighter-management` `api/` (requests + keys + RQ-хуки) с тестами
      fetchers (Vitest) + `ui/fighter-roster.tsx` (ростер, форма заведения,
      действия по бойцу и участиям).
- [x] T17. **widgets/route** — `widgets/nomination-roster` (публичный состав) на
      главной странице (заменяет воронку заявок, когда ростер не пуст —
      UX-решение спеки); admin-страница `/admin/fighters` в под-навигации
      админки (0004); поправка 0006 — `club` в `NominationParticipant` и в
      публичном списке участников номинации.

## Проверка

- [x] T18. `make test-all` зелёный (server + web): 269 web-тестов, все
      server-модули (включая fighter) зелёные.
- [x] T19. `make test-integration` (Docker) — integration всех модулей,
      включая fighter (миграции, дедуп-гонка, публичный RPC) и обновлённый
      application (кроссдоменный sink, включая тест на распространение ошибки).
- [x] T20. `pnpm exec tsc --noEmit` — чисто.
- [x] T21. `go build ./...` + `pnpm build` — оба чисто.
- [x] T22. **Полный докер-стек**: `docker compose up --build` →
      `docker compose exec postgres psql -U hema -d hema -c '\dn'` содержит
      схему `fighter`; `\dt fighter.*` — таблицы `fighters`/`participations`;
      `/healthz` — 200.
- [x] T23. Статусы `spec.md`/`plan.md`/`tasks.md` → `done`, индекс в
      `docs/specs/README.md` обновлён.

_Порядок сохранён: контракты → server снизу вверх → кроссдоменное подключение →
web → проверка. Кроссдоменный sink синхронный (in-process) — переедет на шину с
EDD-ADR (см. `plan.md` → «События»)._
</content>
