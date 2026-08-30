---
task: T4
feature: docs/specs/0046-preprod-access-gate/
status: pending
requires: local
depends_on: [T3]
---

# T4 — гейт `GET /api/tournament` и `GET /api/files/[id]`

> Артефакт ADR 0021. Самодостаточная карточка: исполнитель работает
> **только** с этим файлом и файлами, которые он явно называет — не
> заглядывает в `AGENTS.md`, `spec.md`, `plan.md` или другие задачи.

## Цель

Подключить гейт `assertPreprodAccess()` (уже существует, задача T3, путь
`web/src/lib/grpc/preprod-guard.ts`, сигнатура `(): Promise<NextResponse | null>`)
первой строкой в двух публичных `GET`-ручках: `app/api/tournament/route.ts`
и `app/api/files/[id]/route.ts`. Плюс по одному regression-тесту на файл:
без сессии в preprod-режиме ручка отдаёт `401` и не идёт в апстрим; с
сессией — работает как раньше.

**Предполагается, что `web/src/lib/grpc/preprod-guard.ts` уже существует**
(задача T3) — не создавать его заново, только импортировать.

## Контекст

`web/src/app/api/tournament/route.ts` — релевантная часть (`PUT` в файле
есть, не показан здесь и не трогается этой задачей):

```ts
import { NextResponse, type NextRequest } from "next/server";
// ... остальные импорты без изменений
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

/** GET /api/tournament — активный турнир (публичный, без auth). */
export async function GET(): Promise<NextResponse> {
  try {
    const res = await tournamentClient.getActiveTournament({});
    return NextResponse.json({ tournament: tournamentToJson(res.tournament) });
  } catch (err) {
    return errorResponse(err);
  }
}

/** PUT /api/tournament — обновление профиля активного турнира (только admin). */
export async function PUT(req: NextRequest): Promise<NextResponse> {
  // ... НЕ ТРОГАТЬ
}
```

`web/src/app/api/tournament/route.test.ts` — верхняя часть (файл большой,
`describe("PUT", ...)` не трогается):

```ts
import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContactType } from "@/gen/hema/v1/tournament_pb";

vi.mock("@/lib/session/cookies", () => ({ getAccessToken: vi.fn() }));
vi.mock("@/lib/grpc/client", () => ({
  tournamentClient: { getActiveTournament: vi.fn() },
  tournamentAdminClient: { updateActiveTournament: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({ tournamentToJson: vi.fn((t) => t) }));

import { tournamentAdminClient, tournamentClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { tournamentToJson } from "@/lib/grpc/serialize";
import { GET, PUT } from "./route";

describe("app/api/tournament route", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe("GET", () => {
    it("returns tournament JSON on ok", async () => { /* ... */ });
    it("maps ConnectError NotFound → 404", async () => { /* ... */ });
  });

  describe("PUT", () => {
    // ... МНОГО тестов — не трогать вообще, файл продолжается за этой точкой.
  });
});
```

`web/src/app/api/files/[id]/route.ts` (текущее содержимое целиком):

```ts
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const PROXIED_HEADERS = ["content-type", "x-content-type-options", "content-disposition"];

/**
 * GET /api/files/[id] — публичный проксирующий эндпоинт (без cookie,
 * регламент/эмблема видны и гостю, FR-35) ...
 */
export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const { id } = await ctx.params;
  const baseUrl = process.env.SERVER_GRPC_URL ?? "http://localhost:8080";

  const upstream = await fetch(`${baseUrl}/files/${id}`);

  const headers = new Headers();
  for (const name of PROXIED_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }

  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
```

`web/src/app/api/files/[id]/route.test.ts` (текущее содержимое целиком):

```ts
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function req(): NextRequest {
  return new NextRequest("http://localhost/api/files/abc123", { method: "GET" });
}

describe("app/api/files/[id] route (spec 0042, T37)", () => {
  const originalEnv = process.env.SERVER_GRPC_URL;

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.SERVER_GRPC_URL = originalEnv;
  });

  it("proxies the file, preserving Content-Type/nosniff/Content-Disposition", async () => { /* ... */ });
  it("defaults to http://localhost:8080 when SERVER_GRPC_URL is unset", async () => { /* ... */ });
  it("propagates a 404 from the upstream server", async () => { /* ... */ });
});
```

`assertPreprodAccess()` (T3): при выключенном `PREPROD_MODE` возвращает
`null`, не вызывая `getCurrentUser()` — поэтому существующие тесты обоих
файлов продолжат проходить без единой правки: `PREPROD_MODE` в тестовом
окружении не задан, гейт молча пропускает. Мокать
`@/entities/user/model/get-current-user` нужно только для новых тестов, где
`PREPROD_MODE` явно ставится в `"true"`.

## Red — тест первым

В обоих тестовых файлах: замокать `@/entities/user/model/get-current-user`
(по образцу мока из `T3`/`app/(admin)/layout.test.tsx` — простой
`vi.fn()`), добавить `afterEach`, восстанавливающий
`process.env.PREPROD_MODE` (в `files/[id]/route.test.ts` — рядом с уже
существующим восстановлением `SERVER_GRPC_URL`).

**`tournament/route.test.ts`**, внутри `describe("GET", ...)`, два новых
`it` после существующих (не трогая `describe("PUT", ...)`):

- Given: `PREPROD_MODE="true"`, мок `getCurrentUser` → `null` — When:
  `GET()` — Then: `res.status === 401`, `tournamentClient.getActiveTournament`
  не вызван.
- Given: `PREPROD_MODE="true"`, мок `getCurrentUser` → произвольный
  пользователь, апстрим замокан как в счастливом пути — When: `GET()` —
  Then: `res.status === 200` (гейт не мешает залогиненному).

**`files/[id]/route.test.ts`**, один новый `it` после существующих:

- Given: `PREPROD_MODE="true"`, мок `getCurrentUser` → `null` — When:
  `GET(req(), ctx("abc123"))` — Then: `res.status === 401`, глобальный
  `fetch` не вызван (проксирования не было).

## Green — минимальная реализация

В обоих `route.ts`: импортировать `assertPreprodAccess` из
`@/lib/grpc/preprod-guard` и вызвать его первой строкой тела `GET` —
`const gate = await assertPreprodAccess(); if (gate) return gate;` — до
любой другой работы функции (в `tournament/route.ts` — до `try {`
существующего тела; в `files/[id]/route.ts` — до
`const { id } = await ctx.params;`). `PUT` в `tournament/route.ts` не
трогать — он уже требует токен, не публичный.

## Acceptance

Команда: `pnpm --dir web exec vitest run src/app/api/tournament/route.test.ts src/app/api/files/\[id\]/route.test.ts`

Критерий: все тесты обоих файлов зелёные — старые без единой правки
ожиданий, новые три (два в tournament, один в files) — из Red выше.

## Boundaries

- Не создавать файлы сверх `route.ts`/`route.test.ts` в
  `app/api/tournament/` и `app/api/files/[id]/`.
- Не трогать: `PUT` в `app/api/tournament/route.ts` и `describe("PUT", ...)`
  в его тесте, `web/src/lib/grpc/preprod-guard.ts` (уже существует).
- Не менять существующие ожидания (`expect`) в уже существующих `it` —
  только добавлять новые.
