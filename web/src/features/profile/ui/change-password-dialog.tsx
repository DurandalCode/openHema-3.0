"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Col } from "@/shared/ui/stack";
import { toastSuccess } from "@/shared/lib/toast";
import { passwordHint } from "@/entities/user/lib/password";
import { PasswordHint } from "@/entities/user/ui/password-hint";
import { useChangePassword } from "../api/use-change-password";

const OTHER_DEVICES_WARNING =
  "Пароль изменён. На других устройствах потребуется войти заново.";

/**
 * ChangePasswordDialog — смена пароля изнутри кабинета (спека 0038, FR-24/
 * FR-25, AC-13/AC-14). Локальная проверка (длина нового пароля —
 * `passwordHint`, как в регистрации; совпадение подтверждения) до отправки;
 * неверный текущий пароль — отказ сервера, показан у самого поля
 * (`currentPasswordError`), а не общим алертом — пользователь должен понять,
 * какое именно поле поправить.
 */
export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const change = useChangePassword();

  function reset() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setLocalError(null);
    change.reset();
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) reset();
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();

    const hint = passwordHint(newPassword);
    if (!hint.ok) {
      setLocalError(hint.text);
      return;
    }
    if (newPassword !== confirmPassword) {
      setLocalError("Пароли не совпадают");
      return;
    }
    setLocalError(null);

    change.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          toastSuccess(OTHER_DEVICES_WARNING);
          onOpenChange(false);
          reset();
        },
      },
    );
  }

  const serverError = change.error?.message ?? null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Смена пароля</DialogTitle>
          <DialogDescription>
            Подтвердите текущий пароль, чтобы задать новый.
          </DialogDescription>
        </DialogHeader>
        <Col as="form" onSubmit={onSubmit} noValidate gap={4}>
          <Col gap={2}>
            <Label htmlFor="change-password-current">Текущий пароль</Label>
            <Input
              id="change-password-current"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              aria-invalid={serverError ? true : undefined}
            />
            {serverError && <p className="text-xs text-destructive">{serverError}</p>}
          </Col>

          <Col gap={2}>
            <Label htmlFor="change-password-new">Новый пароль</Label>
            <Input
              id="change-password-new"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
            {newPassword.length > 0 && <PasswordHint value={newPassword} />}
          </Col>

          <Col gap={2}>
            <Label htmlFor="change-password-confirm">Повторите новый пароль</Label>
            <Input
              id="change-password-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              aria-invalid={localError ? true : undefined}
            />
            {localError && <p className="text-xs text-destructive">{localError}</p>}
          </Col>

          <DialogFooter>
            <Button type="submit" loading={change.isPending}>
              Сменить пароль
            </Button>
          </DialogFooter>
        </Col>
      </DialogContent>
    </Dialog>
  );
}
