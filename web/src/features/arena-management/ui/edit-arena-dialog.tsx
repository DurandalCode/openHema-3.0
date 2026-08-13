"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ExternalLink, Minus, MonitorPlay, Plus } from "lucide-react";
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
import { Col, Row } from "@/shared/ui/stack";
import { formatDurationLabel } from "@/entities/arena/lib/format";
import type { Arena } from "@/entities/arena/lib/types";
import { useUpdateArena } from "../api/use-update-arena";
import { useSetDefaultDuration } from "../api/use-set-default-duration";

const DURATION_MIN = 1;
const DURATION_MAX = 3600;
const DURATION_STEP = 30;
const DURATION_PRESETS = [120, 180, 300];

/**
 * EditArenaDialog — правка площадки модалкой со строки (spec FR-12), а не
 * разворачиванием строки в форму на месте. Реквизиты (название, описание) и
 * дефолтная длительность боя сохраняются **отдельными вызовами**
 * (`useUpdateArena` / `useSetDefaultDuration`, plan «Web») по одному нажатию
 * «Сохранить»: длительность отправляется, только если она изменилась (AC-8).
 * Отсюда же — переходы «Открыть площадку»/«Табло» и «Убрать в архив»
 * (архивация не требует подтверждения, FR-14 — забота вызывающей стороны
 * через `onArchive`, тост со «Отменить» показывает экран).
 */
export function EditArenaDialog({
  tournamentId,
  arena,
  open,
  onOpenChange,
  onArchive,
  archivePending,
}: {
  tournamentId: string;
  arena: Arena;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onArchive: () => void;
  archivePending: boolean;
}) {
  const [name, setName] = useState(arena.name);
  const [description, setDescription] = useState(arena.description);
  const [durationSeconds, setDurationSeconds] = useState(arena.defaultDurationSeconds);
  const [nameError, setNameError] = useState<string | null>(null);

  const update = useUpdateArena(tournamentId);
  const setDuration = useSetDefaultDuration(tournamentId);

  function reset() {
    setName(arena.name);
    setDescription(arena.description);
    setDurationSeconds(arena.defaultDurationSeconds);
    setNameError(null);
    update.reset();
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (next) reset();
  }

  function clampDuration(seconds: number): number {
    return Math.min(DURATION_MAX, Math.max(DURATION_MIN, seconds));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setNameError("Введите название");
      return;
    }
    setNameError(null);

    if (durationSeconds !== arena.defaultDurationSeconds) {
      setDuration.mutate({ id: arena.id, seconds: durationSeconds });
    }

    update.mutate(
      { id: arena.id, input: { name, description } },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
      },
    );
  }

  function onArchiveClick() {
    onArchive();
    onOpenChange(false);
  }

  const serverError = update.error?.message ?? null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Правка площадки</DialogTitle>
          <DialogDescription>Название, описание/локация и дефолтная длительность боя.</DialogDescription>
        </DialogHeader>
        <Col as="form" onSubmit={onSubmit} noValidate gap={4}>
          <Col gap={2}>
            <Label htmlFor="edit-arena-name">Название</Label>
            <Input
              id="edit-arena-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={nameError ? true : undefined}
            />
            {nameError && <p className="text-xs text-destructive">{nameError}</p>}
          </Col>

          <Col gap={2}>
            <Label htmlFor="edit-arena-description">Описание / локация</Label>
            <Textarea
              id="edit-arena-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </Col>

          <Col gap={2}>
            <Label>Длительность боя по умолчанию</Label>
            <Row align="center" gap={2}>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => setDurationSeconds((s) => clampDuration(s - DURATION_STEP))}
                aria-label="Уменьшить"
              >
                <Minus />
              </Button>
              <span className="w-16 text-center font-mono text-lg font-bold">
                {formatDurationLabel(durationSeconds)}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => setDurationSeconds((s) => clampDuration(s + DURATION_STEP))}
                aria-label="Увеличить"
              >
                <Plus />
              </Button>
              <Row gap={1} className="ml-2">
                {DURATION_PRESETS.map((preset) => (
                  <Button
                    key={preset}
                    type="button"
                    variant={durationSeconds === preset ? "default" : "outline"}
                    size="sm"
                    onClick={() => setDurationSeconds(preset)}
                  >
                    {formatDurationLabel(preset)}
                  </Button>
                ))}
              </Row>
            </Row>
            <p className="text-xs text-muted-foreground">
              Применяется к новым боям на этой площадке; идущий не затронет.
            </p>
          </Col>

          {serverError && (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <Row align="center" gap={4} className="border-t border-border pt-4">
            <Button type="button" variant="link" className="h-auto p-0 text-xs" asChild>
              <Link href={`/admin/arenas/${arena.id}`}>
                <ExternalLink /> Открыть площадку
              </Link>
            </Button>
            <Button type="button" variant="link" className="h-auto p-0 text-xs" asChild>
              <Link href={`/admin/arenas/${arena.id}/scoreboard`} target="_blank">
                <MonitorPlay /> Табло
              </Link>
            </Button>
            <Button
              type="button"
              variant="link"
              className="ml-auto h-auto p-0 text-xs text-destructive"
              loading={archivePending}
              onClick={onArchiveClick}
            >
              Убрать в архив
            </Button>
          </Row>

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
