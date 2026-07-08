"use client";

import { Button } from "@/shared/ui/button";
import { Row } from "@/shared/ui/stack";
import { useAuthDialogStore } from "@/features/auth/model/auth-dialog-store";

/** NavbarAuthButton — кнопки входа/регистрации для гостей. Открывают AuthDialog. */
export function NavbarAuthButton() {
  const open = useAuthDialogStore((s) => s.open);

  return (
    <Row align="center" gap={2}>
      <Button variant="ghost" size="sm" onClick={() => open("login")}>
        Войти
      </Button>
      <Button size="sm" onClick={() => open("register")}>
        Регистрация
      </Button>
    </Row>
  );
}
