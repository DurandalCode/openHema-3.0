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
import { useUpdateNomination } from "../api/use-update-nomination";

/**
 * EditNominationDialog — правка номинации модалкой со строки (spec FR-10),
 * а не разворачиванием строки в форму на месте. Те же поля, что при
 * создании (AC-8): название, описание, количество бойцов, ссылка на
 * регламент.
 */
export function EditNominationDialog({
  tournamentId,
  nomination,
  open,
  onOpenChange,
}: {
  tournamentId: string;
  nomination: Nomination;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [title, setTitle] = useState(nomination.title);
  const [description, setDescription] = useState(nomination.description);
  const [fighterCapacity, setFighterCapacity] = useState(
    nomination.fighterCapacity === null ? "" : String(nomination.fighterCapacity),
  );
  const [rulesUrl, setRulesUrl] = useState(nomination.metadata.rulesUrl);
  const [titleError, setTitleError] = useState<string | null>(null);

  const update = useUpdateNomination(tournamentId);

  function reset() {
    setTitle(nomination.title);
    setDescription(nomination.description);
    setFighterCapacity(nomination.fighterCapacity === null ? "" : String(nomination.fighterCapacity));
    setRulesUrl(nomination.metadata.rulesUrl);
    setTitleError(null);
    update.reset();
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

    update.mutate(
      {
        id: nomination.id,
        input: {
          title,
          description,
          fighterCapacity: fighterCapacity.trim() === "" ? null : Number(fighterCapacity),
          metadata: { rulesUrl },
        },
      },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
      },
    );
  }

  const serverError = update.error?.message ?? null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Правка номинации</DialogTitle>
          <DialogDescription>
            Название, описание, плановая вместимость и ссылка на регламент.
          </DialogDescription>
        </DialogHeader>
        <Col as="form" onSubmit={onSubmit} noValidate gap={4}>
          <Col gap={2}>
            <Label htmlFor="edit-nomination-title">Название</Label>
            <Input
              id="edit-nomination-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-invalid={titleError ? true : undefined}
            />
            {titleError && <p className="text-xs text-destructive">{titleError}</p>}
          </Col>

          <Col gap={2}>
            <Label htmlFor="edit-nomination-description">Описание</Label>
            <Textarea
              id="edit-nomination-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </Col>

          <div className="grid gap-4 sm:grid-cols-2">
            <Col gap={2}>
              <Label htmlFor="edit-nomination-capacity">Кол-во бойцов</Label>
              <Input
                id="edit-nomination-capacity"
                type="number"
                min={0}
                placeholder="Не задано"
                value={fighterCapacity}
                onChange={(e) => setFighterCapacity(e.target.value)}
              />
            </Col>
            <Col gap={2}>
              <Label htmlFor="edit-nomination-rules">Ссылка на регламент</Label>
              <Input
                id="edit-nomination-rules"
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
            <Button type="submit" loading={update.isPending}>
              Сохранить
            </Button>
          </DialogFooter>
        </Col>
      </DialogContent>
    </Dialog>
  );
}
