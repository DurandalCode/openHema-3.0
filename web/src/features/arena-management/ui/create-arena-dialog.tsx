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
import { Textarea } from "@/shared/ui/textarea";
import { Col } from "@/shared/ui/stack";
import type { Arena } from "@/entities/arena/lib/types";
import { useCreateArena } from "../api/use-create-arena";

/**
 * CreateArenaDialog — создание площадки модалкой из шапки раздела (spec
 * FR-11, приём 0024/0026), а не постоянно раскрытой формой над списком.
 * Поля прежние: название (обязательное) и описание/локация; пустое
 * название — инлайн-ошибка у поля (AC-6). Обратная связь (тост, правило
 * 0023) — забота вызывающей стороны через `onCreated`.
 */
export function CreateArenaDialog({
  tournamentId,
  open,
  onOpenChange,
  onCreated,
}: {
  tournamentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (arena: Arena) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);

  const create = useCreateArena(tournamentId);

  function reset() {
    setName("");
    setDescription("");
    setNameError(null);
    create.reset();
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (next) reset();
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setNameError("Введите название");
      return;
    }
    setNameError(null);

    create.mutate(
      { name, description },
      {
        onSuccess: (arena) => {
          onOpenChange(false);
          onCreated?.(arena);
          reset();
        },
      },
    );
  }

  const serverError = create.error?.message ?? null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Площадка</DialogTitle>
          <DialogDescription>Название и описание/локация ристалища.</DialogDescription>
        </DialogHeader>
        <Col as="form" onSubmit={onSubmit} noValidate gap={4}>
          <Col gap={2}>
            <Label htmlFor="create-arena-name">Название</Label>
            <Input
              id="create-arena-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={nameError ? true : undefined}
            />
            {nameError && <p className="text-xs text-destructive">{nameError}</p>}
          </Col>

          <Col gap={2}>
            <Label htmlFor="create-arena-description">Описание / локация</Label>
            <Textarea
              id="create-arena-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Например: у входа, ковёр 5×5"
            />
          </Col>

          {serverError && (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="submit" loading={create.isPending}>
              Добавить площадку
            </Button>
          </DialogFooter>
        </Col>
      </DialogContent>
    </Dialog>
  );
}
