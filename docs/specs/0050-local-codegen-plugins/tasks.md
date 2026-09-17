# Tasks: Кодген контрактов без внешнего реестра плагинов

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: in progress (остался T17b — передеплой на ВМ)
- Дата: 2026-09-17
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах.

**T1 необратим по времени** — эталон снимается, пока удалённые плагины ещё
работают с машины разработчика; после правки шаблона воспроизвести его нечем.

Треков параллельности нет: фича маленькая, а оба стража зеленеют только когда
переведены и шаблон, и образ — дробить на worktree дороже, чем выполнить
последовательно.

## Эталон

- [x] T1. **Снимок текущего результата генерации** (для AC-3) — снят до любых
      правок: 29 файлов `server/gen` + `web/src/gen`, шапки подтверждают
      `protoc-gen-go v1.36.12` и `protoc-gen-es v2.15.0`.

## Стражи (red)

- [x] T2. **`server/internal/codegen/buf_gen_config_test.go`** — читает
      `proto/buf.gen.yaml`, требует у каждого плагина ключ `local` и отсутствие
      `remote`; сообщение об ошибке объясняет причину (реестр недоступен из
      контура препрода) со ссылкой на ADR 0023. **Красный**: сегодня все три
      плагина — `remote`.
- [x] T3. **`web/codegen-versions.test.ts`** (Vitest) — версия
      `@bufbuild/protoc-gen-es` в `devDependencies` обязана быть точной (без
      `^`/`~`) и совпадать с версией `@bufbuild/protobuf` в `dependencies`.
      **Красный**: генератора в манифесте ещё нет.

## Образ кодгена (green)

- [x] T4. **`deploy/codegen.Dockerfile`** — стадия `golang:1.26-alpine`
      (только `server/go.mod`/`go.sum` → `buf`, `protoc-gen-go`,
      `protoc-gen-connect-go`, `CGO_ENABLED=0`, `GOTOOLCHAIN=local`) +
      финальная `node:22-alpine` (Go-бинари в `/usr/local/bin`, версия
      `@bufbuild/protoc-gen-es` вычитывается из скопированного
      `web/package.json` и ставится `npm i -g`). Контекст сборки — корень репо.
- [x] T5. **Версии в манифестах** — `server/go.mod`:
      `google.golang.org/protobuf` → `v1.36.12` (+ `go mod tidy`);
      `web/package.json`: devDependency `@bufbuild/protoc-gen-es` = `2.15.0`
      (точно), dependency `@bufbuild/protobuf` → `2.15.0`; `pnpm install`
      обновляет lock. **T3 зеленеет.**
- [x] T6. **`proto/buf.gen.yaml`** — три плагина с `remote:` на `local:`
      (`protoc-gen-go`, `protoc-gen-connect-go`, `protoc-gen-es`), `out`/`opt`
      и `clean: true` сохраняются. **T2 зеленеет.**
- [x] T7. **Makefile** — цель `codegen-image` (`docker build -f
      deploy/codegen.Dockerfile -t hema-codegen .`) и переписанная `generate`
      (запуск `buf` в контейнере: `-u $(id -u):$(id -g)`, `-e HOME=/tmp`,
      `-v $(CURDIR):/src -w /src/server`), зависящая от `codegen-image`.
      `codegen`, `dev`, `prod`, `deploy`, `sqlc`, `lint-proto` не трогать.
      Help-строки (`##`) обязательны — цели попадают в `make help`.

## Проверка эквивалентности

- [x] T8. **AC-3** — `make generate`, затем `diff -r` эталона T1 с
      `server/gen` и `web/src/gen`. Ожидание — пусто. Любое расхождение
      разобрать: либо устранить выравниванием версии, либо объяснить в ADR.
- [x] T9. **AC-7** — убедиться, что генерация не опирается на хостовые
      инструменты: в цели `generate` не остаётся ни одного вызова `go tool`,
      а запуск проходит на рабочей копии без `web/node_modules`.
- [x] T10. **Права на файлы** — после генерации из контейнера файлы
      принадлежат текущему пользователю (не `root`) и повторный `make generate`
      проходит без ручного `chown`.

## CI

- [x] T11. **`.github/workflows/ci.yml`** — новая джоба `codegen` (buildx с
      `cache-from/to: type=gha`, `load: true` → `make generate` + `make sqlc` →
      `upload-artifact` с `server/gen`, `web/src/gen`,
      `server/modules/*/repo/sqlc`); остальные джобы получают `needs: codegen`,
      их шаги генерации заменяются на `download-artifact`. `web-eslint` и
      `proto-lint` не трогать.

## Документация

- [x] T12. **ADR 0023** — `docs/adr/0023-local-codegen-plugins.md`: контекст,
      решение, последствия, отклонённые варианты (см. раздел «Документация»
      плана).
- [x] T13. **Инструкции** — `proto/AGENTS.md` (запрет `remote:`-плагинов со
      ссылкой на ADR 0023, актуальная команда) и корневой `AGENTS.md`
      («Онбординг» + таблица команд: кодгену нужен Docker, не установленные
      генераторы).

## Проверка

- [x] T14. `make test-all` зелёный (включая T2 и T3).
- [x] T15. `cd server && go build ./... && go vet ./...`;
      `cd web && pnpm exec tsc --noEmit && pnpm build`.
- [x] T16. `make test-integration` (Docker) — прикладной код не менялся,
      прогон подтверждает, что перегенерированный код не разошёлся с БД-слоем.
- [x] T17a. **AC-1 на препрод-ВМ — пройдено.** Рабочая копия доставлена в
      отдельный каталог на ВМ (живой стек не тронут), образ собран там же
      (~6 мин на 2 CPU, 447 МБ), `make generate` отработал **за 6.6 с** на
      машине, где до этого падал `permission_denied: 403 Forbidden`.
      29 файлов, владелец `tylys96:tylys96` (не root), шапки — `protoc-gen-go
      v1.36.12` / `protoc-gen-es v2.15.0`, хэши **побайтово совпали** с
      эталоном T1 (arm64 macOS ↔ amd64 Linux). Попутно вскрыты два свойства
      окружения ВМ, оба учтены в Dockerfile/Makefile и описаны в ADR 0023:
      BuildKit там недоступен (нет `buildx`) и у контейнеров нет DNS-егресса
      (цепочка `DOCKER-USER` дропает UDP 53).
- [ ] T17b. **AC-2 — `make deploy` на ВМ.** Не выполнено: требует коммита и
      пуша ветки, а затем передеплоя живого препрода — обе операции за рамками
      того, что было поручено. Выполнять владельцу: `git pull` → `make deploy`.
- [ ] T18. `deploy/local/preprod-vps.md` (личный, вне git) — отметить, что
      доустанавливать на ВМ ничего не потребовалось.
- [ ] T19. Обновить статусы `spec.md`/`plan.md`/`tasks.md` и строку индекса в
      `docs/specs/README.md`.
