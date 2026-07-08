# AGENTS.md — /web

> Next.js (App Router, TS, pnpm): UI + BFF. Дополняет корневой AGENTS.md.
> UI-архитектура — в ADR 0005 (FSD-aligned App Router + shadcn/ui + next-themes).
> State management — в ADR 0006 (TanStack Query + Zustand + useState).

## Роли

- **UI** — клиентские/серверные React-компоненты в `src/app` (роуты) и FSD-слоях
  (`shared`, `entities`, `features`, `widgets`).
- **BFF** — Route Handlers в `src/app/api/**` (Node runtime). REST наружу,
  gRPC/Connect (connect-es) внутрь к Go-серверу.

## Правила

1. **Токены — только в httpOnly-cookie** (`src/lib/session`). Браузерный JS их
   не видит. UI ходит в BFF по REST, BFF прокидывает токен в gRPC.
2. **gRPC-клиент — только на сервере** (`src/lib/grpc`, Node runtime).
   Не импортировать в клиентские компоненты. Server components / route
   handlers / `entities/*/model` (server-only) — могут.
3. **Route Handlers**: `export const runtime = "nodejs"` (нужен http2/gRPC).
4. **Generated — не трогать**: `src/gen/**` (из proto). Регенерация —
   `make generate` из корня.
5. **shadcn-компоненты — трогать можно**: `src/shared/ui/**` это наш код
   (НЕ gen). Коммитятся и правятся под проект. Не путать с `gen/`/`sqlc/`.
6. **FSD-границы импортов**: `app → widgets → features → entities → shared`.
   Слой импортит только нижележащие. `features` не импортят друг друга.
   `lib/` (BFF-инфраструктура) — отдельный слой, импортируется серверными
   модулями. См. ADR 0005.
7. **Тема**: dark + light через `next-themes` (`attribute="class"`). Цвета —
   CSS-переменные в `src/app/globals.css` (`:root` и `.dark`). Не хардкодить
   цвета в компонентах — использовать `bg-background`, `text-foreground` и т.п.
8. **Server component по умолчанию**. `"use client"` — только когда нужны
   хуки/роутер/браузерные API. Auth-состояние в server components — через
   `entities/user/model/get-current-user.ts`.
9. **TS-имена**: файлы — `kebab-case`; компоненты — `PascalCase`; хуки —
   `useXxx`. Соответствует `docs/conventions.md`.
10. **State management** (см. ADR 0006):
    - **Server state в client-компонентах** → TanStack Query (`useQuery` /
      `useMutation`). Fetchers в `features/<f>/api/requests.ts`, keys в
      `features/<f>/api/keys.ts`. QueryClient — `shared/lib/query-client.ts`,
      provider — `shared/lib/query-provider.tsx` (devtools в dev-only).
    - **Cross-component UI state** → Zustand store в
      `features/<f>/model/<name>-store.ts`. Без провайдеров. **Не класть server
      data в zustand** (утечка между запросами на сервере).
    - **Local component state** → `useState` / `useReducer`. Всегда уместен.
    - **Server Components — дефолт для данных**: SSR + gRPC напрямую, не
      дублируем в RQ без потребности. Prefetch + `HydrationBoundary` — когда
      нужен SSR-initial + client-refetch.

## Структура

```
src/
  app/                      роуты (App Router) + BFF route handlers
    (auth)/login,register   thin-страницы: deep-link stubs → открывают AuthDialog
    dashboard/              защищённый роут (server component)
    api/auth/**/route.ts    BFF: register/login/refresh/me/logout (Node runtime)
    layout.tsx              root layout: ThemeProvider + QueryProvider + Navbar
                            + AuthDialog (mounted directly, no provider)
    page.tsx                лендинг (server component)
    globals.css             Tailwind v4 entry + CSS-переменные темы
  shared/                   переиспользуемое БЕЗ бизнес-смысла
    ui/                     shadcn-компоненты (владеем, правим)
    lib/                    cn.ts, theme-provider.tsx, query-client.ts,
                            query-provider.tsx (RQ infra)
    hooks/                  общие хуки
    config/                 site-config (название, пункты навигации)
  entities/                 бизнес-сущности: модель + UI
    user/
      model/                getCurrentUser() — server-only (cookie + gRPC me)
      lib/                  types.ts (User из proto)
      ui/                   user-menu, user-avatar
  features/                 пользовательские фичи (срез по юзкейсу)
    auth/
      api/                  requests.ts (fetchers) + keys.ts + use-*.ts (RQ hooks)
      model/                auth-dialog-store.ts (zustand UI state)
      ui/                   AuthDialog, AuthForm, AuthCta
  widgets/                  крупные композиции для роутов
    navbar/                 Navbar (server), NavbarAuthButton (client),
                            ThemeToggle (client), UserMenu (client)
  lib/                      серверная инфраструктура BFF
    grpc/                   Connect-клиент + маппинг ошибок + сериализация
    session/                httpOnly cookie (set/clear/read)
  gen/                      proto→TS (DO NOT EDIT)
```

## Команды

| Команда        | Действие                       |
| -------------- | ------------------------------ |
| `pnpm install` | Установка зависимостей         |
| `pnpm dev`     | Локочный запуск (порт WEB_PORT)|
| `pnpm build`   | Прод-сборка                    |
| `pnpm lint`    | Линт                           |
| `pnpm test`    | Юнит-тесты (Vitest)            |

## Тестирование

- Vitest для чистой логики: маппинг ошибок, сериализация proto→JSON,
  `getCurrentUser` (mock cookie + gRPC), auth fetchers (mock `globalThis.fetch`),
  zustand stores.
- **BFF e2e-тесты** (`*.e2e.test.ts`, ADR 0010) — НЕ мокают `tournamentToJson`
  и аналоги; реальный `toJson` по реальному proto-ответу, мок-транспорт
  connect-es через `vi.stubGlobal("fetch", ...)`. Ловят proto3-omitted,
  NaN-enum, round-trip опциональных timestamp'ов. Суффикс `.e2e.test.ts` для
  читабельности; в `pnpm test` входят по умолчанию (дешёвые, без Docker).
- Protobuf-моки: generated-типы (`User`, `MeResponse`, `Timestamp`, ...) имеют
  brand `$typeName` от `Message<"...">`. Plain-объекты не присваиваются — `tsc`
  в CI ловит `TS2322`/`TS2345`, даже если Vitest (transpile-only) проходит.
  Используй `create(Schema, partial)` из `@bufbuild/protobuf` со сгенерированными
  схемами (`UserSchema`, `MeResponseSchema`, `TimestampSchema` из
  `@bufbuild/protobuf/wkt`). Локально всегда проверяй `pnpm exec tsc --noEmit`
  после изменения тестов с protobuf-моками — `pnpm test`alone не ловит.
- Скриншотные тесты намеренно не используем (см. ADR 0003).
- Каждый инкремент UI/BFF-логики содержит тесты.

## Окружение

- `SERVER_GRPC_URL` — адрес Go-сервера (по умолчанию `http://localhost:8080`).
- `WEB_PORT` — порт Next.js (по умолчанию 3000).

## shadcn/ui

Добавление нового shadcn-компонента:

```bash
pnpm dlx shadcn@latest add <component>
```

`components.json` указывает алиасы: `ui → @/shared/ui`, `utils → @/shared/lib/cn`.
Компоненты коммитятся в `src/shared/ui/`. Под проект — правим прямо (это наш
код, не сгенерированный).
