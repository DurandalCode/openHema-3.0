---
task: T2
feature: docs/specs/0046-preprod-access-gate/
status: done
requires: local
depends_on: []
---

# T2 — `shared/config/preprod.ts`: флаги режима препродакшена

> Артефакт ADR 0021. Самодостаточная карточка: исполнитель работает
> **только** с этим файлом и файлами, которые он явно называет — не
> заглядывает в `AGENTS.md`, `spec.md`, `plan.md` или другие задачи.

## Цель

Два чистых серверных helper'а, читающих переменные окружения web-процесса:
`isPreprodModeEnabled()` и `isRegistrationDisabled()`. Ничего, кроме
объявления и теста этих двух функций, эта задача не делает.

## Контекст

Существующий в проекте способ читать boolean-подобный `process.env` строкой
сравнения — ориентир на стиль, не на копирование (`web/src/lib/session/cookies.ts:10`):

```ts
const isProd = process.env.NODE_ENV === "production";
```

Соседний по каталогу файл-конфиг того же духа (голые экспортируемые
функции/константы без сайд-эффектов), `web/src/shared/config/protected-routes.ts`:

```ts
const PROTECTED_PREFIXES = ["/dashboard", "/applications", "/admin"];
const NOMINATION_APPLY_RE = /^\/nominations\/[^/]+\/apply(\/|$)/;

export function isProtectedRoute(pathname: string): boolean {
  if (PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return true;
  }
  return NOMINATION_APPLY_RE.test(pathname);
}
```

Тестовый файл рядом, `web/src/shared/config/protected-routes.test.ts` —
ориентир на стиль теста чистой функции (плоские `describe`/`it`, без моков
и без JSX):

```ts
import { describe, expect, it } from "vitest";
import { isProtectedRoute } from "./protected-routes";

describe("isProtectedRoute", () => {
  it("treats the dashboard as protected", () => {
    expect(isProtectedRoute("/dashboard")).toBe(true);
  });
  // ...
});
```

## Red — тест первым

Путь: `web/src/shared/config/preprod.test.ts`

Два `describe`, по одному на функцию (`isPreprodModeEnabled`,
`isRegistrationDisabled`). У каждой — 3 сценария:

- Given: `process.env.PREPROD_MODE` (соотв. `REGISTRATION_DISABLED`) не
  задан (`delete`) — When: вызов функции — Then: `false`.
- Given: значение — точная строка `"true"` — When: вызов — Then: `true`.
- Given: любое другое непустое значение (например `"1"` или `"TRUE"`) —
  When: вызов — Then: `false`.

Каждый тест должен восстанавливать исходное значение переменной после себя
(`afterEach`, как принято в проекте для мутируемого `process.env` —
см. `web/src/app/api/files/[id]/route.test.ts`, работа с
`process.env.SERVER_GRPC_URL` через `originalEnv`/`afterEach`), чтобы не
протекать в другие тестовые файлы, запускаемые в том же процессе.

## Green — минимальная реализация

Путь: `web/src/shared/config/preprod.ts`

Две named-export функции без состояния и без кеша (значение читается заново
при каждом вызове — иначе тесты, меняющие `process.env` между кейсами,
станут недетерминированными): `isPreprodModeEnabled(): boolean` и
`isRegistrationDisabled(): boolean`, каждая — прямое сравнение
`process.env.<ИМЯ> === "true"`, по образцу `isProd` из Контекста.

## Acceptance

Команда: `pnpm --dir web exec vitest run src/shared/config/preprod.test.ts`

Критерий: все тесты из Red зелёные.

## Boundaries

- Не создавать файлы сверх `web/src/shared/config/preprod.ts` и
  `web/src/shared/config/preprod.test.ts`.
- Не трогать: `.env.example`, `web/src/shared/config/protected-routes.ts`,
  `web/src/shared/config/session-cookies.ts`, `web/src/shared/config/site-config.ts`.
- Не добавлять кеширование/мемоизацию, доп. параметры или варианты
  сигнатуры — ровно две функции `(): boolean`, как в Цели.
