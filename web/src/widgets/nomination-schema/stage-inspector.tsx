"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Col, Row } from "@/shared/ui/stack";
import { toastError, toastSuccess } from "@/shared/lib/toast";
import { stageErrorMessage } from "@/entities/stage/lib/errors";
import { stageRuleLabel, stageTypeLabel } from "@/entities/stage/lib/labels";
import type {
  SeedingRule,
  Stage,
  StageSelectorKind,
  StageSourceKind,
} from "@/entities/stage/lib/types";
import { useUpdateStage } from "@/features/stage-management/api/use-update-stage";
import { useSetStageRule } from "@/features/stage-management/api/use-set-stage-rule";
import { useSetStageStatus } from "@/features/stage-management/api/use-set-stage-status";
import { useDeleteStage } from "@/features/stage-management/api/use-delete-stage";
import type { SeedingRuleInput } from "@/features/stage-management/api/requests";

const BRACKET_SIZES = [4, 8, 16, 32] as const;
const MANUAL_VALUE = "manual";
const ROSTER_VALUE = "roster";

/**
 * StageInspector — панель справа (спека 0031, FR-18..FR-24): закрывает
 * функциональный пробел спеки 0019 (FR-6) — правило отбора после создания
 * этапа было заморожено, здесь `useSetStageRule` наконец вызывается.
 * Одновременно заменяет `EditStageDialog` (название + конфиг, решение
 * пользователя №1 в `spec.md`) и добавляет вторую точку входа в фиксацию
 * состава (FR-22, `useSetStageStatus`, T8).
 *
 * `composeEmpty` — тот же оптимистичный гейт, что был у `EditStageDialog`
 * через `StageQuickActions` в старом `stage-management.tsx`: список этапов
 * номинации не несёт точного числа членств (это отдельный запрос —
 * `GetLayout`), поэтому `status === DRAFT` — предположение «можно
 * редактировать», сервер (`ErrStageLocked`) перепроверяет и его ошибка
 * попадёт в тост, если предположение неверно.
 */
export function StageInspector({
  stage,
  stages,
  nominationId,
  onClose,
}: {
  stage: Stage;
  stages: Stage[];
  nominationId: string;
  onClose: () => void;
}) {
  const composeEmpty = stage.status === "POOL_LAYOUT_STATUS_DRAFT";
  const isReady = stage.status === "POOL_LAYOUT_STATUS_READY";

  const update = useUpdateStage(nominationId);
  const setRule = useSetStageRule(nominationId);
  const setStatus = useSetStageStatus(nominationId);
  const deleteStage = useDeleteStage(nominationId);

  const [title, setTitle] = useState(stage.title);
  const [titleError, setTitleError] = useState<string | null>(null);

  const [bracketSize, setBracketSize] = useState<(typeof BRACKET_SIZES)[number]>(
    (stage.bracket?.size as (typeof BRACKET_SIZES)[number]) ?? 8,
  );
  const [thirdPlace, setThirdPlace] = useState(stage.bracket?.thirdPlace ?? false);
  const [groupCount, setGroupCount] = useState(stage.groups?.groupCount ?? 0);

  const [hasRule, setHasRule] = useState(!!stage.rule);
  const [sourceKind, setSourceKind] = useState<StageSourceKind>(
    stage.rule?.sourceKind ?? "STAGE_SOURCE_KIND_ROSTER",
  );
  const [sourceStageId, setSourceStageId] = useState(stage.rule?.sourceStageId ?? "");
  const [selector, setSelector] = useState<StageSelectorKind>(
    stage.rule?.selector ?? "STAGE_SELECTOR_KIND_ALL",
  );
  const [placeFrom, setPlaceFrom] = useState(String(stage.rule?.placeFrom ?? 1));
  const [placeTo, setPlaceTo] = useState(
    stage.rule && stage.rule.placeTo !== 0 ? String(stage.rule.placeTo) : "",
  );

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // Переключение выделенного этапа (клик по другой карточке, FR-18) — форма
  // переинициализируется с нуля; ререндер того же этапа после успешной
  // мутации не сбрасывает несохранённый ввод (зависимость только от `id`).
  useEffect(() => {
    setTitle(stage.title);
    setTitleError(null);
    setBracketSize((stage.bracket?.size as (typeof BRACKET_SIZES)[number]) ?? 8);
    setThirdPlace(stage.bracket?.thirdPlace ?? false);
    setGroupCount(stage.groups?.groupCount ?? 0);
    setHasRule(!!stage.rule);
    setSourceKind(stage.rule?.sourceKind ?? "STAGE_SOURCE_KIND_ROSTER");
    setSourceStageId(stage.rule?.sourceStageId ?? "");
    setSelector(stage.rule?.selector ?? "STAGE_SELECTOR_KIND_ALL");
    setPlaceFrom(String(stage.rule?.placeFrom ?? 1));
    setPlaceTo(stage.rule && stage.rule.placeTo !== 0 ? String(stage.rule.placeTo) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.id]);

  const sourceStages = stages.filter((s) => s.type === "STAGE_TYPE_GROUPS" && s.id !== stage.id);

  function commitTitle() {
    const trimmed = title.trim();
    if (trimmed === "") {
      setTitleError("Название не может быть пустым");
      setTitle(stage.title);
      return;
    }
    setTitleError(null);
    if (trimmed === stage.title) return;
    update.mutate(
      { stageId: stage.id, input: { title: trimmed } },
      {
        onSuccess: () => toastSuccess("Название сохранено"),
        onError: (err: Error) => {
          toastError(stageErrorMessage(err.message));
          setTitle(stage.title);
        },
      },
    );
  }

  function onTitleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") e.currentTarget.blur();
    if (e.key === "Escape") {
      setTitle(stage.title);
      setTitleError(null);
      e.currentTarget.blur();
    }
  }

  function saveConfig() {
    const input =
      stage.type === "STAGE_TYPE_BRACKET"
        ? { title: stage.title, bracket: { size: bracketSize, thirdPlace } }
        : stage.type === "STAGE_TYPE_GROUPS"
          ? { title: stage.title, groups: { groupCount } }
          : { title: stage.title };
    update.mutate(
      { stageId: stage.id, input },
      {
        onSuccess: () => toastSuccess("Параметры сохранены"),
        onError: (err: Error) => toastError(stageErrorMessage(err.message)),
      },
    );
  }

  function onSourceChange(value: string) {
    if (value === MANUAL_VALUE) {
      setHasRule(false);
      return;
    }
    setHasRule(true);
    if (value === ROSTER_VALUE) {
      setSourceKind("STAGE_SOURCE_KIND_ROSTER");
      setSourceStageId("");
      setSelector("STAGE_SELECTOR_KIND_ALL");
    } else {
      setSourceKind("STAGE_SOURCE_KIND_STAGE");
      setSourceStageId(value);
    }
  }

  function buildRule(): SeedingRuleInput | null {
    if (!hasRule) return null;
    const isAll = selector === "STAGE_SELECTOR_KIND_ALL";
    return {
      sourceKind,
      sourceStageId: sourceKind === "STAGE_SOURCE_KIND_STAGE" ? sourceStageId : "",
      selector,
      placeFrom: isAll ? 0 : Number(placeFrom) || 0,
      placeTo: isAll ? 0 : placeTo.trim() === "" ? 0 : Number(placeTo) || 0,
    };
  }

  function saveRule() {
    setRule.mutate(
      { stageId: stage.id, rule: buildRule() },
      {
        onSuccess: () => toastSuccess("Правило сохранено"),
        onError: (err: Error) => toastError(stageErrorMessage(err.message)),
      },
    );
  }

  function clearRule() {
    setHasRule(false);
    setRule.mutate(
      { stageId: stage.id, rule: null },
      {
        onSuccess: () => toastSuccess("Правило снято"),
        onError: (err: Error) => toastError(stageErrorMessage(err.message)),
      },
    );
  }

  function toggleStatus() {
    const next = isReady ? "draft" : "ready";
    setStatus.mutate(
      { stageId: stage.id, status: next },
      {
        onSuccess: () =>
          toastSuccess(next === "ready" ? "Состав зафиксирован" : "Состав возвращён в черновик"),
        onError: (err: Error) => toastError(stageErrorMessage(err.message)),
      },
    );
  }

  function confirmDelete() {
    deleteStage.mutate(stage.id, {
      onSuccess: () => {
        toastSuccess("Этап удалён");
        onClose();
      },
      onError: (err: Error) => toastError(stageErrorMessage(err.message)),
    });
  }

  const showPlaceBounds = hasRule && selector !== "STAGE_SELECTOR_KIND_ALL";
  const rulePreview: SeedingRule | null = hasRule
    ? { ...(buildRule() as SeedingRuleInput), method: "STAGE_LAYOUT_METHOD_UNSPECIFIED" }
    : null;
  const sourceSelectValue = !hasRule
    ? MANUAL_VALUE
    : sourceKind === "STAGE_SOURCE_KIND_ROSTER"
      ? ROSTER_VALUE
      : sourceStageId;

  return (
    <Col gap={5} data-testid="stage-inspector" className="w-full max-w-sm">
      <Row align="center" justify="between">
        <h2 className="text-sm font-semibold">Инспектор этапа</h2>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Закрыть инспектор">
          <X />
        </Button>
      </Row>

      <Col gap={1}>
        <Label htmlFor="inspector-title">Название</Label>
        <Input
          id="inspector-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={onTitleKeyDown}
        />
        {titleError && <p className="text-xs text-destructive">{titleError}</p>}
      </Col>

      <Col gap={1}>
        <Label>Тип</Label>
        <p className="text-sm">{stageTypeLabel(stage.type)}</p>
        <p className="text-xs text-muted-foreground">
          Тип этапа меняется только пересозданием — здесь он только для чтения.
        </p>
      </Col>

      <Col gap={2} className="rounded-md border p-3">
        <span className="text-sm font-medium">Параметры</span>
        {!composeEmpty && (
          <p className="text-xs text-muted-foreground">
            В этапе уже есть состав — параметры нельзя менять, пока он не пуст.
          </p>
        )}

        {stage.type === "STAGE_TYPE_BRACKET" && (
          <>
            <Col gap={1}>
              <Label htmlFor="inspector-bracket-size">Размер сетки</Label>
              <Select
                disabled={!composeEmpty}
                value={String(bracketSize)}
                onValueChange={(v) => setBracketSize(Number(v) as (typeof BRACKET_SIZES)[number])}
              >
                <SelectTrigger id="inspector-bracket-size">
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
            <Label htmlFor="inspector-group-count">Число групп</Label>
            <Input
              id="inspector-group-count"
              type="number"
              min={0}
              disabled={!composeEmpty}
              value={groupCount}
              onChange={(e) => setGroupCount(Math.max(0, Number(e.target.value) || 0))}
            />
          </Col>
        )}

        <Button type="button" size="sm" variant="outline" disabled={!composeEmpty} loading={update.isPending} onClick={saveConfig}>
          Сохранить параметры
        </Button>
      </Col>

      <Col gap={2} className="rounded-md border p-3">
        <span className="text-sm font-medium">Правило отбора</span>

        <Col gap={1}>
          <Label htmlFor="inspector-source">Источник</Label>
          <Select value={sourceSelectValue} onValueChange={onSourceChange}>
            <SelectTrigger id="inspector-source">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={MANUAL_VALUE}>Вручную, без правила</SelectItem>
              <SelectItem value={ROSTER_VALUE}>Ростер номинации</SelectItem>
              {sourceStages.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Col>

        {hasRule && (
          <>
            <Col gap={1}>
              <Label htmlFor="inspector-selector">Селектор</Label>
              <Select
                value={selector}
                disabled={sourceKind === "STAGE_SOURCE_KIND_ROSTER"}
                onValueChange={(v) => setSelector(v as StageSelectorKind)}
              >
                <SelectTrigger id="inspector-selector">
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
                  <Label htmlFor="inspector-place-from">От места</Label>
                  <Input
                    id="inspector-place-from"
                    type="number"
                    min={1}
                    value={placeFrom}
                    onChange={(e) => setPlaceFrom(e.target.value)}
                  />
                </Col>
                <Col gap={1} className="flex-1">
                  <Label htmlFor="inspector-place-to">До места (пусто — без верхней границы)</Label>
                  <Input
                    id="inspector-place-to"
                    type="number"
                    min={0}
                    value={placeTo}
                    onChange={(e) => setPlaceTo(e.target.value)}
                  />
                </Col>
              </Row>
            )}
          </>
        )}

        <p className="text-xs text-muted-foreground" data-testid="inspector-rule-preview">
          {stageRuleLabel(rulePreview, stages)}
        </p>

        <Row gap={2}>
          <Button type="button" size="sm" loading={setRule.isPending} onClick={saveRule}>
            Сохранить правило
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={clearRule}>
            Очистить
          </Button>
        </Row>
      </Col>

      <Col gap={1} className="rounded-md border p-3">
        <Row align="center" justify="between">
          <span className="text-sm font-medium">Состав зафиксирован</span>
          <Button type="button" size="sm" variant={isReady ? "outline" : "default"} loading={setStatus.isPending} onClick={toggleStatus}>
            {isReady ? "Вернуть в черновик" : "Зафиксировать"}
          </Button>
        </Row>
        <p className="text-xs text-muted-foreground">
          Фиксация блокирует изменение параметров этапа, пока её не снимут.
        </p>
      </Col>

      <Row align="center" justify="between" gap={2} className="flex-wrap">
        <Link
          href={`/admin/nominations/${nominationId}/stages/${stage.id}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Открыть посев <ArrowRight className="size-3.5" />
        </Link>
        <Button type="button" variant="destructive" size="sm" onClick={() => setConfirmDeleteOpen(true)}>
          Удалить этап
        </Button>
      </Row>

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title={`Удалить этап «${stage.title}»?`}
        consequences="Отменить это действие нельзя. Сервер откажет, если в этапе уже начат бой или он служит источником другой ветки схемы."
        confirmLabel="Удалить"
        destructive
        onConfirm={confirmDelete}
      />
    </Col>
  );
}
