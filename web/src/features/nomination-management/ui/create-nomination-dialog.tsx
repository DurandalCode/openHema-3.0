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
import type { Nomination } from "@/entities/nomination/lib/types";
import { useCreateNomination } from "../api/use-create-nomination";

/**
 * CreateNominationDialog — создание номинации модалкой из шапки раздела
 * (spec FR-9, приём 0024/0026/0027), а не постоянно раскрытой формой над
 * списком. Поля прежние: название (обязательное), описание, количество
 * бойцов, ссылка на регламент; пустое название — инлайн-ошибка у поля
 * (AC-7). Обратная связь (тост, правило 0023) — забота вызывающей стороны
 * через `onCreated`.
 */
export function CreateNominationDialog({
  tournamentId,
  open,
  onOpenChange,
  onCreated,
}: {
  tournamentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (nomination: Nomination) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [fighterCapacity, setFighterCapacity] = useState("");
  const [rulesUrl, setRulesUrl] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);

  const create = useCreateNomination(tournamentId);

  function reset() {
    setTitle("");
    setDescription("");
    setFighterCapacity("");
    setRulesUrl("");
    setTitleError(null);
    create.reset();
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (next) reset();
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setTitleError("Введите название");
      return;
    }
    setTitleError(null);

    create.mutate(
      {
        title,
        description,
        fighterCapacity: fighterCapacity.trim() === "" ? null : Number(fighterCapacity),
        metadata: { rulesUrl },
      },
      {
        onSuccess: (nomination) => {
          onOpenChange(false);
          onCreated?.(nomination);
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
          <DialogTitle>Номинация</DialogTitle>
          <DialogDescription>
            Название, описание, плановая вместимость и ссылка на регламент.
          </DialogDescription>
        </DialogHeader>
        <Col as="form" onSubmit={onSubmit} noValidate gap={4}>
          <Col gap={2}>
            <Label htmlFor="create-nomination-title">Название</Label>
            <Input
              id="create-nomination-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-invalid={titleError ? true : undefined}
            />
            {titleError && <p className="text-xs text-destructive">{titleError}</p>}
          </Col>

          <Col gap={2}>
            <Label htmlFor="create-nomination-description">Описание</Label>
            <Textarea
              id="create-nomination-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </Col>

          <div className="grid gap-4 sm:grid-cols-2">
            <Col gap={2}>
              <Label htmlFor="create-nomination-capacity">Кол-во бойцов</Label>
              <Input
                id="create-nomination-capacity"
                type="number"
                min={0}
                placeholder="Не задано"
                value={fighterCapacity}
                onChange={(e) => setFighterCapacity(e.target.value)}
              />
            </Col>
            <Col gap={2}>
              <Label htmlFor="create-nomination-rules">Ссылка на регламент</Label>
              <Input
                id="create-nomination-rules"
                type="url"
                placeholder="https://example.com/rules"
                value={rulesUrl}
                onChange={(e) => setRulesUrl(e.target.value)}
              />
            </Col>
          </div>

          {serverError && (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="submit" loading={create.isPending}>
              Добавить номинацию
            </Button>
          </DialogFooter>
        </Col>
      </DialogContent>
    </Dialog>
  );
}
