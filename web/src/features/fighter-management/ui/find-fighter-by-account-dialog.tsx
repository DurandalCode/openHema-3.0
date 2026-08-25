"use client";

import { useState, type FormEvent } from "react";
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
import { Col, Row } from "@/shared/ui/stack";
import { toastError } from "@/shared/lib/toast";
import type { Fighter } from "@/entities/fighter/lib/types";
import { findFighterByAccountRequest } from "../api/requests";

type SearchState = "idle" | "searching" | "found" | "not-found";

/**
 * FindFighterByAccountDialog — поиск бойца турнира по учётке пользователя
 * (admin, спека 0040, FR-9/AC-7): вызывает `find-by-account` (новую BFF-
 * ручку T25). Найденную запись открывает через `onOpenFighter` — сама
 * карточку не рендерит (её открывает вызывающий экран, у которого уже есть
 * `FighterCardDialog` над полным ростером).
 */
export function FindFighterByAccountDialog({
  tournamentId,
  open,
  onOpenChange,
  onOpenFighter,
}: {
  tournamentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenFighter: (fighterId: string) => void;
}) {
  const [userId, setUserId] = useState("");
  const [state, setState] = useState<SearchState>("idle");
  const [found, setFound] = useState<Fighter | null>(null);

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (next) {
      setUserId("");
      setState("idle");
      setFound(null);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = userId.trim();
    if (!trimmed) return;

    setState("searching");
    const res = await findFighterByAccountRequest(trimmed, tournamentId);
    if (!res.ok) {
      setState("idle");
      toastError(res.error);
      return;
    }
    if (res.fighter) {
      setFound(res.fighter);
      setState("found");
    } else {
      setFound(null);
      setState("not-found");
    }
  }

  function openFound() {
    if (!found) return;
    onOpenFighter(found.id);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Найти бойца по учётке</DialogTitle>
          <DialogDescription>
            Обратная проекция «учётка → боец» (спека 0040, FR-9): виден только admin.
          </DialogDescription>
        </DialogHeader>
        <Col as="form" onSubmit={onSubmit} noValidate gap={4}>
          <Col gap={2}>
            <Label htmlFor="find-fighter-user-id">Id учётки</Label>
            <Input
              id="find-fighter-user-id"
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value);
                setState("idle");
              }}
            />
          </Col>

          {state === "found" && found && (
            <Row align="center" gap={2} wrap>
              <span className="text-sm">
                {found.name}
                {found.club ? ` · ${found.club}` : ""}
              </span>
              <Button type="button" size="sm" variant="outline" onClick={openFound}>
                Открыть карточку
              </Button>
            </Row>
          )}

          {state === "not-found" && (
            <p className="text-sm text-caption-foreground">У этой учётки нет бойца в этом турнире.</p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={!userId.trim()} loading={state === "searching"}>
              Найти
            </Button>
          </DialogFooter>
        </Col>
      </DialogContent>
    </Dialog>
  );
}
