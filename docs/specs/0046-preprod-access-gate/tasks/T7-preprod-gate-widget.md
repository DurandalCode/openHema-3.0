---
task: T7
feature: docs/specs/0046-preprod-access-gate/
status: pending
requires: local
depends_on: []
---

# T7 — `widgets/preprod-gate/preprod-gate-screen.tsx`: экран-приглашение для главной

> Артефакт ADR 0021. Самодостаточная карточка: исполнитель работает
> **только** с этим файлом и файлами, которые он явно называет — не
> заглядывает в `AGENTS.md`, `spec.md`, `plan.md` или другие задачи.

## Цель

Клиентский компонент `PreprodGateScreen`: показывает гостю, что сайт закрыт
до запуска, и на монтировании открывает существующий `AuthDialog` в режиме
входа. Рендерится вместо обычного контента главной, когда включён режим
препродакшена и посетитель анонимен (подключение к странице — отдельная
задача, эта карточка делает только сам компонент).

## Контекст

`useAuthDialogStore` — существующий глобальный zustand-стор (без
провайдера), `web/src/features/auth/model/auth-dialog-store.ts`:

```ts
type AuthDialogState = {
  isOpen: boolean;
  mode: AuthMode; // "login" | "register" | "reset"
  returnTo?: string;
  open: (mode: AuthMode, returnTo?: string) => void;
  close: () => void;
  setMode: (mode: AuthMode) => void;
};

export const useAuthDialogStore = create<AuthDialogState>((set) => ({
  isOpen: false,
  mode: "login",
  returnTo: undefined,
  open: (mode, returnTo) => set({ isOpen: true, mode, returnTo }),
  // ...
}));
```

Существующий клиентский компонент, который открывает этот же стор точно
такой же кнопкой «Войти» — ориентир на стиль и на то, как в проекте
получают `open` из стора в клиентском компоненте
(`web/src/features/auth/ui/auth-cta.tsx`):

```tsx
"use client";

import { Button } from "@/shared/ui/button";
import { Col } from "@/shared/ui/stack";
import { useAuthDialogStore } from "../model/auth-dialog-store";

export function AuthCta() {
  const open = useAuthDialogStore((s) => s.open);

  return (
    <Col gap={3} className="sm:flex-row">
      <Button size="lg" onClick={() => open("register")}>
        Создать аккаунт
      </Button>
      <Button size="lg" variant="ghost" onClick={() => open("login")}>
        Войти
      </Button>
    </Col>
  );
}
```

Готовый презентационный примитив для страниц-состояний (404/403/500),
уместный и здесь как раскладка «код/заголовок/описание/действия» —
`web/src/shared/ui/status-page.tsx`:

```tsx
export interface StatusPageProps {
  code: string;
  title: React.ReactNode;
  description: React.ReactNode;
  actions?: React.ReactNode;
  footnote?: React.ReactNode;
  className?: string;
}

function StatusPage({ code, title, description, actions, footnote, className }: StatusPageProps) {
  // рендерит code/title/description/actions в вертикальной раскладке по центру
}

export { StatusPage };
```

Существующий jsdom-тест client-компонента, читающего этот же стор — ориентир
на стиль (`@vitest-environment jsdom`, `@testing-library/react`,
`render`/`screen`), `web/src/features/auth/ui/auth-dialog.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthDialog } from "./auth-dialog";
import { useAuthDialogStore } from "../model/auth-dialog-store";

function renderDialog() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthDialog />
    </QueryClientProvider>,
  );
}
```

`PreprodGateScreen` не использует TanStack Query — `QueryClientProvider`
здесь не нужен, это деталь именно `AuthDialog`. Просто
`render(<PreprodGateScreen />)` достаточно.

Виджеты проекта лежат плоско, без `ui/`-подпапки, например
`web/src/widgets/session-expired/session-expired-dialog.tsx` (директория
`widgets/session-expired/` содержит `session-expired-dialog.tsx` и
`session-expired-dialog.test.tsx` прямо в корне, без вложенности).

## Red — тест первым

Путь: `web/src/widgets/preprod-gate/preprod-gate-screen.test.tsx`
(`@vitest-environment jsdom`)

Замокать `useAuthDialogStore` (по образцу — простой `vi.fn()` на `open`,
подставленный через `vi.mock` модуля стора) или использовать реальный стор
и проверять его состояние после рендера — на усмотрение исполнителя,
главное — сценарий:

- Given: компонент ещё не смонтирован — When: `render(<PreprodGateScreen />)`
  — Then: `open` стора вызван ровно один раз с аргументом `"login"` (без
  `returnTo` — второй аргумент не важен/не передан); на экране виден текст
  приглашения войти (любая формулировка, содержащая, например, слово
  «вход» или «войдите» — не жёстко фиксировать точную строку, чтобы текст
  можно было улучшать без переписывания теста).

## Green — минимальная реализация

Путь: `web/src/widgets/preprod-gate/preprod-gate-screen.tsx`

`"use client"`-компонент `PreprodGateScreen` без пропсов: `useEffect` на
монтировании безусловно зовёт `useAuthDialogStore.getState().open("login")`
(через `getState()`, не через хук-подписку — вызывается один раз при
монтировании, компоненту не нужно ре-рендериться на изменения стора).
Рендер — `StatusPage` (или эквивалентная простая вёрстка) с коротким
текстом о том, что сайт закрыт до запуска и нужно войти; `actions` —
необязательная кнопка-дублёр «Войти» тем же `onClick={() => open("login")}`,
что в `AuthCta`, на случай если пользователь закрыл диалог руками.

## Acceptance

Команда: `pnpm --dir web exec vitest run src/widgets/preprod-gate/preprod-gate-screen.test.tsx`

Критерий: тест из Red зелёный.

## Boundaries

- Не создавать файлы сверх `web/src/widgets/preprod-gate/preprod-gate-screen.tsx`
  и `.test.tsx` рядом.
- Не трогать: `web/src/features/auth/model/auth-dialog-store.ts`,
  `web/src/features/auth/ui/auth-dialog.tsx`, `web/src/shared/ui/status-page.tsx`,
  `app/page.tsx` (подключение виджета — отдельная задача).
- Не заводить `ui/`-подпапку внутри `widgets/preprod-gate/` — файл лежит
  прямо в `widgets/preprod-gate/`, как у остальных виджетов проекта.
