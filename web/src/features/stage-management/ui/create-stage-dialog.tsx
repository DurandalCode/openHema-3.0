"use client";

import { useEffect, useState } from "react";
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
import { stageErrorMessage } from "@/entities/stage/lib/errors";
import type { StageTypeChoice } from "@/entities/stage/lib/schema-drag";
import type { Stage, StageSelectorKind, StageSourceKind } from "@/entities/stage/lib/types";
import { useCreateStage } from "../api/use-create-stage";
import type { SeedingRuleInput } from "../api/requests";

const BRACKET_SIZES = [4, 8, 16, 32] as const;
const ROSTER_VALUE = "roster";

/**
 * CreateStagePrefill — предзаполнение диалога броском на холст (спека 0031,
 * FR-13/FR-14): `type` предвыбирает тип этапа, `sourceStageId` — источник
 * правила отбора (карточка, на которую бросили «Группы»/«Плейофф»). Бросок
 * на пустую зону холста (FR-13) даёт `{ type }` без `sourceStageId` — состав
 * набирается вручную, правило не заводится вовсе.
 */
export type CreateStagePrefill = { type: StageTypeChoice; sourceStageId?: string };

/**
 * CreateStageDialog — добавление этапа к номинации: сетка (спека 0018,
 * FR-1/FR-2) или группы (0019, FR-7), с опциональным правилом отбора (0019,
 * FR-1/FR-3/FR-6). Метод раскладки (FR-4) не спрашивается — сервер выводит
 * его сам из типа целевого этапа.
 *
 * `stages` — этапы номинации, уже существующие на момент открытия диалога
 * (переданы вызывающей стороной, `widgets/nomination-schema`): источник
 * правила предлагается только из этапов типа «группы» (FR-2) — они по
 * построению стоят раньше ещё не созданного этапа. Финальную валидацию
 * (порядок, тип, число групп источника) всё равно делает сервер (FR-9a).
 *
 * Управляемый (спека 0031, T9): без `open`/`onOpenChange` диалог остаётся
 * самодостаточным — своя кнопка-триггер и внутреннее состояние открытости
 * (обратная совместимость с прежним использованием). С `open` — триггер не
 * рендерится вовсе: открытость и её смена целиком у вызывающей стороны
 * (`widgets/nomination-schema`), которой нужно открывать диалог программно —
 * и по кнопкам палитры/зоны броска, и по завершению перетаскивания
 * (FR-13/FR-14). `prefill` применяется каждый раз, когда `open` становится
 * `true` — не только при первом монтировании.
 */
export function CreateStageDialog({
  nominationId,
  stages,
  open: openProp,
  onOpenChange: onOpenChangeProp,
  prefill,
}: {
  nominationId: string;
  stages: Stage[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  prefill?: CreateStagePrefill;
}) {
  const isControlled = openProp !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? openProp : internalOpen;

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

  function applyPrefill(p?: CreateStagePrefill) {
    const nextType = p?.type ?? "bracket";
    setType(nextType);
    setTitle(nextType === "bracket" ? "Плейофф" : "Группы");
    setBracketSize(8);
    setThirdPlace(false);
    setGroupCount(4);
    setPlaceFrom("1");
    setPlaceTo("");
    if (p?.sourceStageId) {
      setHasRule(true);
      setSourceKind("STAGE_SOURCE_KIND_STAGE");
      setSourceStageId(p.sourceStageId);
      setSelector("STAGE_SELECTOR_KIND_ALL");
    } else {
      setHasRule(false);
      setSourceKind("STAGE_SOURCE_KIND_ROSTER");
      setSourceStageId("");
      setSelector("STAGE_SELECTOR_KIND_ALL");
    }
    create.reset();
  }

  // Применяем prefill (или дефолты без него) при каждом переходе в открытое
  // состояние — и по клику своего триггера (неуправляемый режим), и когда
  // родитель программно выставляет `open=true` (управляемый режим, FR-13/FR-14):
  // в этом случае `handleOpenChange` не вызывается вовсе, только сама смена
  // пропа. Зависимость — только `open`: пока диалог остаётся открытым, ввод
  // организатора не должен сбрасываться на каждый ре-рендер.
  useEffect(() => {
    if (open) applyPrefill(prefill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleOpenChange(next: boolean) {
    if (!isControlled) setInternalOpen(next);
    onOpenChangeProp?.(next);
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
    create.mutate(input, { onSuccess: () => handleOpenChange(false) });
  }

  const showPlaceBounds = hasRule && selector !== "STAGE_SELECTOR_KIND_ALL";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {!isControlled && (
        <DialogTrigger asChild>
          <Button type="button" size="sm">
            <Plus /> Добавить этап
          </Button>
        </DialogTrigger>
      )}
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
              <AlertDescription>{stageErrorMessage(create.error.message)}</AlertDescription>
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
