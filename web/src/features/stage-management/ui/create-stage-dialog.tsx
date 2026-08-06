"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
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
import { Col, Row } from "@/shared/ui/stack";
import type { Stage, StageSelectorKind, StageSourceKind } from "@/entities/stage/lib/types";
import { useCreateStage } from "../api/use-create-stage";
import type { SeedingRuleInput } from "../api/requests";

const BRACKET_SIZES = [4, 8, 16, 32] as const;
const ROSTER_VALUE = "roster";

type StageTypeChoice = "bracket" | "groups";

/**
 * CreateStageDialog — добавление этапа к номинации: сетка (спека 0018,
 * FR-1/FR-2) или группы (0019, FR-7), с опциональным правилом отбора (0019,
 * FR-1/FR-3/FR-6). Метод раскладки (FR-4) не спрашивается — сервер выводит
 * его сам из типа целевого этапа.
 *
 * `stages` — этапы номинации, уже существующие на момент открытия диалога
 * (переданы вызывающей стороной, `features/stage-management/ui/stage-management.tsx`):
 * источник правила предлагается только из этапов типа «группы» (FR-2) — они
 * по построению стоят раньше ещё не созданного этапа. Финальную валидацию
 * (порядок, тип, число групп источника) всё равно делает сервер (FR-9a).
 */
export function CreateStageDialog({
  nominationId,
  stages,
}: {
  nominationId: string;
  stages: Stage[];
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<StageTypeChoice>("bracket");
  const [title, setTitle] = useState("Плейофф");
  const [bracketSize, setBracketSize] = useState<(typeof BRACKET_SIZES)[number]>(8);
  const [thirdPlace, setThirdPlace] = useState(false);
  const [groupCount, setGroupCount] = useState(4);

  const [hasRule, setHasRule] = useState(false);
  const [sourceKind, setSourceKind] = useState<StageSourceKind>("STAGE_SOURCE_KIND_ROSTER");
  const [sourceStageId, setSourceStageId] = useState("");
  const [selector, setSelector] = useState<StageSelectorKind>("STAGE_SELECTOR_KIND_ALL");
  const [placeFrom, setPlaceFrom] = useState("1");
  const [placeTo, setPlaceTo] = useState("");

  const create = useCreateStage(nominationId);

  const sourceStages = stages.filter((s) => s.type === "STAGE_TYPE_GROUPS");

  function reset() {
    setType("bracket");
    setTitle("Плейофф");
    setBracketSize(8);
    setThirdPlace(false);
    setGroupCount(4);
    setHasRule(false);
    setSourceKind("STAGE_SOURCE_KIND_ROSTER");
    setSourceStageId("");
    setSelector("STAGE_SELECTOR_KIND_ALL");
    setPlaceFrom("1");
    setPlaceTo("");
    create.reset();
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) reset();
  }

  function onTypeChange(next: StageTypeChoice) {
    setType(next);
    setTitle(next === "bracket" ? "Плейофф" : "Группы");
  }

  function onSourceChange(value: string) {
    if (value === ROSTER_VALUE) {
      setSourceKind("STAGE_SOURCE_KIND_ROSTER");
      setSourceStageId("");
      setSelector("STAGE_SELECTOR_KIND_ALL");
    } else {
      setSourceKind("STAGE_SOURCE_KIND_STAGE");
      setSourceStageId(value);
    }
  }

  function buildRule(): SeedingRuleInput | undefined {
    if (!hasRule) return undefined;
    const isAll = selector === "STAGE_SELECTOR_KIND_ALL";
    return {
      sourceKind,
      sourceStageId: sourceKind === "STAGE_SOURCE_KIND_STAGE" ? sourceStageId : "",
      selector,
      placeFrom: isAll ? 0 : Number(placeFrom) || 0,
      placeTo: isAll ? 0 : placeTo.trim() === "" ? 0 : Number(placeTo) || 0,
    };
  }

  function onSubmit() {
    const rule = buildRule();
    const input =
      type === "bracket"
        ? { type: "bracket" as const, title, bracketSize, thirdPlace, ...(rule ? { rule } : {}) }
        : { type: "groups" as const, title, groupCount, ...(rule ? { rule } : {}) };
    create.mutate(input, { onSuccess: () => setOpen(false) });
  }

  const showPlaceBounds = hasRule && selector !== "STAGE_SELECTOR_KIND_ALL";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          <Plus /> Добавить этап
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Новый этап</DialogTitle>
          <DialogDescription>
            Тип, параметры и правило отбора задаются один раз при создании (FR-6:
            правило можно изменить позже, пока состав пуст).
          </DialogDescription>
        </DialogHeader>
        <Col gap={4}>
          <Col gap={1}>
            <Label>Тип этапа</Label>
            <Row gap={2}>
              <Button
                type="button"
                size="sm"
                variant={type === "bracket" ? "default" : "outline"}
                onClick={() => onTypeChange("bracket")}
              >
                Сетка
              </Button>
              <Button
                type="button"
                size="sm"
                variant={type === "groups" ? "default" : "outline"}
                onClick={() => onTypeChange("groups")}
              >
                Группы
              </Button>
            </Row>
          </Col>

          <Col gap={1}>
            <Label htmlFor="create-stage-title">Название</Label>
            <Input
              id="create-stage-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Col>

          {type === "bracket" ? (
            <>
              <Col gap={1}>
                <Label>Размер сетки</Label>
                <Select
                  value={String(bracketSize)}
                  onValueChange={(v) => setBracketSize(Number(v) as (typeof BRACKET_SIZES)[number])}
                >
                  <SelectTrigger>
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
                  checked={thirdPlace}
                  onCheckedChange={(checked) => setThirdPlace(checked === true)}
                />
                Бой за 3-е место
              </Label>
            </>
          ) : (
            <Col gap={1}>
              <Label htmlFor="create-stage-group-count">Число групп</Label>
              <Input
                id="create-stage-group-count"
                type="number"
                min={1}
                value={groupCount}
                onChange={(e) => setGroupCount(Math.max(1, Number(e.target.value) || 1))}
              />
            </Col>
          )}

          <Label className="flex items-center gap-2 font-normal">
            <Checkbox
              checked={hasRule}
              onCheckedChange={(checked) => setHasRule(checked === true)}
            />
            Правило отбора
          </Label>

          {hasRule && (
            <Col gap={3} className="rounded-md border p-3">
              <Col gap={1}>
                <Label htmlFor="create-stage-source">Источник</Label>
                <Select
                  value={sourceKind === "STAGE_SOURCE_KIND_ROSTER" ? ROSTER_VALUE : sourceStageId}
                  onValueChange={onSourceChange}
                >
                  <SelectTrigger id="create-stage-source">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ROSTER_VALUE}>Ростер номинации</SelectItem>
                    {sourceStages.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Col>

              <Col gap={1}>
                <Label htmlFor="create-stage-selector">Селектор</Label>
                <Select
                  value={selector}
                  disabled={sourceKind === "STAGE_SOURCE_KIND_ROSTER"}
                  onValueChange={(v) => setSelector(v as StageSelectorKind)}
                >
                  <SelectTrigger id="create-stage-selector">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STAGE_SELECTOR_KIND_ALL">Все участники</SelectItem>
                    <SelectItem value="STAGE_SELECTOR_KIND_GROUP_PLACES">
                      Места X–Y каждой группы
                    </SelectItem>
                    <SelectItem value="STAGE_SELECTOR_KIND_OVERALL_PLACES">
                      Места X–Y сводного порядка
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Col>

              {showPlaceBounds && (
                <Row gap={2}>
                  <Col gap={1} className="flex-1">
                    <Label htmlFor="create-stage-place-from">От места</Label>
                    <Input
                      id="create-stage-place-from"
                      type="number"
                      min={1}
                      value={placeFrom}
                      onChange={(e) => setPlaceFrom(e.target.value)}
                    />
                  </Col>
                  <Col gap={1} className="flex-1">
                    <Label htmlFor="create-stage-place-to">До места (пусто — без верхней границы)</Label>
                    <Input
                      id="create-stage-place-to"
                      type="number"
                      min={0}
                      value={placeTo}
                      onChange={(e) => setPlaceTo(e.target.value)}
                    />
                  </Col>
                </Row>
              )}
            </Col>
          )}

          {create.error && (
            <Alert variant="destructive">
              <AlertDescription>{create.error.message}</AlertDescription>
            </Alert>
          )}
        </Col>
        <DialogFooter>
          <Button type="button" loading={create.isPending} onClick={onSubmit}>
            Создать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
