---
name: tdd-cycle
description: Use when implementing tasks from a feature's tasks.md in the HEMA project by strict TDD. Triggers on "реализуй фичу", "tdd", "red green refactor", "пройди tasks", "начни имплементацию", "выполни tasks.md", "напиши код по спеке". Drives the red → green → refactor loop, writing failing tests first, then minimal code, running make test / make test-web and tsc --noEmit. Do NOT use for creating specs (use write-spec) or scaffolding structure without tests.
---

# Skill: tdd-cycle

Проводит реализацию задач из `tasks.md` по TDD-циклу (ADR 0009).

## Предусловие

Есть заполненная спека: `docs/specs/NNN-*/{spec.md,plan.md,tasks.md}`. Если нет —
сначала скилл `write-spec`.

## Цикл для каждой задачи tasks.md

1. **Red.** Написать тест, описывающий поведение из задачи. Запустить — убедиться,
   что падает (компиляция или ассерт). Падающий тест подтверждает, что он
   реально что-то проверяет.
2. **Green.** Минимальный код, чтобы тест прошёл. Не больше нужного.
3. **Refactor.** Почистить при зелёных тестах. **Тесты не переписывать под код.**

Тест и код — в одном инкременте (ADR 0003).

## Уровень теста по типу изменения (ADR 0009)

| Изменение                     | Тест первым                                     |
| ----------------------------- | ----------------------------------------------- |
| `pkg/` утилита                | `pkg/*_test.go`                                 |
| `service/` юзкейс             | `service/*_test.go` с fake-репо (`testutil/`)   |
| Новый/изменённый RPC          | `api/*_test.go` (httptest + Connect-клиент)     |
| Сложный SQL/миграция          | Интеграционный с БД (по необходимости)          |
| BFF route / web-логика        | `*.test.ts` рядом (Vitest)                      |

Для нового RPC обычно оба: юнит на юзкейс (все доменные ошибки) + e2e на маппинг
в `connect.Code`.

## Команды

- Server: `go test ./...` (в CI `-race`), `go build ./...`.
- Web: `pnpm test` (Vitest) + **обязательно** `pnpm exec tsc --noEmit` после
  правок тестов с protobuf-моками (Vitest не ловит `TS2322/TS2345`).
- Всё вместе: `make test-all`.
- При изменении контрактов/SQL: `make generate` / `make sqlc` перед тестами.

## Правила

- Порядок задач в `tasks.md` соблюдать (контракты → server снизу вверх → web →
  проверка).
- Fake-репозитории — в `modules/*/testutil/`, имя `Fake<Name>`, не `Mock`.
- Обязательно покрывать: счастливый путь, все доменные ошибки, граничные случаи
  (пустой email, короткий пароль, невалидный/истёкший токен).
- По завершении — отметить задачи в `tasks.md`, обновить статусы спеки и индекс
  в `docs/specs/README.md`.

## Ссылки

`docs/adr/0009-tdd-workflow.md`, `docs/adr/0003-testing.md`,
`docs/conventions.md` (раздел «Тестирование»), `server/AGENTS.md`,
`web/AGENTS.md`.
