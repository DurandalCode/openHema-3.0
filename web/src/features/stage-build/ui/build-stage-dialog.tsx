"use client";

import { useState } from "react";
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
import { allTiesResolved, findTieResolution, toggleTieContender } from "../lib/tie-resolution";

/**
 * BuildStageDialog — превью и формирование этапа (0019, FR-13/FR-15/FR-16):
 * этап с заданным правилом отбора. Цикл превью↔дележ (см.
 * `lib/tie-resolution.ts`): открытие диалога шлёт превью с пустыми `ties`;
 * если сервер вернул дележи (FR-22) — организатор выбирает порядок прохода
 * прямо здесь, затем «Обновить превью с ответами» пересчитывает превью с
 * накопленными `ties`; когда сервер перестаёт возвращать дележи, «Сформировать»
 * становится доступной и отправляет ровно те же `ties`. Пересечения веток
 * (FR-11) блокируют кнопку независимо от дележей.
 */
export function BuildStageDialog({ stage }: { stage: Stage }) {
  const [open, setOpen] = useState(false);
  const [resolutions, setResolutions] = useState<TieResolution[]>([]);
  const preview = useBuildPreview(stage.id);
  const build = useBuildStage(stage.id, stage.nominationId);

  const isBracket = stage.type === "STAGE_TYPE_BRACKET";
  const data = preview.data;
  const ties = data?.ties ?? [];
  const overlaps = data?.overlaps ?? [];
  const readyToRefresh = ties.length > 0 && allTiesResolved(ties, resolutions);
  const canBuild = !!data && overlaps.length === 0 && ties.length === 0;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setResolutions([]);
      preview.reset();
      build.reset();
      preview.mutate([]);
    }
  }

  function onToggleContender(tie: StageBuildTie, fighterId: string) {
    setResolutions((prev) => toggleTieContender(prev, tie, fighterId));
  }

  function onRefreshWithTies() {
    preview.mutate(resolutions);
  }

  function onBuild() {
    build.mutate(resolutions, { onSuccess: () => setOpen(false) });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          Формирование
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Формирование этапа «{stage.title}»</DialogTitle>
          <DialogDescription>
            Превью отбора по правилу (FR-15): проверьте состав, прежде чем подтвердить.
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
                  измениться (FR-14). Формирование всё равно доступно.
                </AlertDescription>
              </Alert>
            )}

            {overlaps.length > 0 && (
              <Alert variant="destructive" data-testid="overlaps-warning">
                <AlertDescription>
                  Пересечение с другой веткой отбора — формирование недоступно, пока не сузите
                  селекторы (FR-11): {overlaps.map((f) => f.name).join(", ")}
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
                <span className="text-sm font-medium">
                  Разделены места — укажите порядок прохода (FR-22)
                </span>
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

        <DialogFooter>
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
