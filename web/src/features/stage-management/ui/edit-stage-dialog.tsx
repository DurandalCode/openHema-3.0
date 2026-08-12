"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
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
  DialogTrigger,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Col } from "@/shared/ui/stack";
import { stageErrorMessage } from "@/entities/stage/lib/errors";
import type { Stage } from "@/entities/stage/lib/types";
import { useUpdateStage } from "../api/use-update-stage";
import type { UpdateStageInput } from "../api/requests";

const BRACKET_SIZES = [4, 8, 16, 32] as const;

/**
 * EditStageDialog — правка уже созданного этапа (спека 0020, FR-2): название
 * — всегда доступно; конфиг (размер сетки + бой за 3-е место у сетки, число
 * групп у группового этапа) — заблокирован, пока состав этапа не пуст
 * (`composeEmpty`, передаётся вызывающей стороной — `stage-management.tsx`
 * знает статус фиксации и состав этапа, диалог сам этого не запрашивает).
 * Тип этапа нигде не показывается и не редактируется (AC-3): его меняют
 * пересозданием этапа.
 */
export function EditStageDialog({
  stage,
  composeEmpty,
}: {
  stage: Stage;
  composeEmpty: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(stage.title);
  const [bracketSize, setBracketSize] = useState<(typeof BRACKET_SIZES)[number]>(
    (stage.bracket?.size as (typeof BRACKET_SIZES)[number]) ?? 8,
  );
  const [thirdPlace, setThirdPlace] = useState(stage.bracket?.thirdPlace ?? false);
  const [groupCount, setGroupCount] = useState(stage.groups?.groupCount ?? 0);

  const update = useUpdateStage(stage.nominationId);

  function reset() {
    setTitle(stage.title);
    setBracketSize((stage.bracket?.size as (typeof BRACKET_SIZES)[number]) ?? 8);
    setThirdPlace(stage.bracket?.thirdPlace ?? false);
    setGroupCount(stage.groups?.groupCount ?? 0);
    update.reset();
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) reset();
  }

  function onSubmit() {
    const input: UpdateStageInput =
      stage.type === "STAGE_TYPE_BRACKET"
        ? { title, bracket: { size: bracketSize, thirdPlace } }
        : stage.type === "STAGE_TYPE_GROUPS"
          ? { title, groups: { groupCount } }
          : { title };
    update.mutate({ stageId: stage.id, input }, { onSuccess: () => setOpen(false) });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Изменить этап «${stage.title}»`}
        >
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Изменить этап «{stage.title}»</DialogTitle>
          <DialogDescription>
            Название редактируется всегда; конфиг — пока состав этапа пуст (FR-2). Чтобы сменить
            формат этапа, его удаляют и создают заново.
          </DialogDescription>
        </DialogHeader>
        <Col gap={4}>
          <Col gap={1}>
            <Label htmlFor="edit-stage-title">Название</Label>
            <Input id="edit-stage-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Col>

          {!composeEmpty && (
            <p className="text-xs text-muted-foreground">
              Конфиг можно менять, пока состав пуст.
            </p>
          )}

          {stage.type === "STAGE_TYPE_BRACKET" && (
            <>
              <Col gap={1}>
                <Label htmlFor="edit-stage-bracket-size">Размер сетки</Label>
                <Select
                  disabled={!composeEmpty}
                  value={String(bracketSize)}
                  onValueChange={(v) => setBracketSize(Number(v) as (typeof BRACKET_SIZES)[number])}
                >
                  <SelectTrigger id="edit-stage-bracket-size">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BRACKET_SIZES.map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Col>
              <Label className="flex items-center gap-2 font-normal">
                <Checkbox
                  disabled={!composeEmpty}
                  checked={thirdPlace}
                  onCheckedChange={(checked) => setThirdPlace(checked === true)}
                />
                Бой за 3-е место
              </Label>
            </>
          )}

          {stage.type === "STAGE_TYPE_GROUPS" && (
            <Col gap={1}>
              <Label htmlFor="edit-stage-group-count">Число групп</Label>
              <Input
                id="edit-stage-group-count"
                type="number"
                min={0}
                disabled={!composeEmpty}
                value={groupCount}
                onChange={(e) => setGroupCount(Math.max(0, Number(e.target.value) || 0))}
              />
            </Col>
          )}

          {update.error && (
            <Alert variant="destructive">
              <AlertDescription>{stageErrorMessage(update.error.message)}</AlertDescription>
            </Alert>
          )}
        </Col>
        <DialogFooter>
          <Button type="button" loading={update.isPending} onClick={onSubmit}>
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
