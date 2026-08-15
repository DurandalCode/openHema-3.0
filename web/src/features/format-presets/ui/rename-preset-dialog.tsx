"use client";

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
import type { FormatPreset } from "@/entities/stage/lib/types";
import { useRenamePreset } from "../api/use-rename-preset";

/**
 * RenamePresetDialog — переименование пресета модалкой (спека 0029, FR-21):
 * пустое имя — инлайн-ошибка до отправки запроса; занятое имя — сообщение
 * сервера (уже переведено в русский текст `presetErrorMessage`, B3) внутри
 * модалки, модалка не закрывается; успех — тост, модалка закрывается. Образец
 * — `features/arena-management/ui/edit-arena-dialog.tsx` (0027).
 */
export function RenamePresetDialog({
  preset,
  open,
  onOpenChange,
}: {
  preset: FormatPreset;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState(preset.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const rename = useRenamePreset();

  function reset() {
    setName(preset.name);
    setNameError(null);
    rename.reset();
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (next) reset();
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setNameError("Введите имя пресета");
      return;
    }
    setNameError(null);

    rename.mutate(
      { presetId: preset.id, name: name.trim() },
      {
        onSuccess: () => {
          toastSuccess("Пресет переименован");
          onOpenChange(false);
        },
      },
    );
  }

  const serverError = rename.error?.message ?? null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Переименовать пресет</DialogTitle>
          <DialogDescription>Новое имя должно быть уникальным среди пресетов.</DialogDescription>
        </DialogHeader>
        <Col as="form" onSubmit={onSubmit} noValidate gap={4}>
          <Col gap={2}>
            <Label htmlFor="rename-preset-name">Имя пресета</Label>
            <Input
              id="rename-preset-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={nameError ? true : undefined}
            />
            {nameError && <p className="text-xs text-destructive">{nameError}</p>}
          </Col>

          {serverError && (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="submit" loading={rename.isPending}>
              Сохранить
            </Button>
          </DialogFooter>
        </Col>
      </DialogContent>
    </Dialog>
  );
}
