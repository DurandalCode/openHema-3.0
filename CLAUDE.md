@AGENTS.md

## Claude Code

- Скиллы SDD-цикла (`write-spec`, `add-module`, `add-feature-web`, `tdd-cycle`)
  живут в `.claude/skills/` — те же, что и в `.opencode/skill/` (единый
  источник инструкций, независимый от инструмента). Исключение —
  `decompose-tasks` (только `.claude/skills/`) и `implement-task` (только
  `.opencode/skill/`): не зеркалятся намеренно, см. ADR 0021.
- Команда `/spec <описание фичи>` — `.claude/commands/spec.md`.
- Вложенные `CLAUDE.md` в `/server`, `/web`, `/proto` — тонкие обёртки
  (`@AGENTS.md`), подтягивающие локальные `AGENTS.md` этих папок.
