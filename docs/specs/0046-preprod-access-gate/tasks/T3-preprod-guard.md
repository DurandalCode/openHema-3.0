---
task: T3
feature: docs/specs/0046-preprod-access-gate/
status: done
requires: local
depends_on: [T2]
---

# T3 — `lib/grpc/preprod-guard.ts`: гейт для публичных BFF-ручек

> Артефакт ADR 0021. Самодостаточная карточка: исполнитель работает
> **только** с этим файлом и файлами, которые он явно называет — не
> заглядывает в `AGENTS.md`, `spec.md`, `plan.md` или другие задачи.

## Цель

Функция `assertPreprodAccess(): Promise<NextResponse | null>`, которую
публичные BFF-ручки будут звать первой строкой: включён режим препродакшена
и нет сессии → готовый `401`-ответ; иначе → `null` (ручка работает как
обычно). Эта задача создаёт только сам guard — подключение его в конкретные
ручки делают отдельные задачи (T4, T5).

**Предполагается, что `web/src/shared/config/preprod.ts` с функцией
`isPreprodModeEnabled(): boolean` уже существует** (задача T2) — не
создавать её заново, только импортировать.

## Контекст

`getCurrentUser()` — уже существующая единственная точка получения текущего
пользователя на сервере, `web/src/entities/user/model/get-current-user.ts`:

```ts
import "server-only";
// ...
/**
 * getCurrentUser — единственная точка получения текущего пользователя
 * на сервере. Читает access-токен из httpOnly-cookie, зовёт gRPC `me`.
 *
 * Возвращает `null`, если токена нет или он невалиден — НЕ редиректит.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  // ...
}
```

Существующий в проекте маппинг ошибки в `NextResponse`, для стиля
(`web/src/lib/grpc/errors.ts`):

```ts
export function errorResponse(err: unknown): NextResponse {
  // ...
  return NextResponse.json({ error: err.rawMessage }, { status });
}
```

Существующий в проекте `401`-ответ той же формы, для стиля
(`web/src/app/api/auth/profile/route.ts`):

```ts
if (!accessToken) {
  return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
}
```

Существующий в проекте пример мокирования `getCurrentUser` в тесте — для
стиля мокирования этого модуля (`web/src/app/(admin)/layout.test.tsx`):

```ts
const getCurrentUserMock = vi.fn();
vi.mock("@/entities/user/model/get-current-user", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));
```

## Red — тест первым

Путь: `web/src/lib/grpc/preprod-guard.test.ts`

Смокать `@/entities/user/model/get-current-user` (по образцу из Контекста)
и `@/shared/config/preprod` (простой `vi.fn()` на `isPreprodModeEnabled`).
Три сценария для `assertPreprodAccess()`:

- Given: `isPreprodModeEnabled()` → `false` — When: вызов — Then: `null`,
  и `getCurrentUser` **не вызывается вовсе** (это важно проверить отдельным
  `expect` — цена лишнего RPC на негейтованный трафик, см. `plan.md`).
- Given: `isPreprodModeEnabled()` → `true`, `getCurrentUser()` → `null` —
  When: вызов — Then: результат не `null`, и его `.status === 401`.
- Given: `isPreprodModeEnabled()` → `true`, `getCurrentUser()` →
  произвольный ненулевой объект пользователя — When: вызов — Then: `null`.

## Green — минимальная реализация

Путь: `web/src/lib/grpc/preprod-guard.ts`

Одна функция `assertPreprodAccess(): Promise<NextResponse | null>`:
если `!isPreprodModeEnabled()` — сразу `null` (до любого обращения к
`getCurrentUser`, это доменное требование теста выше, не деталь
оптимизации); иначе — `await getCurrentUser()`, и если `null` — вернуть
`401`-`NextResponse.json` в той же форме, что образец из Контекста
(поле `error`, текст на усмотрение — короткая машинно-независимая причина);
если пользователь есть — `null`.

## Acceptance

Команда: `pnpm --dir web exec vitest run src/lib/grpc/preprod-guard.test.ts`

Критерий: все тесты из Red зелёные.

## Boundaries

- Не создавать файлы сверх `web/src/lib/grpc/preprod-guard.ts` и
  `web/src/lib/grpc/preprod-guard.test.ts`.
- Не трогать: `web/src/shared/config/preprod.ts` (уже существует, T2),
  `web/src/entities/user/model/get-current-user.ts`, любые `app/api/**`
  роуты.
- Не добавлять параметры/варианты — сигнатура ровно
  `assertPreprodAccess(): Promise<NextResponse | null>`.
