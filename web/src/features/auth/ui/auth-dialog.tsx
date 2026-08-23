"use client";

import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { useAuthDialogStore } from "../model/auth-dialog-store";
import { AuthForm } from "./auth-form";
import { ResetRequestForm } from "./reset-request-form";

const TITLE: Record<"login" | "register" | "reset", string> = {
  login: "Вход",
  register: "Регистрация",
  reset: "Восстановление пароля",
};

const DESCRIPTION: Record<"login" | "register" | "reset", string> = {
  login: "Войдите в аккаунт для доступа к кабинету.",
  register: "Создайте аккаунт для участия в турнирах.",
  reset: "Укажите email — пришлём ссылку для установки нового пароля.",
};

/**
 * AuthDialog — модалка входа/регистрации/сброса пароля (spec 0038, FR-2).
 * Три режима: «Вход»/«Регистрация» — равноправные табы; «Сброс пароля» —
 * не таб, отдельный экран без Tabs, доступный только ссылкой «Забыли
 * пароль?» и возвращающийся ссылкой «Вернуться ко входу» (в
 * ResetRequestForm). На узком экране (`sm:` вниз) — нижний лист (FR-7).
 */
export function AuthDialog() {
  const router = useRouter();
  const isOpen = useAuthDialogStore((s) => s.isOpen);
  const mode = useAuthDialogStore((s) => s.mode);
  const returnTo = useAuthDialogStore((s) => s.returnTo);
  const setOpen = useAuthDialogStore((s) => s.open);
  const close = useAuthDialogStore((s) => s.close);
  const setMode = useAuthDialogStore((s) => s.setMode);

  // FR-16: обычный вход (без returnTo) оставляет пользователя там, где он
  // был (`router.refresh()` перерисовывает server components с новой
  // сессией). `returnTo` заводит `widgets/session-expired` (спека 0038) —
  // туда возвращаемся явно, раз пользователь мог успеть уйти со страницы,
  // где его выбило (кнопка «На главную»), прежде чем открыть вход заново.
  function onSuccess() {
    close();
    if (returnTo) router.push(returnTo);
    router.refresh();
  }

  return (
    <Dialog open={isOpen} onOpenChange={(v) => (v ? setOpen(mode) : close())}>
      <DialogContent
        className={
          // Мобильный нижний лист: контент прижат к низу, растянут по
          // ширине, закруглён сверху; на `sm:` и выше — обычная модалка,
          // отцентрированная по обеим осям (FR-7, NFR-6).
          "bottom-0 top-auto left-0 right-0 max-w-full translate-x-0 translate-y-0 " +
          "rounded-b-none rounded-t-2xl border-b-0 " +
          "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom " +
          "sm:top-[50%] sm:left-[50%] sm:right-auto sm:bottom-auto sm:max-w-md " +
          "sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:border-b " +
          "sm:data-[state=closed]:slide-out-to-bottom-0 sm:data-[state=closed]:zoom-out-95 " +
          "sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=open]:zoom-in-95"
        }
      >
        <DialogHeader>
          <DialogTitle>{TITLE[mode]}</DialogTitle>
          <DialogDescription>{DESCRIPTION[mode]}</DialogDescription>
        </DialogHeader>
        {mode === "reset" ? (
          <ResetRequestForm setMode={setMode} />
        ) : (
          <Tabs
            value={mode}
            onValueChange={(v) => setMode(v as "login" | "register")}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Вход</TabsTrigger>
              <TabsTrigger value="register">Регистрация</TabsTrigger>
            </TabsList>
            <TabsContent value="login" className="pt-4">
              <AuthForm mode="login" onSuccess={onSuccess} />
              <Button
                type="button"
                variant="link"
                className="mt-2 h-auto justify-start p-0 text-xs"
                onClick={() => setMode("reset")}
              >
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
