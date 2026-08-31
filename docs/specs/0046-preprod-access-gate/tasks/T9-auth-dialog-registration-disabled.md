---
task: T9
feature: docs/specs/0046-preprod-access-gate/
status: pending
requires: local
depends_on: []
---

# T9 — `AuthDialog`: проп `registrationDisabled` заменяет форму регистрации сообщением

> Артефакт ADR 0021. Самодостаточная карточка: исполнитель работает
> **только** с этим файлом и файлами, которые он явно называет — не
> заглядывает в `AGENTS.md`, `spec.md`, `plan.md` или другие задачи.

## Цель

`AuthDialog` получает новый опциональный проп `registrationDisabled`.
Когда он `true`, таб «Регистрация» показывает сообщение о временной паузе
регистрации вместо формы. Кто вычисляет и передаёт этот проп — отдельная
задача (T10); здесь только сам компонент.

## Контекст

`web/src/features/auth/ui/auth-dialog.tsx` (текущее содержимое целиком):

```tsx
"use client";

import { useRouter } from "next/navigation";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { useAuthDialogStore } from "../model/auth-dialog-store";
import { AuthForm } from "./auth-form";
import { ResetRequestForm } from "./reset-request-form";

const TITLE: Record<"login" | "register" | "reset", string> = {
  login: "Вход", register: "Регистрация", reset: "Восстановление пароля",
};
const DESCRIPTION: Record<"login" | "register" | "reset", string> = {
  login: "Войдите в аккаунт для доступа к кабинету.",
  register: "Создайте аккаунт для участия в турнирах.",
  reset: "Укажите email — пришлём ссылку для установки нового пароля.",
};

export function AuthDialog() {
  const router = useRouter();
  const isOpen = useAuthDialogStore((s) => s.isOpen);
  const mode = useAuthDialogStore((s) => s.mode);
  const returnTo = useAuthDialogStore((s) => s.returnTo);
  const setOpen = useAuthDialogStore((s) => s.open);
  const close = useAuthDialogStore((s) => s.close);
  const setMode = useAuthDialogStore((s) => s.setMode);

  function onSuccess() {
    close();
    if (returnTo) router.push(returnTo);
    router.refresh();
  }

  return (
    <Dialog open={isOpen} onOpenChange={(v) => (v ? setOpen(mode) : close())}>
      <DialogContent className={/* ... классы адаптива, не трогать */}>
        <DialogHeader>
          <DialogTitle>{TITLE[mode]}</DialogTitle>
          <DialogDescription>{DESCRIPTION[mode]}</DialogDescription>
        </DialogHeader>
        {mode === "reset" ? (
          <ResetRequestForm setMode={setMode} />
        ) : (
          <Tabs value={mode} onValueChange={(v) => setMode(v as "login" | "register")} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Вход</TabsTrigger>
              <TabsTrigger value="register">Регистрация</TabsTrigger>
            </TabsList>
            <TabsContent value="login" className="pt-4">
              <AuthForm mode="login" onSuccess={onSuccess} />
              <Button type="button" variant="link" className="mt-2 h-auto justify-start p-0 text-xs" onClick={() => setMode("reset")}>
                Забыли пароль?
              </Button>
            </TabsContent>
            <TabsContent value="register" className="pt-4">
              <AuthForm mode="register" onSuccess={onSuccess} />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

Существующий тест того же компонента, для стиля и для jsdom/моков,
`web/src/features/auth/ui/auth-dialog.test.tsx` — верхняя часть:

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

beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
  // ... остальные полифиллы Radix, не трогать
});
```

`renderDialog()` — хелпер без пропсов; нужно расширить, чтобы прокидывал
проп в `<AuthDialog />` (или завести второй хелпер/передавать проп
аргументом — на усмотрение исполнителя, лишь бы существующие вызовы
`renderDialog()` без аргумента остались рабочими и покрывали случай
`registrationDisabled` не задан = как сегодня).

Диалог по умолчанию открывается в режиме `"login"`, а не `"register"` (см.
`useAuthDialogStore`, `mode: "login"` — начальное состояние) — чтобы в
тесте увидеть таб «Регистрация», нужно переключиться на него (клик по
`TabsTrigger` с текстом «Регистрация» через `fireEvent.click`, как делают
другие тесты этого файла с переключением режимов, если такие есть — иначе
открыть стор сразу в `mode: "register"` через `useAuthDialogStore.getState().open("register")`
перед рендером).

## Red — тест первым

Путь: `web/src/features/auth/ui/auth-dialog.test.tsx` (расширить)

Новый сценарий (плюс к существующим, которые не трогать):

- Given: `useAuthDialogStore` открыт в режиме `"register"`,
  `<AuthDialog registrationDisabled />` — When: рендер — Then: на экране
  **нет** полей формы регистрации (например, поля пароля/email из
  `AuthForm`, которые видны в обычном режиме — как их найти в DOM, смотрите
  по существующим тестам `AuthForm`/`auth-form.test.tsx`), но **есть**
  какой-то текст о том, что регистрация временно недоступна.
- (Опционально, для контраста) Given: `<AuthDialog />` без пропа (или
  `registrationDisabled={false}`), режим `"register"` — When: рендер —
  Then: форма регистрации видна как сегодня — это защита от регрессии
  дефолтного поведения.

## Green — минимальная реализация

Путь: `web/src/features/auth/ui/auth-dialog.tsx`

Добавить необязательный проп `registrationDisabled?: boolean` (дефолт
`false`) в сигнатуру `AuthDialog`. Внутри `TabsContent value="register"` —
если `registrationDisabled`, рендерить короткое сообщение о паузе
регистрации вместо `<AuthForm mode="register" onSuccess={onSuccess} />`;
иначе — как сегодня. Остальное (`login`/`reset`) не трогать.

## Acceptance

Команда: `pnpm --dir web exec vitest run src/features/auth/ui/auth-dialog.test.tsx`

Критерий: все существующие тесты файла — без единой правки ожиданий, плюс
новый сценарий(и) из Red — зелёные.

## Boundaries

- Не создавать файлы сверх правки `auth-dialog.tsx` и `auth-dialog.test.tsx`.
- Не трогать: `AuthForm`, `ResetRequestForm`, `useAuthDialogStore` — проп
  `registrationDisabled` не должен попадать в стор, это чисто пропс-данные
  снаружи (кто их вычисляет и передаёт — задача T10, не эта).
- Не менять поведение табов `login`/`reset` и существующие ожидания в уже
  существующих `it`.
