"use client";

import { useState, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
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
import { Col, Row } from "@/shared/ui/stack";
import type { Nomination } from "@/entities/nomination/lib/types";
import type { Fighter } from "@/entities/fighter/lib/types";
import { useCreateFighter } from "../api/use-fighter-mutations";

/**
 * CreateFighterDialog — ручное заведение бойца модалкой из шапки раздела
 * (spec FR-22, приём 0024 — по образцу `create-admin-dialog.tsx`), а не
 * постоянно раскрытой формой над списком. Форма прежняя (имя, клуб, набор
 * номинаций); пустое имя — инлайн-ошибка у поля (AC-13); обратная связь
 * (тост, правило 0023) — забота вызывающей стороны через `onCreated`, как в
 * `CreateAdminDialog`.
 */
export function CreateFighterDialog({
  tournamentId,
  nominations,
  open,
  onOpenChange,
  onCreated,
}: {
  tournamentId: string;
  nominations: Nomination[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (fighter: Fighter) => void;
}) {
  const [name, setName] = useState("");
  const [club, setClub] = useState("");
  const [selectedNominations, setSelectedNominations] = useState<Set<string>>(new Set());
  const [nameError, setNameError] = useState<string | null>(null);

  const create = useCreateFighter();

  function reset() {
    setName("");
    setClub("");
    setSelectedNominations(new Set());
    setNameError(null);
    create.reset();
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (next) reset();
  }

  function toggleNomination(id: string) {
    setSelectedNominations((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setNameError("Введите имя");
      return;
    }
    setNameError(null);

    create.mutate(
      { tournamentId, name, club, nominationIds: [...selectedNominations] },
      {
        onSuccess: (fighter) => {
          onOpenChange(false);
          onCreated?.(fighter);
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
          <DialogTitle>Боец вручную</DialogTitle>
          <DialogDescription>
            Обычный путь бойца в ростер — регистрация заявки; эта форма — для редких случаев
            (найден на месте, поздняя запись).
          </DialogDescription>
        </DialogHeader>
        <Col as="form" onSubmit={onSubmit} noValidate gap={4}>
          <Col gap={2}>
            <Label htmlFor="create-fighter-name">Имя</Label>
            <Input
              id="create-fighter-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={nameError ? true : undefined}
            />
            {nameError && <p className="text-xs text-destructive">{nameError}</p>}
          </Col>

          <Col gap={2}>
            <Label htmlFor="create-fighter-club">Клуб</Label>
            <Input id="create-fighter-club" value={club} onChange={(e) => setClub(e.target.value)} />
          </Col>

          {nominations.length > 0 && (
            <Col gap={2}>
              <Label>Номинации</Label>
              <Row gap={4} wrap>
                {nominations.map((n) => (
                  <Row key={n.id} align="center" gap={2}>
                    <Checkbox
                      id={`create-fighter-nom-${n.id}`}
                      checked={selectedNominations.has(n.id)}
                      onCheckedChange={() => toggleNomination(n.id)}
                    />
                    <Label htmlFor={`create-fighter-nom-${n.id}`} className="font-normal">
                      {n.title}
                    </Label>
                  </Row>
                ))}
              </Row>
            </Col>
          )}

          {serverError && (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="submit" loading={create.isPending}>
              Завести бойца
            </Button>
          </DialogFooter>
        </Col>
      </DialogContent>
    </Dialog>
  );
}
