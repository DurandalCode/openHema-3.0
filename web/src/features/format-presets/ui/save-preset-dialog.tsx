"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Col } from "@/shared/ui/stack";
import { useSavePreset } from "../api/use-save-preset";

/**
 * SavePresetDialog — «сохранить схему номинации как пресет» (спека 0020,
 * FR-11/FR-12): имя обязательно и уникально — сервер отвечает 409
 * (`ErrPresetNameTaken`, AC-17), клиент показывает его текст ошибки как есть.
 * Пресет — отпечаток схемы на момент вызова (FR-16): дальнейшие правки
 * номинации на него не влияют.
 */
export function SavePresetDialog({ nominationId }: { nominationId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const save = useSavePreset();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setName("");
      save.reset();
    }
  }

  function onSubmit() {
    save.mutate({ name, nominationId }, { onSuccess: () => setOpen(false) });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <Save /> Сохранить как пресет
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Сохранить схему как пресет</DialogTitle>
          <DialogDescription>
            Пресет — отпечаток текущей схемы (FR-11): дальнейшие правки номинации на него не
            повлияют.
          </DialogDescription>
        </DialogHeader>
        <Col gap={1}>
          <Label htmlFor="save-preset-name">Имя пресета</Label>
          <Input id="save-preset-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Col>
        {save.error && (
          <Alert variant="destructive">
            <AlertDescription>{save.error.message}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button
            type="button"
            disabled={name.trim().length === 0}
            loading={save.isPending}
            onClick={onSubmit}
          >
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
