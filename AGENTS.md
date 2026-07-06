# AGENTS.md — HEMA Tournament (root)

> Конституция проекта. Читается ПЕРВОЙ. Вложенные `AGENTS.md` в `/server`, `/web`,
> `/proto` дополняют её локальной спецификой и имеют приоритет в своих папках.

## Что это

Полноценное приложение для проведения HEMA-турниров. Пет-проект, создаваемый
преимущественно нейросетями → **AI-first**: структура, документация и правила
оптимизированы под навигацию и генерацию агентами.

## Стек и версии

| Слой        | Технология                                              |
| ----------- | ------------------------------------------------------- |
| Клиент      | Next.js (App Router), TypeScript, pnpm                   |
| BFF         | Next.js Route Handlers (Node runtime), REST наружу       |
| Транспорт   | REST (browser→BFF) · gRPC/Connect (BFF→server)          |
| Сервер      | Go 1.26+, модульный монолит, Connect-Go                  |
| Данные      | PostgreSQL · pgx · sqlc · goose                          |
| Контракты   | Protobuf, buf → connect-go (Go) + connect-es (TS)        |
| Auth        | JWT (access+refresh) · argon2id                          |
| Инфра       | docker-compose (верхний уровень)                        |

## Карта репозитория

```
/proto      единый источник контрактов (proto + buf). Меняем API ТОЛЬКО здесь.
/server     Go модульный монолит (см. server/AGENTS.md)
/web        Next.js: UI + BFF (см. web/AGENTS.md)
/deploy     инфраструктурные файлы (compose overrides, init-скрипты)
/docs       архитектура, соглашения, ADR (журнал решений)
```

## Онбординг

После `git clone` (и после каждого `pull`, если менялись `proto/` или
`server/modules/*/repo/queries/`):

```bash
# 1. Установить зависимости и сгенерировать код (нужен Go 1.26+)
make generate   # buf: proto → Go (server/gen) + TS (web/src/gen)
make sqlc       # sql: queries → server/modules/*/repo/sqlc

# 2. Поднять БД и применить миграции
cp .env.example .env   # задать JWT_* секреты!
make dev               # postgres + migrate + server + web
```

Сгенерированный код (`server/gen/`, `web/src/gen/`, `server/modules/*/repo/sqlc/`)
**в репозитории не хранится** (см. `docs/adr/0004-no-generated-in-repo.md`) —
он в `.gitignore` и генерируется локально и в CI.

## Глобальные правила

1. **Контракты — источник истины.** Любое изменение API начинается с `.proto`
   в `/proto`, затем регенерация. Нельзя править сгенерированный код руками.
2. **`DO NOT EDIT`.** Всё в `**/gen/`, `**/sqlc/` и подобных — сгенерировано.
   Правь источник (proto/sql), не вывод. Gen-код **не хранится в репо**
   (см. ADR 0004) — генерируется локально и в CI.
3. **Модульные границы.** Модуль сервера — вертикальный bounded context. Нет
   кросс-модульных обращений к чужим данным напрямую; только через API модуля.
   Каждый модуль владеет своей PG-схемой.
4. **Явные зависимости.** DI через конструкторы, без глобального состояния.
5. **Каждое крупное решение → ADR** в `docs/adr/NNNN-*.md`.
6. **Секреты не коммитим.** Только `.env.example` с плейсхолдерами.
7. **Язык.** Код и идентификаторы — английский; комментарии/доки — по
   договорённости команды (допустимо RU в docs, EN в коде).

## Команды (см. Makefile)

| Команда           | Действие                                        |
| ----------------- | ----------------------------------------------- |
| `make generate`   | Генерация из proto (Go + TS) через buf          |
| `make migrate`    | Прогон goose-миграций по всем модулям           |
| `make sqlc`       | Генерация sqlc-репозиториев                     |
| `make dev`        | Поднять весь стек через docker-compose          |
| `make server`     | Локальный запуск Go-сервера                     |
| `make web`        | Локальный запуск Next.js                        |
| `make test`       | Тесты сервера (`go test ./...`)                 |
| `make test-web`   | Тесты клиента (`pnpm test`)                     |
| `make test-all`   | Все тесты (server + web)                        |

CI (`.github/workflows/ci.yml`) запускается на PR и push в main: тесты/vet/
build/lint — только для изменённых частей репо (path-filtered).

## Definition of Done

- Изменение API отражено в `/proto` и перегенерировано.
- Код собирается: `go build ./...` (server), `pnpm build` (web).
- **Тесты написаны и проходят** (`make test-all`). Каждый инкремент содержит
  тесты: юнит — на логику, e2e — на ручки/маршруты.
- Новые решения зафиксированы в ADR.
- Секреты не попали в git.
