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
import type { CurrentUser } from "@/entities/user/lib/types";
import { useUpdateProfile } from "../api/use-update-profile";

/**
 * EditProfileDialog — правка имени/клуба из кабинета (спека 0038, FR-23,
 * AC-11..AC-13). Тот же приём, что `EditArenaDialog`: локальный
 * `nameError` для клиентской проверки до отправки, `mutation.error.message`
 * — для отказа с сервера (FR-14 — вторая линия защиты). `router.refresh()`
 * после успеха — навбар (server component) перечитывает `getCurrentUser()`
 * и подхватывает новое имя (AC-11).
 */
export function EditProfileDialog({
  user,
  open,
  onOpenChange,
}: {
  user: CurrentUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(user.displayName);
  const [club, setClub] = useState(user.club);
  const [nameError, setNameError] = useState<string | null>(null);
  const update = useUpdateProfile();

  function reset() {
    setDisplayName(user.displayName);
    setClub(user.club);
    setNameError(null);
    update.reset();
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (next) reset();
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) {
      setNameError("Имя не может быть пустым");
      return;
    }
    setNameError(null);

    update.mutate(
      { displayName, club },
      {
        onSuccess: () => {
          toastSuccess("Профиль обновлён");
          onOpenChange(false);
          router.refresh();
        },
      },
    );
  }

  const serverError = update.error?.message ?? null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Изменить данные</DialogTitle>
          <DialogDescription>Имя и клуб видны там, где показывается ваш профиль.</DialogDescription>
        </DialogHeader>
        <Col as="form" onSubmit={onSubmit} noValidate gap={4}>
          <Col gap={2}>
            <Label htmlFor="edit-profile-name">Имя</Label>
            <Input
              id="edit-profile-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              aria-invalid={nameError ? true : undefined}
            />
            {nameError && <p className="text-xs text-destructive">{nameError}</p>}
          </Col>

          <Col gap={2}>
            <Label htmlFor="edit-profile-club">Клуб — опционально</Label>
            <Input
              id="edit-profile-club"
              value={club}
              onChange={(e) => setClub(e.target.value)}
            />
          </Col>

          {serverError && (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="submit" loading={update.isPending}>
              Сохранить
            </Button>
          </DialogFooter>
        </Col>
      </DialogContent>
    </Dialog>
  );
}
