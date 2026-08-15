"use client";

import { useEffect, useState } from "react";
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
import { Col, Row } from "@/shared/ui/stack";
import { cn } from "@/shared/lib/cn";
import type { Stage, StageBuildTie, TieResolution } from "@/entities/stage/lib/types";
import { useBuildPreview } from "../api/use-build-preview";
import { useBuildStage } from "../api/use-build-stage";
import { buildBlockedReason } from "../lib/build-gate";
import { allTiesResolved, findTieResolution, toggleTieContender } from "../lib/tie-resolution";

/**
 * BuildStageDialog — превью и формирование этапа (0019, FR-13/FR-15; 0032,
 * FR-15/FR-16): этап с заданным правилом отбора. Цикл превью↔дележ (см.
 * `lib/tie-resolution.ts`): открытие диалога шлёт превью с пустыми `ties`;
 * если сервер вернул дележи — организатор выбирает порядок прохода прямо
 * здесь, затем «Обновить превью с ответами» пересчитывает превью с
 * накопленными `ties`; когда сервер перестаёт возвращать дележи и
 * пересечений нет, «Сформировать» становится доступной и отправляет ровно
 * те же `ties`. Причина недоступности кнопки — единая функция
 * `buildBlockedReason` (`lib/build-gate.ts`), она же и объясняет блокировку
 * рядом с кнопкой (FR-16).
 *
 * Управляемый (спека 0032, T6, по образцу `create-stage-dialog` после
 * 0031): без `open`/`onOpenChange` диалог остаётся самодостаточным — своя
 * кнопка-триггер и внутреннее состояние открытости (карточка этапа схемы,
 * 0031 FR-11, продолжает открывать его так же). С `open` — триггер не
 * рендерится вовсе, открытость целиком у вызывающей стороны (строка
 * действий страницы этапа, FR-12).
 */
export function BuildStageDialog({
  stage,
  open: openProp,
  onOpenChange: onOpenChangeProp,
}: {
  stage: Stage;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const isControlled = openProp !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? openProp : internalOpen;

  const [resolutions, setResolutions] = useState<TieResolution[]>([]);
  const preview = useBuildPreview(stage.id);
  const build = useBuildStage(stage.id, stage.nominationId);

  const isBracket = stage.type === "STAGE_TYPE_BRACKET";
  const data = preview.data;
  const ties = data?.ties ?? [];
  const overlaps = data?.overlaps ?? [];
  const readyToRefresh = ties.length > 0 && allTiesResolved(ties, resolutions);
  const blockedReason = data ? buildBlockedReason(data) : null;
  const canBuild = !!data && blockedReason === null;

  // Сброс и первый запрос превью при каждом переходе в открытое состояние —
  // и по клику своего триггера (неуправляемый режим), и когда вызывающая
  // сторона программно выставляет `open=true` (управляемый режим), как в
  // `create-stage-dialog` (спека 0031, T9).
  useEffect(() => {
    if (open) {
      setResolutions([]);
      preview.reset();
      build.reset();
      preview.mutate([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleOpenChange(next: boolean) {
    if (!isControlled) setInternalOpen(next);
    onOpenChangeProp?.(next);
  }

  function onToggleContender(tie: StageBuildTie, fighterId: string) {
    setResolutions((prev) => toggleTieContender(prev, tie, fighterId));
  }

  function onRefreshWithTies() {
    preview.mutate(resolutions);
  }

  function onBuild() {
    build.mutate(resolutions, { onSuccess: () => handleOpenChange(false) });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {!isControlled && (
        <DialogTrigger asChild>
          <Button type="button" size="sm" variant="outline">
            Формирование
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Формирование этапа «{stage.title}»</DialogTitle>
          <DialogDescription>
            Превью отбора по правилу: проверьте состав, прежде чем подтвердить.
          </DialogDescription>
        </DialogHeader>

        {preview.isPending && <p className="text-sm text-muted-foreground">Считаем превью…</p>}
        {preview.error && (
          <Alert variant="destructive">
            <AlertDescription>{preview.error.message}</AlertDescription>
          </Alert>
        )}

        {data && (
          <Col gap={4}>
            <p className="text-sm text-muted-foreground">
              Отобрано {data.entries.length} из {data.capacity} мест.
            </p>

            {data.sourceUnfinishedBouts > 0 && (
              <Alert data-testid="unfinished-warning">
                <AlertDescription>
                  В источнике {data.sourceUnfinishedBouts} незавершённых боёв — итоги могут
                  измениться. Формирование всё равно доступно.
                </AlertDescription>
              </Alert>
            )}

            {overlaps.length > 0 && (
              <Alert variant="destructive" data-testid="overlaps-warning">
                <AlertDescription>
                  Пересечение с другой веткой отбора — сузьте селекторы:{" "}
                  {overlaps.map((f) => f.name).join(", ")}
                </AlertDescription>
              </Alert>
            )}

            <Col gap={1} data-testid="build-preview-entries">
              {data.entries.map((entry) => (
                <Row
                  key={entry.fighter.fighterId}
                  align="center"
                  justify="between"
                  gap={2}
                  className="border-b py-1 text-sm last:border-b-0"
                >
                  <span className="font-medium">{entry.fighter.name}</span>
                  <span className="text-muted-foreground">{entry.originLabel}</span>
                  <span>{isBracket ? `Слот ${entry.targetSlot}` : `Группа ${entry.targetPoolNumber}`}</span>
                </Row>
              ))}
              {data.entries.length === 0 && (
                <p className="text-sm text-muted-foreground">Отобранных нет.</p>
              )}
            </Col>

            {data.unselected.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Не попали в отбор: {data.unselected.map((f) => f.name).join(", ")}
              </p>
            )}

            {ties.length > 0 && (
              <Col gap={3} className="rounded-md border p-3" data-testid="build-ties">
                <span className="text-sm font-medium">Разделены места — укажите порядок прохода</span>
                {ties.map((tie) => (
                  <TieRow
                    key={`${tie.sourcePoolId}::${tie.place}`}
                    tie={tie}
                    resolutions={resolutions}
                    onToggle={onToggleContender}
                  />
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!readyToRefresh}
                  loading={preview.isPending}
                  onClick={onRefreshWithTies}
                >
                  Обновить превью с ответами
                </Button>
              </Col>
            )}

            {build.error && (
              <Alert variant="destructive">
                <AlertDescription>{build.error.message}</AlertDescription>
              </Alert>
            )}
          </Col>
        )}

        <DialogFooter className="items-center gap-3 sm:justify-between">
          {blockedReason && (
            <span className="text-sm text-muted-foreground" data-testid="build-blocked-reason">
              {blockedReason}
            </span>
          )}
          <Button type="button" disabled={!canBuild} loading={build.isPending} onClick={onBuild}>
            Сформировать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TieRow({
  tie,
  resolutions,
  onToggle,
}: {
  tie: StageBuildTie;
  resolutions: TieResolution[];
  onToggle: (tie: StageBuildTie, fighterId: string) => void;
}) {
  const order = findTieResolution(resolutions, tie)?.fighterIds ?? [];
  return (
    <Col gap={1}>
      <span className="text-xs text-muted-foreground">
        {tie.groupLabel ? `${tie.groupLabel}, ` : ""}место {tie.place} — проходят {tie.slotsLeft} из{" "}
        {tie.contenders.length}
      </span>
      <Row gap={2} wrap>
        {tie.contenders.map((contender) => {
          const position = order.indexOf(contender.fighterId);
          const selected = position >= 0;
          return (
            <button
              key={contender.fighterId}
              type="button"
              onClick={() => onToggle(tie, contender.fighterId)}
              className={cn(
                "rounded-md border px-2 py-1 text-sm transition-colors",
                selected ? "border-primary bg-accent" : "hover:bg-accent",
              )}
            >
              {selected && <span className="mr-1 text-xs text-muted-foreground">{position + 1}.</span>}
              {contender.name}
              {contender.club ? ` (${contender.club})` : ""}
            </button>
          );
        })}
      </Row>
    </Col>
  );
}
