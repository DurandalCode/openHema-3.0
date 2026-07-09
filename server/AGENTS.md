# AGENTS.md — /server

> Go модульный монолит (Connect-Go). Дополняет корневой AGENTS.md.

## Принципы

1. **Модуль = вертикальный bounded context** в `modules/<name>/`:
   `module.go → api → service → domain → repo → migrations`.
2. **Границы данных**: каждый модуль владеет своей PG-схемой. Нет кросс-схемных
   запросов; чужие данные — только через API модуля.
3. **DI через конструкторы**, wiring — в `internal/platform`. Без глобалов.
4. **Слои**: `api` (транспорт/proto), `service` (юзкейсы), `domain` (сущности,
   порты, ошибки), `repo` (адаптер БД). Зависимости направлены внутрь.
5. **Generated — не трогать**: `gen/`, `modules/*/repo/sqlc/`.

## Структура

```
cmd/server/          композит всех модулей (монолит)
pkg/                 переиспользуемое БЕЗ бизнес-логики:
  config logger jwt crypto(argon2id) connectutil pgxutil
internal/platform/   composition root (пул БД, токены, регистрация модулей)
internal/testdb/     testcontainers Postgres + goose per-module (ADR 0010)
modules/<name>/
  module.go          Register(mux, deps) — единая точка входа
  api/               Connect-хендлер, маппинг proto↔domain, ошибки→connect.Code
  service/           бизнес-логика
  domain/            сущности, порты (интерфейсы), доменные ошибки
  repo/queries/*.sql источник для sqlc
  repo/sqlc/         generated (DO NOT EDIT)
  migrations/        goose, схема модуля
  integration/       *_integration_test.go (//go:build integration, ADR 0010)
gen/                 proto→Go (DO NOT EDIT)
```

## Команды (dev-инструменты подключены через `go tool`)

| Команда                    | Действие                          |
| -------------------------- | --------------------------------- |
| `go build ./...`           | Сборка                            |
| `go test ./...`            | Тесты                             |
| `make sqlc` (из корня)     | Генерация репозиториев из SQL     |
| `make migrate` (из корня)  | Прогон goose-миграций             |
| `make generate` (из корня) | Регенерация из proto              |

## Тестирование

См. `docs/adr/0003-testing.md`, `docs/adr/0010-e2e-integration-testing.md` и
`docs/conventions.md` (раздел «Тестирование»).

- **Юнит**: `pkg/*_test.go`, `modules/*/service/*_test.go` (с fake-репо).
- **E2E ручек**: `modules/*/api/*_test.go` — `httptest` + Connect-клиент
  (fake-репозиторий, без БД).
- **Интеграционные с БД** (build-tag `integration`):
  `modules/*/integration/*_integration_test.go` — testcontainers Postgres +
  полный Connect-путь через `httptest` server × real PG. Хелпер:
  `internal/testdb`. Запуск: `make test-integration` (Docker).
- **Fake-репозитории**: `modules/*/testutil/` — in-memory `domain.Repository`.
- Каждый инкремент содержит тесты. Каждый модуль с PG-схемой обязан иметь
  integration-тест (минимум: миграции применяются, seed читается, хотя бы один
  публичный RPC через реальный Connect).

## Транспорт

- Connect поверх HTTP/2 (h2c для cleartext внутри доверенной сети).
- Access-токен для `Me` передаётся в заголовке `Authorization: Bearer <token>`.
- Интерсепторы (recovery, logging) подключаются в `internal/platform`.

## Добавление модуля

1. `modules/<name>/` со слоями по образцу `auth`.
2. Миграция создаёт схему `<name>` и таблицы.
3. Экспортировать `Register(mux, deps, opts...)`.
4. Зарегистрировать в `internal/platform`.
5. **Синхронизировать инфраструктурные точки**, где модули перечислены по
   имени явным списком (глоб `modules/*/...` есть не везде — забытая точка
   не ловится ни юнит-, ни e2e-, ни testcontainers-тестами, только полным
   докер-стеком):
   - `server/sqlc.yaml` — секция `sql:` (генерация репозитория, `make sqlc`).
   - `server/internal/testdb/testdb.go` — `moduleMigrations` (testcontainers
     для `*_integration_test.go`, `make test-integration`).
   - Корневой `Makefile` — цели `migrate`/`migrate-down`
     (`make dev`/`make migrate`, локальный цикл разработки).
   - `server/Dockerfile` — `COPY --from=build /src/modules/<name>/migrations
     /app/modules/<name>/migrations` (прод-образ). `docker-compose.yml` сам
     по себе трогать не нужно — сервис `migrate` гоняет
     `/app/modules/*/migrations` по глобу, но каталог миграций модуля должен
     физически попасть в образ этой строкой COPY.
6. При выносе в сервис — собрать `cmd/<name>/main.go`.
7. **Проверить миграции нового модуля в полном докеризованном стеке**:
   `docker compose up --build` (или `make prod`), затем
   `docker compose logs migrate` и/или `docker compose exec postgres psql
   -U hema -d hema -c '\dn'` — убедиться, что схема модуля создалась.
   `make test-integration` и `make dev` этот путь НЕ покрывают (первый не
   использует `server/Dockerfile`, второй гоняет `make migrate` локально, а
   не через `migrate`-сервис compose) — пропущенная строка COPY в
   `server/Dockerfile` не даёт о себе знать нигде, кроме прод-образа.
