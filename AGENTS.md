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
make dev               # postgres в докере + migrate + server и web локально
# make prod            # альтернатива: весь стек в докере с полной сборкой
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
8. **Фича начинается со спеки.** Нетривиальная фича (новый модуль/фича,
   доменный RPC, кросс-слойное изменение) стартует с `docs/specs/NNN-*/`
   (spec → plan → tasks), затем код по TDD. См. ADR 0008/0009.

## Процесс разработки (SDD + TDD)

> Детали: `docs/adr/0008-spec-driven-development.md`,
> `docs/adr/0009-tdd-workflow.md`, `docs/specs/README.md`.

Цикл для нетривиальной фичи: **spec → plan → tasks → code**.

1. **spec** — `docs/specs/NNN-<feature>/spec.md`: ЧТО и ЗАЧЕМ (проблема,
   акторы, критерии приёмки Given/When/Then). Неясное — `[NEEDS CLARIFICATION]`.
2. **plan** — `plan.md`: КАК (proto, server-модули/слои, PG-схема, web-слои,
   тесты по пирамиде ADR 0003).
3. **tasks** — `tasks.md`: упорядоченный TDD-чеклист.
4. **code** — реализация по циклу red → green → refactor (тест первым).

Инструменты: скиллы `write-spec`, `add-module`, `add-feature-web`, `tdd-cycle`
и команда `/spec`. Для OpenCode — `.opencode/skill/` + `opencode.json`. Для
Claude Code — `.claude/skills/` + `.claude/commands/spec.md` (см. `CLAUDE.md`).

Мелкие правки (рефактор, баг-фикс, косметика) спеки не требуют — только
инкремент с тестами.

> Event-Driven Design (межмодульные события) появится отдельным ADR вместе с
> первой событийной фичей. До этого секция «События» в `plan.md` — placeholder.

## Команды (см. Makefile)

| Команда           | Действие                                        |
| ----------------- | ----------------------------------------------- |
| `make generate`   | Генерация из proto (Go + TS) через buf          |
| `make migrate`    | Прогон goose-миграций по всем модулям           |
| `make sqlc`       | Генерация sqlc-репозиториев                     |
| `make dev`        | Локально: postgres в докере + миграции + server/web |
| `make prod`       | Полная сборка и запуск всего стека в докере      |
| `make server`     | Локальный запуск Go-сервера                     |
| `make web`        | Локальный запуск Next.js                        |
| `make test`       | Тесты сервера (`go test ./...`)                 |
| `make test-web`   | Тесты клиента (`pnpm test`)                     |
| `make test-all`   | Все тесты (server + web)                        |

CI (`.github/workflows/ci.yml`) запускается на PR и push в main: тесты/vet/
build/lint — только для изменённых частей репо (path-filtered).

## Definition of Done

- Нетривиальная фича начата со спеки (`docs/specs/NNN-*/spec.md`+`plan.md`+
  `tasks.md`); статусы и индекс `docs/specs/README.md` обновлены.
- Изменение API отражено в `/proto` и перегенерировано.
- Код собирается: `go build ./...` (server), `pnpm build` (web).
- **Тесты написаны и проходят** (`make test-all`). Каждый инкремент содержит
  тесты: юнит — на логику, e2e — на ручки/маршруты. Порядок — TDD (ADR 0009).
- **Новый server-модуль** — синхронизированы все инфраструктурные точки, где
  модули перечислены по имени (`sqlc.yaml`, `internal/testdb`, корневой
  `Makefile`, `server/Dockerfile`), и миграции проверены в полном
  докеризованном стеке (`docker compose up --build`), не только через
  testcontainers/`make dev`. См. чеклист `server/AGENTS.md` → «Добавление
  модуля».
- Новые решения зафиксированы в ADR.
- Секреты не попали в git.
