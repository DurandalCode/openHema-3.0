"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/shared/ui/alert";
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
import { useRequestEmailChange } from "../api/use-request-email-change";

/**
 * ChangeEmailDialog — запрос смены адреса учётки (спека 0042, FR-6):
 * новый адрес + текущий пароль (тот же приём, что `ChangePasswordDialog`).
 * Успех не меняет адрес в `CurrentUser` сразу — только `pendingEmail`
 * (адрес вступает в силу после перехода по ссылке из письма), поэтому
 * `router.refresh()` подтягивает именно `pendingEmail`, а не `email`.
 */
export function ChangeEmailDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const requestChange = useRequestEmailChange();

  function reset() {
    setNewEmail("");
    setCurrentPassword("");
    requestChange.reset();
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) reset();
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    requestChange.mutate(
      { newEmail, currentPassword },
      {
        onSuccess: () => {
          toastSuccess("Письмо с подтверждением отправлено на новый адрес");
          onOpenChange(false);
          reset();
          router.refresh();
        },
      },
    );
  }

  const serverError = requestChange.error?.message ?? null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Сменить адрес почты</DialogTitle>
          <DialogDescription>
            Подтвердите текущий пароль. На новый адрес придёт письмо со
            ссылкой подтверждения — прежний адрес остаётся в учётке до
            перехода по ней.
          </DialogDescription>
        </DialogHeader>
        <Col as="form" onSubmit={onSubmit} noValidate gap={4}>
          <Col gap={2}>
            <Label htmlFor="change-email-new">Новый адрес</Label>
            <Input
              id="change-email-new"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </Col>

          <Col gap={2}>
            <Label htmlFor="change-email-password">Текущий пароль</Label>
            <Input
              id="change-email-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Col>

          {serverError && (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="submit" loading={requestChange.isPending}>
              Отправить письмо
            </Button>
          </DialogFooter>
        </Col>
      </DialogContent>
    </Dialog>
  );
}
