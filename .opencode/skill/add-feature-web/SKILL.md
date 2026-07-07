---
name: add-feature-web
description: Use when adding a new web feature to the HEMA Next.js frontend/BFF. Triggers on "новая web-фича", "добавь фичу на фронте", "add web feature", "новый экран", "новая страница", "BFF ручка", "route handler", "фича на клиенте". Scaffolds features/<f>/{api,model,ui}, BFF route handlers in app/api/**, following FSD import boundaries and state-management conventions (ADR 0005, 0006). Do NOT use for Go server modules (use add-module) or contract-only changes.
---

# Skill: add-feature-web

Создаёт новую web-фичу по FSD-aligned архитектуре (`web/AGENTS.md`, ADR 0005/0006).

## Эталоны

`web/src/features/auth/` и `web/src/features/admin/` — референсы структуры,
RQ-хуков, zustand-стора, BFF-ручек.

## Границы (FSD)

Импорт только вниз: `app → widgets → features → entities → shared`. `features`
**не** импортят друг друга. `lib/` (BFF-инфра: grpc, session) — отдельный
серверный слой.

## Правила транспорта

- Токены — только в httpOnly-cookie (`src/lib/session`). UI ходит в BFF по REST.
- gRPC-клиент — только на сервере (`src/lib/grpc`, Node runtime). Route Handlers:
  `export const runtime = "nodejs"`.
- BFF мапит `connect.Code` → HTTP-статусы (`src/lib/grpc/errors`).

## State (ADR 0006)

- Server-state в client-компонентах → TanStack Query (`api/requests.ts`
  fetchers, `api/keys.ts`, `use-*.ts` хуки).
- Cross-component UI-state → Zustand в `model/<name>-store.ts` (без server data).
- Local → `useState`. Server Components — дефолт для данных (gRPC напрямую).

## Шаги (test-first где есть логика, ADR 0009)

1. **Контракты.** Если нужны новые RPC — сначала `proto` + `make generate`
   (или скилл `add-module` на сервере).
2. **BFF ручка** (test-first) — `app/api/<...>/route.test.ts` (mock
   `globalThis.fetch`/grpc, маппинг `connect.Code`→HTTP) → затем
   `app/api/<...>/route.ts` (`runtime = "nodejs"`).
3. **entities** (если новая сущность) — `entities/<e>/lib/types.ts` (типы из
   proto), `model/` (server-only геттеры при необходимости).
4. **features/<f>/api/** (test-first) — `requests.ts` (fetchers, не голый
   `fetch` в хуках) + `keys.ts` (иерархические ключи) + `use-*.ts` (RQ-хуки).
   Тесты fetchers через `vi.stubGlobal("fetch", ...)`.
5. **features/<f>/model/** — zustand-стор для UI-состояния (если нужно).
6. **features/<f>/ui/** — компоненты. Server component по умолчанию;
   `"use client"` только для хуков/роутера/браузерных API. Цвета — токены
   (`bg-background`, ...), не хардкод.
7. **widgets/** — крупная композиция для роута (если нужно).
8. **app/** — страница/роут собирает widget/feature.

## Protobuf-моки (важно)

В тестах generated-типы строить через `create(Schema, partial)` из
`@bufbuild/protobuf` (`UserSchema`, `MeResponseSchema`, `TimestampSchema` из
`@bufbuild/protobuf/wkt`). После правок таких тестов обязателен
`pnpm exec tsc --noEmit` — Vitest transpile-only и не ловит `TS2322/TS2345`.

## Проверка

`pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`.

## shadcn/ui

Новый компонент: `pnpm dlx shadcn@latest add <component>` → коммитится в
`src/shared/ui/` (наш код, правим под проект).

## Ссылки

`web/AGENTS.md`, `docs/adr/0005-ui-architecture.md`,
`docs/adr/0006-state-management.md`, `docs/conventions.md`.
