---
name: add-module
description: Use when adding a new Go server module (bounded context) to the HEMA modular monolith. Triggers on "новый модуль", "добавь модуль", "add module", "новый bounded context", "серверный модуль", "создай сервис <name> на сервере". Scaffolds modules/<name>/ (module.go, api, service, domain, repo, migrations, testutil) mirroring the auth reference module, with its own PG schema and platform wiring. Do NOT use for web features (use add-feature-web) or contract-only changes.
---

# Skill: add-module

Создаёт новый server-модуль по эталону `auth` (ADR 0002, `server/AGENTS.md`).

## Эталон

`server/modules/auth/` — единственный референс. Всегда сверяться с ним по
структуре, именованию, паттернам тестов.

## Инвариант

Модуль = вертикальный bounded context. Зависимости направлены внутрь:
`api → service → domain`; `repo` реализует порты `domain`. Каждый модуль владеет
своей PG-схемой. Нет кросс-схемных запросов — чужие данные только через API
модуля. DI через конструкторы, wiring в `internal/platform`. Без глобалов.

## Предусловие

Сначала должна быть спека (`docs/specs/NNN-*/plan.md`) — знать RPC, сущности,
ошибки, схему. Если спеки нет — сначала скилл `write-spec`.

## Шаги (порядок = TDD, ADR 0009)

1. **Контракты.** Описать сервис/сообщения в `proto/hema/v1/<name>.proto`
   (пакет `hema.v1`, `XxxService`, глагольные RPC, `XxxRequest`/`XxxResponse`).
   `make generate`.
2. **domain/** — `domain/domain.go`: сущности, порт `Repository` (интерфейс),
   доменные ошибки `ErrXxx`, типы. Без proto и SQL.
3. **service/** (test-first) — `service/service_test.go` с fake-репо: счастливый
   путь + все доменные ошибки → затем `service/service.go` (зависит от порта,
   не от repo).
4. **testutil/** — `testutil/fake_repo.go`: in-memory `domain.Repository`,
   `var _ domain.Repository = (*FakeRepo)(nil)`, mutex-guarded map. Имя
   `Fake<Name>`, не `Mock`.
5. **repo/** — `repo/queries/*.sql` (`-- name: X :one/:many`, CamelCase);
   `make sqlc`; `repo/repo.go` — pgx-адаптер, реализующий порт.
6. **migrations/** — `migrations/00001_init.sql` (goose): `CREATE SCHEMA <name>`
   + таблицы. Схема = имя модуля.
7. **api/** (test-first) — `api/handler_test.go` через httptest + сгенерированный
   Connect-клиент (fake-репо, реплика интерсепторов из platform): счастливый
   путь + маппинг доменных ошибок в `connect.Code` → затем `api/handler.go`
   (маппинг proto↔domain, ошибки→`connect.Code`).
8. **module.go** — `Register(mux, deps, baseOpts, adminOpts)` (единая точка
   входа); `Bootstrap()` при необходимости.
9. **wiring** — зарегистрировать модуль в `internal/platform` (пул, deps,
   Register). При админ-ручках — `RequireAdmin` интерсептор.
10. **Makefile** — если migrations гоняются по модулю, учесть новый
    `migrations`-путь (сейчас `MIGRATIONS_DIR` указывает на auth — расширить).

## Проверка

`go test ./...`, `go build ./...`, `make sqlc && make generate` без ошибок.

## Ссылки

`server/AGENTS.md` (рецепт), `docs/adr/0002-modular-monolith.md`,
`docs/adr/0003-testing.md`, `docs/conventions.md`, `proto/AGENTS.md`.
