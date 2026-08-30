---
task: T5
feature: docs/specs/0046-preprod-access-gate/
status: pending
requires: local
depends_on: [T3]
---

# T5 — гейт 11 оставшихся публичных `GET`-ручек (один паттерн, много файлов)

> Артефакт ADR 0021. Самодостаточная карточка: исполнитель работает
> **только** с этим файлом и файлами, которые он явно называет — не
> заглядывает в `AGENTS.md`, `spec.md`, `plan.md` или другие задачи.
>
> Это батч-карточка (правило skill'а «одинаковый паттерн правки по многим
> файлам — не N карточек, а один эталон + список»): ниже один файл разобран
> полностью как образец, остальные десять — списком с точками, в которых их
> обработчик отличается от образца. Применить тот же паттерн к каждому —
> самостоятельно, не ждать, что для них тоже распишут финальный код.

## Цель

В каждой из 11 публичных `GET`-ручек ниже вызвать `assertPreprodAccess()`
(уже существует, задача T3, путь `web/src/lib/grpc/preprod-guard.ts`,
сигнатура `(): Promise<NextResponse | null>`) первой строкой обработчика, и
добавить в соответствующий тестовый файл один regression-тест: без сессии в
preprod-режиме ручка отдаёт `401`, апстрим-клиент не вызывается.

**Предполагается, что `web/src/lib/grpc/preprod-guard.ts` уже существует**
(задача T3) — не создавать его заново, только импортировать. Гейт мокается
напрямую (`vi.mock("@/lib/grpc/preprod-guard", ...)`) — не через
`PREPROD_MODE`/`getCurrentUser`, это проще для повторяющегося тонкого теста
(в отличие от T4, где представитель тестировался через реальный guard).

## Эталон: `app/api/nominations/[id]/participants/route.ts`

Текущее содержимое (без изменений, которые предстоит внести):

```ts
import { NextResponse, type NextRequest } from "next/server";
import { applicationPublicClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { nominationParticipantsToJson } from "@/lib/grpc/serialize";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/nominations/[id]/participants — публичный стартовый лист
 * номинации ...
 */
export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const { id } = await ctx.params;

  try {
    const res = await applicationPublicClient.listNominationParticipants({
      nominationId: id,
    });
    return NextResponse.json({ /* ... */ });
  } catch (err) {
    return errorResponse(err);
  }
}
```

Тест рядом, `.../participants/route.test.ts` (текущее содержимое целиком):

```ts
import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/grpc/client", () => ({
  applicationPublicClient: { listNominationParticipants: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  nominationParticipantsToJson: vi.fn((p) => p),
}));

import { applicationPublicClient } from "@/lib/grpc/client";
import { GET } from "./route";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("app/api/nominations/[id]/participants route (public)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns participants and counters without requiring a token", async () => { /* ... */ });
  it("returns null fighterCapacity when not set", async () => { /* ... */ });
  it("maps CodeNotFound to 404", async () => { /* ... */ });
});
```

### Red (эталон)

Добавить мок `vi.mock("@/lib/grpc/preprod-guard", () => ({ assertPreprodAccess: vi.fn() }));`
рядом с существующими двумя `vi.mock`, импорт `assertPreprodAccess` рядом с
импортом `applicationPublicClient`, импорт `NextResponse` из `"next/server"`
(файл сейчас импортирует только `NextRequest` оттуда). Новый `it`,
последним в `describe(...)`:

- Given: `assertPreprodAccess` замокан вернуть (`mockResolvedValueOnce`,
  **не** `mockResolvedValue` — не должен утекать в другие тесты файла)
  `NextResponse.json({...}, { status: 401 })` — When: `GET(req, ctx("n1"))`
  — Then: `res.status === 401`, `applicationPublicClient.listNominationParticipants`
  не вызван.

### Green (эталон)

Импортировать `assertPreprodAccess` из `@/lib/grpc/preprod-guard`. Первая
строка тела `GET`, до `const { id } = await ctx.params;`:
`const gate = await assertPreprodAccess(); if (gate) return gate;`.

### Acceptance (эталон)

Команда: `pnpm --dir web exec vitest run src/app/api/nominations/\[id\]/participants/route.test.ts`

Критерий: три существующих теста без правок + новый четвёртый — зелёные.

## Остальные 10 файлов — применить тот же паттерн

Для каждого: (1) добавить мок `preprod-guard` + импорт `NextResponse` (если
его ещё нет) в `route.test.ts`, как в эталоне; (2) один новый regression-тест
той же формы, что эталонный (замокать `assertPreprodAccess` на 401, вызвать
`GET` с валидными для этого файла аргументами — своим `ctx`/`req`,
скопированными из уже существующего в том же файле счастливого теста —
проверить `res.status === 401` и что именно апстрим-клиент **этого** файла
не вызван); (3) добавить тот же вызов-гейт первой строкой `GET`, как в
эталонном Green. Файлы, где это отличается от эталона по форме:

- `app/api/tournament/live/route.ts` и `app/api/nominations/[id]/live/route.ts`
  — SSE, `GET` возвращает `Response`, не `NextResponse` (это нормально:
  `NextResponse` — подкласс `Response`). Дополнительно к `401` и
  «апстрим не вызван» — проверить, что `res.headers.get("Content-Type")`
  **не** `"text/event-stream"` (поток не открылся).
- `app/api/tournament/route.ts` уже гейтуется отдельной задачей T4 — не
  трогать здесь.
- `app/api/tournament/live-snapshot/route.ts` — `GET` без параметров,
  сначала резолвит активный турнир (`tournamentClient.getActiveTournament`),
  потом зовёт `stagePublicClient.getTournamentLive`; в regression-тесте
  проверить, что **оба** апстрим-вызова отсутствуют.
- `app/api/nominations/route.ts` — в файле есть ещё `POST` (создание
  номинации, только admin, уже требует токен) — **не трогать `POST` и его
  тесты вообще**, гейт только у `GET`.
- `app/api/nominations/[id]/route.ts` — в файле есть ещё `PUT`/`DELETE`
  (только admin, уже требуют токен) — **не трогать их и их тесты**, гейт
  только у `GET`.
- `app/api/nominations/[id]/roster/route.ts`,
  `app/api/nominations/[id]/public-pools/route.ts`,
  `app/api/nominations/[id]/live-snapshot/route.ts`,
  `app/api/nominations/[id]/results/route.ts` — форма один в один с
  эталоном (один `GET`, один публичный апстрим-клиент, флоский `describe`
  без вложенных `describe("GET", ...)`).
- `app/api/nominations/[id]/results/export/route.ts` — тестовый файл
  называется `route.e2e.test.ts` (не `route.test.ts`) и мокает
  `@/lib/grpc/client` через `createRouterTransport` (реальная
  proto-сериализация, ADR 0010), а не вручную `vi.fn()`. Гейт всё равно
  мокается напрямую тем же приёмом
  (`vi.mock("@/lib/grpc/preprod-guard", () => ({ assertPreprodAccess: vi.fn() }));`)
  — это независимый модуль, не связан с мокoм `@/lib/grpc/client`. Новый
  тест — тем же способом (`assertPreprodAccess` → 401), но проверить, что
  апстрим не вызван, здесь просложнее (клиент — реальный router transport,
  не `vi.fn()`) — вместо `expect(...).not.toHaveBeenCalled()` достаточно
  проверить `res.status === 401` и что тело ответа не CSV
  (`res.headers.get("Content-Type") !== "text/csv; charset=utf-8"`).

## Acceptance (всей задачи)

Команда:
`pnpm --dir web exec vitest run src/app/api/tournament/live src/app/api/tournament/live-snapshot src/app/api/nominations/route.test.ts "src/app/api/nominations/[id]/route.test.ts" "src/app/api/nominations/[id]/roster" "src/app/api/nominations/[id]/public-pools" "src/app/api/nominations/[id]/live" "src/app/api/nominations/[id]/live-snapshot" "src/app/api/nominations/[id]/results"`

Критерий: во всех 11 файлах — старые тесты без единой правки ожиданий, плюс
по одному новому regression-тесту на файл, все зелёные.

## Boundaries

- Только эти 11 файлов `route.ts` + соответствующие им `route.test.ts`
  (`route.e2e.test.ts` для `results/export`). Не создавать других файлов.
- Не трогать: `POST` в `nominations/route.ts`, `PUT`/`DELETE` в
  `nominations/[id]/route.ts` и их тесты; `app/api/tournament/route.ts`
  (задача T4); `web/src/lib/grpc/preprod-guard.ts` (уже существует).
- Не менять существующие ожидания (`expect`) в уже существующих `it` —
  только добавлять новые.
- Если для какого-то из 11 файлов реальное текущее содержимое не совпадает
  с описанием в этой карточке (сигнатура другая, апстрим-клиент называется
  иначе) — остановиться на этом файле, сообщить расхождение, не
  импровизировать; остальные файлы это не блокирует.
