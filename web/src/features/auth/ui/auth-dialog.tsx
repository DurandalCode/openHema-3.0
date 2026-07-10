"use client";

import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { useAuthDialogStore } from "../model/auth-dialog-store";
import { AuthForm } from "./auth-form";

/** AuthDialog — модалка входа/регистрации с табами. Читает state из zustand. */
export function AuthDialog() {
  const router = useRouter();
  const isOpen = useAuthDialogStore((s) => s.isOpen);
  const mode = useAuthDialogStore((s) => s.mode);
  const setOpen = useAuthDialogStore((s) => s.open);
  const close = useAuthDialogStore((s) => s.close);
  const setMode = useAuthDialogStore((s) => s.setMode);

  function onSuccess() {
    close();
    router.refresh();
  }

  return (
    <Dialog open={isOpen} onOpenChange={(v) => (v ? setOpen(mode) : close())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "login" ? "Вход" : "Регистрация"}
          </DialogTitle>
          <DialogDescription>
            {mode === "login"
              ? "Войдите в аккаунт для доступа к кабинету."
              : "Создайте аккаунт для участия в турнирах."}
          </DialogDescription>
        </DialogHeader>
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
          </TabsContent>
          <TabsContent value="register" className="pt-4">
            <AuthForm mode="register" onSuccess={onSuccess} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
