---
name: setup-local-model
description: Use when a contributor wants to wire up opencode to their own local model runtime (LM Studio or Ollama) for the local-model execution path (ADR 0021/0022) — so it's not a one-off manual setup. Triggers on "настрой локальную модель", "setup local model", "подключи LM Studio/Ollama к opencode", "онбординг локальной модели". Detects the installed runtime, confirms a downloaded model, starts the server with an idle TTL, merges an opencode provider entry into the user's global config, and sets OPENCODE_LOCAL_MODEL in their shell profile. Do NOT use to install LM Studio/Ollama itself or to download a model — those are the user's own choice (disk space, hardware, licensing).
---

# Skill: setup-local-model

Настраивает связку opencode ↔ локальный inference-рантайм (LM Studio или
Ollama) под конкретного разработчика, чтобы использовать `decompose-tasks`
→ `implement-task`/`run-local-tasks` (ADR 0021/0022) не пришлось настраивать
каждому вручную "по переписке".

## Границы — что этот скилл НЕ делает

- **Не устанавливает** LM Studio/Ollama — это отдельные приложения,
  платформозависимые, тяжёлые; ставит их пользователь сам
  (lmstudio.ai / ollama.com).
- **Не скачивает модель** без явного запроса — это десятки гигабайт
  трафика/диска и осознанный выбор конкретной модели под своё железо,
  не то, что стоит делать за пользователя молча.
- **Не трогает `opencode.json` в репозитории** — связка модель↔машина
  персональная, живёт только в глобальном конфиге пользователя, см. ADR 0021
  ("не хардкодится и не коммитится").

Если что-то из перечисленного не готово — сказать пользователю, что нужно
сделать руками, и остановиться на этом шаге.

## Шаги

0. **Определить ОС.** `uname -s` (macOS: `Darwin`, Linux: `Linux`) или
   отсутствие `uname`/наличие `$OS=Windows_NT` → Windows. Дальше все пути —
   по ветке ОС; если сессия внутри WSL/git-bash на Windows — вести себя как
   Linux/macOS (`uname` там есть и вернёт `Linux`).

1. **Определить рантайм.**
   - LM Studio: `lms --version` (если в `PATH`); иначе — типовой путь CLI:
     macOS/Linux `~/.lmstudio/bin/lms`, Windows обычно
     `%USERPROFILE%\.lmstudio\bin\lms.exe` (официально путь не
     задокументирован — если не находится, спросить пользователя, где
     установлена LM Studio).
   - Ollama: `command -v ollama` (macOS/Linux) или `where ollama`
     (Windows) — бинарь кросс-платформенный, путь не важен, если команда
     нашлась.
   Если ни один не найден — сообщить пользователю ссылки на установку
   (lmstudio.ai / ollama.com), остановиться.

2. **Проверить, что модель скачана.**
   - LM Studio: `lms ls` — список локальных моделей.
   - Ollama: `ollama list`.
   Если пусто — спросить пользователя, какую модель он хочет использовать
   (или напомнить скачать через `lms get <model>` / `ollama pull <model>`),
   не тянуть модель самостоятельно.

3. **Поднять сервер и загрузить модель.** Одинаково на всех ОС (обе CLI
   кросс-платформенные). Спросить желаемый TTL простоя (по умолчанию
   предложить 1800с/30 мин — после него модель сама выгружается, не
   занимая память просто так).
   - LM Studio: `lms server start`; `lms load <model-key> -y --ttl <N>`.
     Точный API-идентификатор модели — из вывода команды или `lms ps`
     (колонка `IDENTIFIER`), использовать именно его, не имя файла.
   - Ollama: сервер обычно уже фоновой службой (иначе `ollama serve &`);
     TTL простоя — через `OLLAMA_KEEP_ALIVE` (переменная окружения или
     флаг при запросе), а не при загрузке модели.

4. **Смёржить провайдера в глобальный конфиг opencode.** Путь конфига —
   по ОС:
   - macOS/Linux: `~/.config/opencode/opencode.jsonc` (или `.json`, если
     уже существует в этом виде — сохранить формат файла, не переключать).
   - Windows (нативный, не WSL): `%ProgramData%\opencode\opencode.jsonc`
     — это общесистемная папка, конфиг может быть общим для всех
     пользователей машины; предупредить об этом, если на машине несколько
     аккаунтов.

   Прочитать файл (создать с `{"$schema": "https://opencode.ai/config.json"}`,
   если его нет) и **добавить/обновить** только свою секцию
   `provider.<runtime>` — не перезаписывать остальные ключи, которые там
   уже могут быть настроены под другие провайдеры/проекты пользователя.
   - LM Studio (`baseURL: "http://127.0.0.1:1234/v1"`):
     ```jsonc
     "provider": {
       "lmstudio": {
         "npm": "@ai-sdk/openai-compatible",
         "name": "LM Studio (local)",
         "options": { "baseURL": "http://127.0.0.1:1234/v1" },
         "models": { "<model-id>": { "name": "<человекочитаемое имя>" } }
       }
     }
     ```
   - Ollama (`baseURL: "http://127.0.0.1:11434/v1"`) — та же форма,
     `npm`/`options.baseURL` меняются под порт Ollama.

5. **Прописать `OPENCODE_LOCAL_MODEL`.** Значение — `<runtime>/<model-id>`
   (напр. `lmstudio/qwen3.8-27b`). Куда — по шеллу/ОС:
   - Есть `$SHELL` (macOS, Linux, WSL, git-bash): zsh → `~/.zshrc`, bash →
     `~/.bashrc`/`~/.bash_profile`, fish → `~/.config/fish/config.fish`
     (`set -gx OPENCODE_LOCAL_MODEL <value>` вместо `export`).
   - Нативный Windows без `$SHELL` (PowerShell): persist через
     `[Environment]::SetEnvironmentVariable("OPENCODE_LOCAL_MODEL", "<value>", "User")`
     (переживает перезапуск терминала без правки профиля) либо строка в
     `$PROFILE`.
   **Идемпотентно** в любом случае: если переменная/строка уже задана —
   заменить значение на месте, не дублировать.

6. **По желанию — алиас/функция** для одной командой поднять сервер +
   модель с тем же TTL (напр. `lms-start-<model>`), туда же, тоже
   идемпотентно (на Windows — функция в `$PROFILE`, не alias с `=`).

7. **Смоук-тест.** В чистой директории (не в рабочем дереве репозитория —
   не плодить случайные файлы в `hema`), напр. в scratch-директории:
   ```
   opencode run --model "$OPENCODE_LOCAL_MODEL" "Ответь одним словом: работаешь?"
   ```
   (на Windows PowerShell — `$env:OPENCODE_LOCAL_MODEL` вместо `$...`).
   Убедиться, что модель реально ответила (не ошибка подключения).

8. **Напомнить.** Новый терминал подхватит переменную сам; в уже открытых —
   `source` профиля (или перезапуск терминала на Windows, если писали через
   `SetEnvironmentVariable`). Модель нужно поднимать заново после
   перезагрузки машины/выхода из LM Studio/Ollama — это не автозапускается
   системой.

## Правила

- Каждый шаг — читаемое действие с понятным откатом (unload/остановка
  сервера, правка одной строки конфига) — ничего необратимого.
- Если у пользователя уже настроен `provider` с другим именем/структурой в
  глобальном конфиге — не переименовывать и не трогать его секции, только
  добавить свою.
- Не хардкодить в этом скилле конкретную модель/рантайм — узнавать заново
  на каждом прогоне (у разных разработчиков разное железо и разные модели).

## Ссылки

`docs/adr/0021-local-model-task-cards.md`, `docs/adr/0022-opencode-autorun.md`,
`.opencode/skill/implement-task/SKILL.md`, `.claude/skills/run-local-tasks/SKILL.md`.
