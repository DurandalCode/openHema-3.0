---
task: T10
feature: docs/specs/0046-preprod-access-gate/
status: pending
requires: local
depends_on: [T2, T9]
---

# T10 — `app/layout.tsx`: передать `registrationDisabled` в `AuthDialog`

> Артефакт ADR 0021. Самодостаточная карточка: исполнитель работает
> **только** с этим файлом и файлами, которые он явно называет — не
> заглядывает в `AGENTS.md`, `spec.md`, `plan.md` или другие задачи.

## Цель

Корневой layout вычисляет `isRegistrationDisabled()` на сервере и передаёт
результат пропом в `<AuthDialog>` (проп `registrationDisabled` уже
существует, задача T9).

**Предполагается, что `web/src/shared/config/preprod.ts`
(`isRegistrationDisabled(): boolean`, задача T2) и проп `registrationDisabled`
у `AuthDialog` (задача T9) уже существуют** — не создавать их заново,
только использовать.

## Контекст

`web/src/app/layout.tsx` (текущее содержимое целиком):

```tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Archivo, JetBrains_Mono } from "next/font/google";
import { siteConfig } from "@/shared/config/site-config";
import { ThemeProvider } from "@/shared/lib/theme-provider";
import { QueryProvider } from "@/shared/lib/query-provider";
import { AuthDialog } from "@/features/auth/ui/auth-dialog";
import { SessionExpiredDialog } from "@/widgets/session-expired/session-expired-dialog";
import { UnsavedGuardDialog } from "@/widgets/unsaved-guard/unsaved-guard-dialog";
import { Navbar } from "@/widgets/navbar/navbar";
import { NavbarVisibilityGate } from "@/widgets/navbar/navbar-visibility-gate";
import { Col } from "@/shared/ui/stack";
import { Toaster } from "@/shared/ui/sonner";
import "./globals.css";

// ... archivo/jetbrainsMono/metadata — не трогать

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning className={/* ... */}>
      <body className="min-h-svh bg-background font-sans text-foreground antialiased">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <QueryProvider>
            <Col className="relative min-h-svh">
              <NavbarVisibilityGate>
                <Navbar />
              </NavbarVisibilityGate>
              <main className="flex-1 pb-16 md:pb-0">{children}</main>
            </Col>
            <AuthDialog />
            <SessionExpiredDialog />
            <UnsavedGuardDialog />
            <Toaster mobileOffset="80px" />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

`RootLayout` — обычная (не `async`) серверная функция; `process.env`
доступен синхронно на сервере, `await` не нужен — `isRegistrationDisabled()`
уже возвращает `boolean` синхронно (T2), можно звать прямо в теле функции.

## Red — тест первым

В проекте сегодня нет unit-теста для `app/layout.tsx`. Эта задача не
заводит его специально — готовность проверяется через уже существующий
тест `AuthDialog` (T9, который проверяет поведение при
`registrationDisabled={true}`/`false`) и вручную (Acceptance).

## Green — минимальная реализация

Путь: `web/src/app/layout.tsx`

Импортировать `isRegistrationDisabled` из `@/shared/config/preprod`. В теле
`RootLayout`, до `return (...)`, вычислить
`const registrationDisabled = isRegistrationDisabled();`. В JSX — заменить
`<AuthDialog />` на `<AuthDialog registrationDisabled={registrationDisabled} />`.
Больше ничего в файле не меняется.

## Acceptance

Команда: `pnpm --dir web exec tsc --noEmit`

Критерий: без ошибок типов; плюс ручная проверка —
`REGISTRATION_DISABLED=true` в окружении Next.js dev-сервера, открыть таб
«Регистрация» в диалоге входа (`/register` или кнопка «Создать аккаунт») —
вместо формы виден текст о паузе; без переменной — форма как раньше.

## Boundaries

- Не создавать файлы сверх правки `web/src/app/layout.tsx`.
- Не трогать: `web/src/features/auth/ui/auth-dialog.tsx` (уже содержит
  проп, T9), `web/src/shared/config/preprod.ts` (уже существует, T2),
  остальные компоненты, смонтированные в layout
  (`SessionExpiredDialog`/`UnsavedGuardDialog`/`Navbar`/`Toaster`).
