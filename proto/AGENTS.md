# AGENTS.md — /proto

> Единый источник контрактов API. **Любое изменение API начинается здесь.**

## Правила

1. Меняем API ТОЛЬКО в `.proto`. Затем `make generate` из корня.
   Генерация идёт **в контейнере** (нужен запущенный Docker), а не на хосте.
2. Сгенерированный код (`server/gen`, `web/src/gen`) — `DO NOT EDIT`.
3. Пакет — `hema.v1`. Ломающие изменения → новая версия (`hema.v2`).
4. Именование: сервисы `XxxService`, RPC — глаголы, сообщения —
   `XxxRequest`/`XxxResponse`.
5. **Никаких `remote:`-плагинов в `buf.gen.yaml`.** Удалённое исполнение на
   `buf.build` недоступно из контура препрода (403 Forbidden на любой запрос)
   и ломает `make deploy` на первом шаге. Плагины — только `local:`, бинари
   приезжают из образа `deploy/codegen.Dockerfile`, версии задаются
   `server/go.mod` и `web/package.json`. Страж —
   `server/internal/codegen/buf_gen_config_test.go`. См.
   `docs/adr/0023-local-codegen-plugins.md`.

## Структура

```
proto/
  buf.yaml          конфиг модуля buf (lint/breaking)
  buf.gen.yaml      плагины генерации: Go (connect-go) + TS (connect-es);
                    ТОЛЬКО `local:` — см. правило 5 ниже
  hema/v1/
    common.proto    общие сообщения (User, TokenPair)
    auth.proto      AuthService (Register/Login/Refresh/Me)
```

## Команды

| Команда             | Действие                                  |
| ------------------- | ----------------------------------------- |
| `go tool buf lint`  | Линт proto (хостовый buf, сеть не нужна)  |
| `make generate`     | Генерация Go+TS — `buf` в контейнере кодгена |
| `make codegen-image`| Пересобрать образ кодгена (при смене версий) |

## Выходы генерации

- Go → `server/gen/hema/v1/*.pb.go` + `.../hemav1connect/*.connect.go`
- TS → `web/src/gen/hema/v1/*_pb.ts` + connect-сервисы

Gen-код **не хранится в репо** (см. ADR 0004) — генерируется локально
(`make generate`) и в CI. После изменения `.proto` всегда перегенерируй.
