"use client";

import * as React from "react";

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

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Последствия действия, перечисленные конкретно (FR-7). */
  consequences: React.ReactNode;
  confirmLabel: string;
  /**
   * Точное название объекта, которое нужно ввести, чтобы разблокировать
   * подтверждение (FR-7). Задавать только там, где потерю **нельзя**
   * отменить — если действие покрыто отменой последнего действия, оставить
   * `undefined` (FR-8).
   */
  confirmWord?: string;
  /** Необратимое/разрушительное действие — подтверждающая кнопка красная. */
  destructive?: boolean;
  onConfirm: () => void;
}

/**
 * Диалог подтверждения дизайн-системы поверх `dialog.tsx` (0022) — заменяет
 * системный `window.confirm` (FR-7/FR-8). Focus-trap, ESC и ARIA уже даёт
 * Radix `Dialog` внутри `dialog.tsx`, здесь — только содержимое и режим
 * ввода названия объекта.
 */
function ConfirmDialog({
  open,
  onOpenChange,
  title,
  consequences,
  confirmLabel,
  confirmWord,
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [typedWord, setTypedWord] = React.useState("");

  // Сбрасываем ввод при закрытии, чтобы при повторном открытии диалог не
  // начинал с уже «разблокированной» кнопки.
  React.useEffect(() => {
    if (!open) setTypedWord("");
  }, [open]);

  const locked = confirmWord !== undefined && typedWord !== confirmWord;

  function handleConfirm() {
    onConfirm();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{consequences}</DialogDescription>
        </DialogHeader>

        {confirmWord !== undefined && (
          <Col gap={1}>
            <Label htmlFor="confirm-dialog-word">
              Введите «{confirmWord}» для подтверждения
            </Label>
            <Input
              id="confirm-dialog-word"
              autoComplete="off"
              value={typedWord}
              onChange={(e) => setTypedWord(e.target.value)}
            />
          </Col>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            disabled={locked}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { ConfirmDialog };
