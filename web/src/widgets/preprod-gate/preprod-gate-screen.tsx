"use client";

import { useEffect } from "react";
import { useAuthDialogStore } from "@/features/auth/model/auth-dialog-store";
import { Button } from "@/shared/ui/button";
import { StatusPage } from "@/shared/ui/status-page";

export function PreprodGateScreen() {
  useEffect(() => {
    useAuthDialogStore.getState().open("login");
  }, []);

  return (
    <StatusPage
      code="ПРЕПРОД"
      title="Сайт закрыт до запуска"
      description="Доступ есть только у вошедших пользователей. Войдите, чтобы продолжить."
      actions={
        <Button onClick={() => useAuthDialogStore.getState().open("login")}>Войти</Button>
      }
    />
  );
}
