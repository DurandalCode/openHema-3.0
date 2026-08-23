"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { ChangePasswordDialog } from "@/features/profile/ui/change-password-dialog";

/**
 * SecurityCard — блок «Безопасность» кабинета (спека 0038, FR-24..FR-26).
 * Только смена пароля — список активных сессий вне скоупа (0037/0038,
 * «Вне скоупа»): не рисуем неработающих кнопок.
 */
export function SecurityCard() {
  const [changeOpen, setChangeOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Безопасность</CardTitle>
        <CardDescription>Смена пароля аккаунта.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setChangeOpen(true)}
        >
          Сменить пароль
        </Button>
      </CardContent>
      <ChangePasswordDialog open={changeOpen} onOpenChange={setChangeOpen} />
    </Card>
  );
}
