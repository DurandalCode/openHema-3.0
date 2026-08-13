"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Col } from "@/shared/ui/stack";
import { toastError, toastSuccess } from "@/shared/lib/toast";
import type { Fighter } from "@/entities/fighter/lib/types";
import type { Nomination } from "@/entities/nomination/lib/types";
import { useMoveFighter } from "../api/use-fighter-mutations";
import { addableNominations } from "../lib/select-fighters";

/**
 * MoveFighterDialog — перевод бойца из одной номинации в другую одним
 * действием (spec FR-14/FR-15, AC-8): первый вызов `useMoveFighter` из UI
 * (plan «Обзор решения», п.1). Целевые номинации — те же, что и для
 * «Добавить» (`addableNominations`, FR-15): у бойца там ещё нет активного
 * участия.
 */
export function MoveFighterDialog({
  fighter,
  fromNominationId,
  nominations,
  open,
  onOpenChange,
}: {
  fighter: Fighter;
  fromNominationId: string;
  nominations: Nomination[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [toNominationId, setToNominationId] = useState("");
  const move = useMoveFighter();

  const targets = addableNominations(fighter, nominations);

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (next) setToNominationId("");
  }

  function onSubmit() {
    if (!toNominationId) return;
    move.mutate(
      { fighterId: fighter.id, fromNominationId, toNominationId },
      {
        onSuccess: () => {
          toastSuccess("Боец переведён в другую номинацию");
          onOpenChange(false);
        },
        onError: (err) => toastError(err.message),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Перевести в другую номинацию</DialogTitle>
          <DialogDescription>
            Участие в текущей номинации станет снятым, в выбранной — активным.
          </DialogDescription>
        </DialogHeader>
        <Col gap={4}>
          <Select value={toNominationId} onValueChange={setToNominationId}>
            <SelectTrigger>
              <SelectValue placeholder="Выберите номинацию" />
            </SelectTrigger>
            <SelectContent>
              {targets.map((n) => (
                <SelectItem key={n.id} value={n.id}>
                  {n.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Col>
        <DialogFooter>
          <Button
            type="button"
            disabled={!toNominationId || move.isPending}
            loading={move.isPending}
            onClick={onSubmit}
          >
            Перевести
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
