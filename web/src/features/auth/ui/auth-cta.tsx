"use client";

import { Button } from "@/shared/ui/button";
import { useAuthDialogStore } from "../model/auth-dialog-store";

/**
 * AuthCta — клиентский CTA-блок для гостей (hero/лендинг).
 * Первичная кнопка открывает регистрацию, вторичная — вход.
 */
export function AuthCta() {
  const open = useAuthDialogStore((s) => s.open);

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Button size="lg" onClick={() => open("register")}>
        Создать аккаунт
      </Button>
      <Button size="lg" variant="ghost" onClick={() => open("login")}>
        Войти
      </Button>
    </div>
  );
}
