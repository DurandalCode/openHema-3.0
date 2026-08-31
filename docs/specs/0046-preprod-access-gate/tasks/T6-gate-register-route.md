---
task: T6
feature: docs/specs/0046-preprod-access-gate/
status: pending
requires: local
depends_on: [T2]
---

# T6 — гейт `POST /api/auth/register` (пауза регистрации)

> Артефакт ADR 0021. Самодостаточная карточка: исполнитель работает
> **только** с этим файлом и файлами, которые он явно называет — не
> заглядывает в `AGENTS.md`, `spec.md`, `plan.md` или другие задачи.

## Цель

`POST /api/auth/register` отклоняет запрос (не вызывая gRPC `Register`),
если включён `REGISTRATION_DISABLED` **или** `PREPROD_MODE` (регистрация не
входит в исключения гейта — иначе гейт обходился бы одной регистрацией,
см. `spec.md`, FR-4). У файла сегодня нет теста вовсе — создать его с нуля.

**Предполагается, что `web/src/shared/config/preprod.ts` с функциями
`isPreprodModeEnabled()`/`isRegistrationDisabled(): boolean` уже
существует** (задача T2) — не создавать его заново, только импортировать.

## Контекст

`web/src/app/api/auth/register/route.ts` (текущее содержимое целиком):

```ts
import { NextRequest, NextResponse } from "next/server";
import { authClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { setSessionCookies } from "@/lib/session/cookies";
import { userToJson } from "@/lib/grpc/serialize";

export const runtime = "nodejs";

/** POST /api/auth/register — регистрация нового пользователя. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { email, password, displayName } = await req.json();
    const res = await authClient.register({ email, password, displayName });

    if (res.tokens) {
      await setSessionCookies(res.tokens.accessToken, res.tokens.refreshToken);
    }

    return NextResponse.json({ user: userToJson(res.user) });
  } catch (err) {
    return errorResponse(err);
  }
}
```

У файла нет `route.test.ts` — соседний тест того же семейства (вход/
регистрация/профиль), на чей мок-стиль ориентироваться,
`web/src/app/api/auth/profile/route.test.ts`:

```ts
import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  authClient: { updateProfile: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  userToJson: vi.fn((u) => u),
}));

import { authClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { userToJson } from "@/lib/grpc/serialize";
import { PATCH } from "./route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/auth/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("app/api/auth/profile route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no access token cookie", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await PATCH(req({ displayName: "Иван Кравцов", club: "Северный клинок" }));
    expect(res.status).toBe(401);
    expect(authClient.updateProfile).not.toHaveBeenCalled();
  });

  // ... остальные it — не relevant для этой задачи, но показывают общий
  // стиль: req-хелпер строит NextRequest, мок настраивается в теле it.
});
```

`register/route.ts` не использует `getAccessToken` (регистрация — для
анонима), поэтому мокировать `@/lib/session/cookies` не нужно; вместо этого
понадобится мок `@/shared/config/preprod` (по образцу мока модуля из T3 —
`vi.mock("@/shared/config/preprod", () => ({ isPreprodModeEnabled: vi.fn(), isRegistrationDisabled: vi.fn() }));`).

## Red — тест первым

Путь: `web/src/app/api/auth/register/route.test.ts` (новый файл)

Замокать `@/lib/grpc/client` (`authClient.register`),
`@/lib/session/cookies` (`setSessionCookies`), `@/lib/grpc/serialize`
(`userToJson`) — по образцу моков из Контекста — и
`@/shared/config/preprod` (обе функции, оба default `false`, если не
переопределены в конкретном тесте). Сценарии:

- Given: оба флага `false` (как сегодня) — When: `POST` с валидным телом
  (`email`/`password`/`displayName`) — Then: `authClient.register`
  вызывается с этими полями, ответ `200` с `{ user }` (счастливый путь —
  тест на то, что гейт ничего не сломал в обычном режиме).
- Given: `isRegistrationDisabled()` → `true` — When: `POST` — Then:
  `res.status` — код отказа на ваш выбор из уже принятых в проекте для
  такого рода отказов (см. `errors.ts`, `codeToStatus` — `403` для
  `PermissionDenied` — этот код и используйте прямо в `NextResponse.json`,
  не через `errorResponse`/`ConnectError`, ошибка не от gRPC), `authClient.register`
  не вызван.
- Given: `isPreprodModeEnabled()` → `true` (а `isRegistrationDisabled()` →
  `false`) — When: `POST` — Then: тот же код отказа, `authClient.register`
  не вызван (FR-4 — регистрация гасится и препрод-режимом тоже).

## Green — минимальная реализация

Путь: `web/src/app/api/auth/register/route.ts`

Импортировать `isPreprodModeEnabled`/`isRegistrationDisabled` из
`@/shared/config/preprod`. Первая строка тела `POST`, до
`const { email, password, displayName } = await req.json();`: если
`isRegistrationDisabled() || isPreprodModeEnabled()` — вернуть
`NextResponse.json({ error: ... }, { status: 403 })` (короткая причина в
`error`, как у остальных ручек проекта) и не вызывать `authClient.register`.

## Acceptance

Команда: `pnpm --dir web exec vitest run src/app/api/auth/register/route.test.ts`

Критерий: все три теста из Red зелёные.

## Boundaries

- Не создавать файлы сверх `route.ts` (правка) и `route.test.ts` (новый) в
  `app/api/auth/register/`.
- Не трогать: `web/src/shared/config/preprod.ts` (уже существует, T2),
  `app/api/auth/login/route.ts` и остальные `app/api/auth/**` ручки — они
  не гейтуются этой задачей.
- Не добавлять гейт на уровне `authClient`/gRPC — только на уровне этого
  BFF-роута (решение пользователя, `plan.md`: гейт web/BFF-only).
