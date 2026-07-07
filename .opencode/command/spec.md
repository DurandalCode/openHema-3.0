---
description: Запустить Spec-Driven Development цикл для новой фичи (создаёт docs/specs/NNN-*/).
agent: build
---

Запусти Spec-Driven Development цикл для новой фичи, используя навык
`write-spec` (см. `.opencode/skill/write-spec/SKILL.md` и
`docs/adr/0008-spec-driven-development.md`).

Описание фичи от пользователя:

$ARGUMENTS

Действуй по процессу:

1. Определи следующий номер `NNN` (посмотри существующие `docs/specs/NNN-*`) и
   краткое `kebab-feature` имя. Создай папку `docs/specs/NNN-<feature>/`.
2. Заполни `spec.md` из `docs/specs/_templates/spec.md`: проблема, акторы,
   сценарии, требования, критерии приёмки (Given/When/Then). Всё неясное —
   в раздел `[NEEDS CLARIFICATION]`.
3. Если остались критичные `[NEEDS CLARIFICATION]` — задай их пользователю и
   остановись, не переходя к plan.md.
4. Когда spec без открытых вопросов — заполни `plan.md`, затем `tasks.md` из
   соответствующих шаблонов.
5. Добавь строку в таблицу-индекс в `docs/specs/README.md`.

Не начинай писать код фичи — этим займётся навык `tdd-cycle` после согласования
спеки.
