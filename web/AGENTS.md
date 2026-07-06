# AGENTS.md — /web

> Next.js (App Router, TS, pnpm): UI + BFF. Дополняет корневой AGENTS.md.

## Роли

- **UI** — клиентские/серверные React-компоненты в `src/app`.
- **BFF** — Route Handlers в `src/app/api/**` (Node runtime). REST наружу,
  gRPC/Connect (connect-es) внутрь к Go-серверу.

## Правила

1. **Токены — только в httpOnly-cookie** (`src/lib/session`). Браузерный JS их
   не видит. UI ходит в BFF по REST, BFF прокидывает токен в gRPC.
2. **gRPC-клиент — только на сервере** (`src/lib/grpc`, Node runtime).
   Не импортировать в клиентские компоненты.
3. **Route Handlers**: `export const runtime = "nodejs"` (нужен http2/gRPC).
4. **Generated — не трогать**: `src/gen/**` (из proto). Регенерация —
   `make generate` из корня.

## Структура

```
src/
  app/
    (auth)/login,register    страницы входа/регистрации + общая AuthForm
    dashboard/               защищённый роут (server component + logout)
    api/auth/**/route.ts     BFF: register/login/refresh/me/logout
  lib/
    grpc/                    Connect-клиент (client.ts) + маппинг ошибок
    session/                 httpOnly cookie (set/clear/read)
  gen/                       proto→TS (DO NOT EDIT)
```

## Команды

| Команда        | Действие                       |
| -------------- | ------------------------------ |
| `pnpm install` | Установка зависимостей         |
| `pnpm dev`     | Локальный запуск (порт WEB_PORT)|
| `pnpm build`   | Прод-сборка                    |
| `pnpm lint`    | Линт                           |
| `pnpm test`    | Юнит-тесты (Vitest)            |

## Тестирование

- Vitest для чистой логики: маппинг ошибок, сериализация proto→JSON.
- Скриншотные тесты намеренно не используем.
- Каждый инкремент BFF-логики содержит тесты.

## Окружение

- `SERVER_GRPC_URL` — адрес Go-сервера (по умолчанию `http://localhost:8080`).
- `WEB_PORT` — порт Next.js (по умолчанию 3000).
