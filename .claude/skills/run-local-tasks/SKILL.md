---
name: run-local-tasks
description: Use when the user wants Claude to actually launch opencode against already-generated task cards (docs/specs/NNN-*/tasks/*.md, requires:local) instead of a manual handoff. Triggers on "прогони таски локальной моделью", "запусти opencode по карточкам", "run local tasks", "автозапусти карточки". Requires OPENCODE_LOCAL_MODEL env var. Runs each pending local card in its own git worktree via `opencode run`, verifies the result itself before merging, stops on first failure. Do NOT use to generate cards (use decompose-tasks) or to hand off manually (use implement-task directly in an opencode session).
---

# Skill: run-local-tasks

Автозапускает `opencode` по уже сгенерированным карточкам (ADR 0021,
`decompose-tasks`) вместо ручного хендоффа. Единственная точка автозапуска
локальной модели из Claude Code (ADR 0022).

## Предусловие

- Есть карточки `docs/specs/NNN-*/tasks/*.md` со `status: pending`,
  `requires: local`. Если карточек нет — сначала `decompose-tasks`.
- Задана переменная окружения `OPENCODE_LOCAL_MODEL` в формате
  `provider/model` (напр. `export OPENCODE_LOCAL_MODEL=lmstudio/qwen2.5-coder-32b`
  в своём шелл-профиле — не в репозитории, у каждого своя локальная модель).
  Проверить: `echo "$OPENCODE_LOCAL_MODEL"`. Пусто → **остановиться** и
  попросить пользователя её задать, не подставлять дефолтный/облачный
  провайдер opencode вместо неё.
- `opencode` CLI доступен (`which opencode`).

## Порядок

1. **Собрать очередь.** Прочитать все карточки фичи, отобрать
   `status: pending` + `requires: local`. Отсортировать с учётом
   `depends_on` — карточка не запускается, пока её зависимости не
   `status: done`. Карточки, зависящие от невыполненной `requires: claude`
   задачи — исключить из очереди, отметить в финальной сводке (не для
   этого скилла — это задача `tdd-cycle`).

2. **Для каждой карточки очереди по порядку:**

   a. Изоляция:
      ```
      git worktree add .claude/worktrees/local-<T#>-<slug> -b local/<T#>-<slug>
      ```
      от текущего HEAD рабочей ветки.

   b. Запуск:
      ```
      opencode run --dir .claude/worktrees/local-<T#>-<slug> \
        --model "$OPENCODE_LOCAL_MODEL" --auto \
        "Выполни карточку docs/specs/NNN-*/tasks/<T#>-<slug>.md через скилл implement-task"
      ```
      Ненулевой код завершения — сразу провал карточки, к verification не
      переходить.

   c. **Verification (сам, не доверяя карточке/выводу opencode):**
      - Frontmatter карточки в worktree реально `status: done`?
      - `git diff` (в worktree, относительно точки создания) трогает
        только файлы, названные в Red/Green/Boundaries карточки — ничего
        сверх?
      - Acceptance-команда карточки, прогнанная самим Claude в worktree —
        зелёная?

      Любое "нет" → провал.

   d. **Успех:** закоммитить в worktree (если ещё не закоммичено),
      `git merge local/<T#>-<slug>` в рабочую ветку, затем убрать за собой:
      `git worktree remove .claude/worktrees/local-<T#>-<slug>` + `git
      branch -d local/<T#>-<slug>`. Перейти к следующей карточке очереди.

      **Провал:** остановиться немедленно. Worktree и ветку **не
      трогать** (оставить для разбора). Не переходить к следующим
      карточкам очереди, даже если они не зависят от провалившейся.

3. **Сводка.** В конце (по завершении очереди или после остановки на
   провале) — отчитаться: какие карточки смержены, какая остановила
   прогон и почему (вывод теста / файлы вне Boundaries / `status` не
   проставлен), что осталось `pending`, что исключено из-за незавершённой
   `requires: claude` зависимости.

## Явный запрет

- Мержить карточку, не прошедшую verification-gate целиком.
- Пытаться "продавить" мерж силой (`--no-verify`, `-X ours`, force) при
  конфликте — как и в `tdd-cycle`, конфликт означает, что что-то размечено
  неверно, разобраться, не подавлять.
- Брать в работу `requires: claude`-карточки.
- Продолжать очередь после первого провала.
- Угадывать `OPENCODE_LOCAL_MODEL`, если переменная не задана.

## Ссылки

`docs/adr/0022-opencode-autorun.md`, `docs/adr/0021-local-model-task-cards.md`,
`.opencode/skill/implement-task/SKILL.md`, `.claude/skills/decompose-tasks/SKILL.md`,
`.claude/skills/tdd-cycle/SKILL.md` (дисциплина уборки worktree/веток).
