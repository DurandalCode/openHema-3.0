# AGENTS.md — /proto

> Единый источник контрактов API. **Любое изменение API начинается здесь.**

## Правила

1. Меняем API ТОЛЬКО в `.proto`. Затем `make generate` из корня.
2. Сгенерированный код (`server/gen`, `web/src/gen`) — `DO NOT EDIT`.
3. Пакет — `hema.v1`. Ломающие изменения → новая версия (`hema.v2`).
4. Именование: сервисы `XxxService`, RPC — глаголы, сообщения —
   `XxxRequest`/`XxxResponse`.

## Структура

```
proto/
  buf.yaml          конфиг модуля buf (lint/breaking)
  buf.gen.yaml      плагины генерации: Go (connect-go) + TS (connect-es)
  hema/v1/
    common.proto    общие сообщения (User, TokenPair)
    auth.proto      AuthService (Register/Login/Refresh/Me)
```

## Команды

| Команда             | Действие                                  |
| ------------------- | ----------------------------------------- |
| `go tool buf lint`  | Линт proto                                |
| `go tool buf generate` | Генерация Go+TS (обычно `make generate`) |

## Выходы генерации

- Go → `server/gen/hema/v1/*.pb.go` + `.../hemav1connect/*.connect.go`
- TS → `web/src/gen/hema/v1/*_pb.ts` + connect-сервисы

Gen-код **не хранится в репо** (см. ADR 0004) — генерируется локально
(`make generate`) и в CI. После изменения `.proto` всегда перегенерируй.
