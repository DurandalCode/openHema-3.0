---
name: write-spec
description: Use when starting a new non-trivial feature in the HEMA tournament project and a spec is needed before coding. Triggers on "напиши спеку", "новая фича", "заведи спеку", "spec", "specify", "/spec", "начнём фичу". Creates docs/specs/NNN-<feature>/ from templates and drives the spec → plan → tasks cycle (ADR 0008). Do NOT use for small fixes, refactors, or cosmetic changes.
---

# Skill: write-spec

Запускает Spec-Driven Development цикл (ADR 0008) для новой фичи.

## Когда применять

- Новый server-модуль (bounded context) или новая web-фича.
- Нетривиальный RPC с доменной логикой.
- Кросс-слойное изменение, затрагивающее `proto` + несколько слоёв.

Не применять для рефактора, баг-фикса, косметики — там достаточно инкремента с
тестами.

## Источники истины

- Процесс: `docs/adr/0008-spec-driven-development.md`
- TDD-цикл: `docs/adr/0009-tdd-workflow.md`
- Шаблоны: `docs/specs/_templates/{spec,plan,tasks}.md`
- Пример: `docs/specs/0000-healthcheck/`
- Архитектура: `docs/adr/0002-modular-monolith.md`, `server/AGENTS.md`,
  `web/AGENTS.md`, `docs/conventions.md`

## Шаги

1. **Определить номер и имя.** Посмотреть существующие `docs/specs/NNN-*`,
   взять следующий `NNN`, придумать `kebab-feature`. Создать папку
   `docs/specs/NNN-<feature>/`.
2. **spec.md.** Скопировать шаблон `_templates/spec.md`, заполнить: проблема,
   акторы (роли `user`/`admin` из RBAC), сценарии, требования, критерии
   приёмки (Given/When/Then). Всё неясное — в `[NEEDS CLARIFICATION]`.
   **Не переходить к plan.md, пока есть незакрытые критичные вопросы** — задать
   их пользователю.
3. **plan.md.** Когда spec без открытых вопросов — заполнить `_templates/plan.md`:
   изменения `proto/hema/v1/*`, server-модули и слои
   (`api/service/domain/repo/migrations`), PG-схема (при новом модуле), web-слои
   (FSD + BFF), стратегия тестов (ADR 0003). Секция «События» — placeholder до
   принятия EDD-ADR.
4. **tasks.md.** Разложить plan на упорядоченный TDD-чеклист (`_templates/tasks.md`):
   контракты → server снизу вверх (domain → service → repo → api → wiring) →
   web → проверка. Каждая задача = слой/файл + пара «тест → код».
5. **Индекс.** Добавить строку в таблицу `docs/specs/README.md`.

## Правила

- Спека описывает ЧТО/ЗАЧЕМ без технологий; план — КАК; tasks — порядок TDD.
- Не выдумывать доменные решения: неизвестное — в `[NEEDS CLARIFICATION]`,
  спросить пользователя.
- Язык артефактов — RU; пути/идентификаторы — EN.
- После создания спеки не начинать кодить автоматически — сначала согласовать.
  Реализацию ведёт скилл `tdd-cycle`.
