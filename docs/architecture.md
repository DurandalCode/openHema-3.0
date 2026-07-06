# Архитектура HEMA Tournament

## Обзор потоков

```
┌──────────┐   REST/JSON    ┌─────────────────┐   gRPC/Connect   ┌──────────────┐
│ Browser  │ ─────────────► │  Next.js BFF     │ ───────────────► │  Go server   │
│ (React)  │ ◄───────────── │  (Route Handlers)│ ◄─────────────── │  (monolith)  │
└──────────┘   httpOnly     └─────────────────┘   protobuf        └──────┬───────┘
                cookie                                                     │ pgx
                                                                          ▼
                                                                   ┌──────────────┐
                                                                   │  PostgreSQL  │
                                                                   │ schema/module│
                                                                   └──────────────┘
```

- **Browser ↔ BFF**: REST/JSON. Токены живут в `httpOnly`-cookie, браузер не
  видит JWT напрямую.
- **BFF ↔ Server**: gRPC поверх Connect (connect-es → connect-go). BFF
  извлекает access-токен из cookie и прокидывает в gRPC-метаданные.
- **Server ↔ PostgreSQL**: pgx pool, типобезопасные запросы через sqlc.

## Модульный монолит

Сервер — единый бинарь, собранный из независимых модулей (bounded contexts).

- Модуль = вертикальный срез: `proto → api → service → domain → repo → migrations`.
- Каждый модуль владеет **своей PG-схемой** (`auth.*`, `tournament.*`, ...).
  Кросс-модульных JOIN нет; чужие данные — только через API модуля.
- Модуль экспортирует `Register(mux, deps)`. `cmd/server` регистрирует все
  модули (монолит); `cmd/<module>` — один модуль (будущий микросервис).
- Межмодульные вызовы — через Connect-интерфейсы: in-process в монолите, по
  сети при выносе. Код вызывающего не меняется.

## Авторизация

```
POST /api/auth/register → AuthService.Register → argon2id hash → INSERT user
POST /api/auth/login    → AuthService.Login    → argon2id verify → issue JWT
                          BFF кладёт access+refresh в httpOnly cookie
GET  /api/auth/me       → BFF читает cookie → AuthService.Me (verify access JWT)
POST /api/auth/refresh  → AuthService.Refresh (verify refresh) → новый access
POST /api/auth/logout   → BFF чистит cookie
```

- access JWT ~15 мин, refresh ~30 дней (оба — JWT).
- В v1 refresh не хранится в БД; отзыв токенов — отдельный будущий ADR.

## Границы и вынос в микросервисы

Вынос модуля в отдельный сервис — механический:
1. Собрать `cmd/<module>/main.go`, регистрирующий только этот модуль.
2. Переключить in-process клиент на сетевой Connect-транспорт.
3. Схема БД модуля переезжает вместе с ним.
