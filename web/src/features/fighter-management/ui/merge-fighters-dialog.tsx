"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Col } from "@/shared/ui/stack";
import { toastError, toastSuccess } from "@/shared/lib/toast";
import { isMergedFighter, type Fighter } from "@/entities/fighter/lib/types";
import { useMergeFighters } from "../api/use-fighter-mutations";

const MERGE_CONSEQUENCES =
  "Участия в номинациях и результаты боёв дубля переносятся на итоговую запись. Дубль помечается объединённым и больше не будет фигурировать как отдельный участник. Действие необратимо.";

function fighterOptionLabel(f: Fighter): string {
  return f.club ? `${f.name} · ${f.club}` : f.name;
}

/**
 * MergeFightersDialog — слияние двух записей одного и того же участника в
 * ростере (admin, спека 0040, FR-10/FR-10a): source/target выбираются из
 * ростера двумя `Select` (тот же стиль выбора, что `MoveFighterDialog`),
 * подтверждение через общий `ConfirmDialog` — необратимое действие (тот же
 * канон, что вывод бойца/удаление номинации, спеки 0028/0038).
 *
 * Уже объединённые записи (`FIGHTER_STATUS_MERGED`) не предлагаются: они
 * больше не фигурируют как отдельный участник (FR-10) и не могут быть ни
 * source, ни target нового слияния.
 */
export function MergeFightersDialog({
  fighters,
  open,
  onOpenChange,
}: {
  fighters: Fighter[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const merge = useMergeFighters();

  const options = fighters.filter((f) => !isMergedFighter(f.status));
  const source = options.find((f) => f.id === sourceId);
  const target = options.find((f) => f.id === targetId);
  const canSubmit = sourceId !== "" && targetId !== "" && sourceId !== targetId;

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (next) {
      setSourceId("");
      setTargetId("");
    }
  }

  function onConfirm() {
    if (!canSubmit) return;
    merge.mutate(
      { sourceFighterId: sourceId, targetFighterId: targetId },
      {
        onSuccess: () => {
          toastSuccess(
            `«${source?.name ?? "Дубль"}» объединён с «${target?.name ?? "итоговой записью"}»`,
          );
          handleOpenChange(false);
        },
        onError: (err) => toastError(err.message),
      },
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Слить дубли</DialogTitle>
            <DialogDescription>
              Сведите две записи одного и того же участника в одну (спека 0040, FR-10).
            </DialogDescription>
          </DialogHeader>
          <Col gap={4}>
            <Col gap={2}>
              <Label htmlFor="merge-source">Дубль (будет объединён)</Label>
              <Select value={sourceId} onValueChange={setSourceId}>
                <SelectTrigger id="merge-source" aria-label="Дубль (будет объединён)">
                  <SelectValue placeholder="Выберите бойца" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((f) => (
                    <SelectItem key={f.id} value={f.id} disabled={f.id === targetId}>
                      {fighterOptionLabel(f)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Col>
            <Col gap={2}>
              <Label htmlFor="merge-target">Итоговая запись</Label>
              <Select value={targetId} onValueChange={setTargetId}>
                <SelectTrigger id="merge-target" aria-label="Итоговая запись">
                  <SelectValue placeholder="Выберите бойца" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((f) => (
                    <SelectItem key={f.id} value={f.id} disabled={f.id === sourceId}>
                      {fighterOptionLabel(f)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Col>
          </Col>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Отмена
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!canSubmit || merge.isPending}
              onClick={() => setConfirmOpen(true)}
            >
              Слить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={source && target ? `Слить «${source.name}» в «${target.name}»?` : "Слить дубли?"}
        consequences={MERGE_CONSEQUENCES}
        confirmLabel="Да, слить"
        destructive
        onConfirm={onConfirm}
      />
    </>
  );
}
