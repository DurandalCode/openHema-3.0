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
modules/<name>/
  module.go          Register(mux, deps) — единая точка входа
  api/               Connect-хендлер, маппинг proto↔domain, ошибки→connect.Code
  service/           бизнес-логика
  domain/            сущности, порты (интерфейсы), доменные ошибки
  repo/queries/*.sql источник для sqlc
  repo/sqlc/         generated (DO NOT EDIT)
  migrations/        goose, схема модуля
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

См. `docs/adr/0003-testing.md` и `docs/conventions.md` (раздел «Тестирование»).

- **Юнит**: `pkg/*_test.go`, `modules/*/service/*_test.go` (с fake-репо).
- **E2E ручек**: `modules/*/api/*_test.go` — `httptest` + Connect-клиент.
- **Fake-репозитории**: `modules/*/testutil/` — in-memory `domain.Repository`.
- Каждый инкремент содержит тесты.

## Транспорт

- Connect поверх HTTP/2 (h2c для cleartext внутри доверенной сети).
- Access-токен для `Me` передаётся в заголовке `Authorization: Bearer <token>`.
- Интерсепторы (recovery, logging) подключаются в `internal/platform`.

## Добавление модуля

1. `modules/<name>/` со слоями по образцу `auth`.
2. Миграция создаёт схему `<name>` и таблицы.
3. Экспортировать `Register(mux, deps, opts...)`.
4. Зарегистрировать в `internal/platform`.
5. При выносе в сервис — собрать `cmd/<name>/main.go`.
