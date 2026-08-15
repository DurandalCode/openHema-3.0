"use client";

import Link from "next/link";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { PageHeader } from "@/shared/ui/page-header";
import { Col, Row } from "@/shared/ui/stack";
import { toastError, toastSuccess } from "@/shared/lib/toast";
import type { Nomination } from "@/entities/nomination/lib/types";
import { poolLayoutCounts, poolCountWord } from "@/entities/pool/lib/types";
import { bracketRoundOneFilledCount } from "@/entities/bracket/lib/types";
import { stageExecutionStatusLabel } from "@/entities/stage/lib/labels";
import type { Stage } from "@/entities/stage/lib/types";
import { useStages } from "@/features/stage-management/api/use-stages";
import { useLayout } from "@/features/nomination-pools/api/use-layout";
import { useSetLayoutStatus } from "@/features/nomination-pools/api/use-set-layout-status";
import { NominationPools } from "@/features/nomination-pools/ui/nomination-pools";
import { useBracket } from "@/features/bracket-seeding/api/use-bracket";
import { useSetBracketStatus } from "@/features/bracket-seeding/api/use-set-bracket-status";
import { bracketErrorMessage } from "@/features/bracket-seeding/api/errors";
import { BracketSeeding } from "@/features/bracket-seeding/ui/bracket-seeding";
import { StageSummaryCards } from "./stage-summary-cards";
import { StageActions } from "./stage-actions";
import { StageRail } from "./stage-rail";
import { StagePageSkeleton } from "./stage-page-skeleton";

/**
 * StagePageScreen — корень страницы этапа (спека 0032): единый каркас для
 * обоих типов этапа (решение пользователя, «Решения по открытым вопросам»,
 * п.1) — `PageHeader` со статусом/сводкой/фиксацией (забраны из внутренних
 * тулбаров фич сюда, FR-3), карточки сводки, строка действий формирования,
 * тело по типу этапа (посев групп/сетки, без изменений — FR-9) и правый
 * рельс. Композиция живёт в `widgets` (NFR-2): ни одна фича не импортирует
 * другую, а виджету это дозволено (правило 6 `web/AGENTS.md`), как и в
 * `widgets/nomination-schema/nomination-schema-screen.tsx` (спека 0031).
 *
 * `useStages` сеется `initialStages`, загруженными server component'ом
 * страницы (`page.tsx`, `getStages`) — первый рендер без скелетона.
 */
export function StagePageScreen({
  nomination,
  stageId,
  initialStages,
}: {
  nomination: Nomination;
  stageId: string;
  initialStages: Stage[];
}) {
  const { data, isLoading, error, refetch } = useStages(nomination.id, {
    stages: initialStages,
    issues: [],
  });
  const stages = data?.stages ?? [];
  const issues = data?.issues ?? [];
  const stage = stages.find((s) => s.id === stageId);

  const isBracket = stage?.type === "STAGE_TYPE_BRACKET";

  const layoutQuery = useLayout(stage && !isBracket ? stageId : "");
  const bracketQuery = useBracket(stage && isBracket ? stageId : "");
  const setLayoutStatus = useSetLayoutStatus(stageId);
  const setBracketStatus = useSetBracketStatus(stageId);

  if (isLoading) {
    return <StagePageSkeleton />;
  }
  if (error || !stage) {
    return (
      <Col gap={3} className="items-start p-4">
        <p className="text-sm text-destructive">{error?.message ?? "Не удалось загрузить этап"}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
          Повторить
        </Button>
      </Col>
    );
  }

  const layout = layoutQuery.data;
  const bracket = bracketQuery.data;

  const filled = isBracket
    ? bracket
      ? bracketRoundOneFilledCount(bracket)
      : 0
    : layout
      ? poolLayoutCounts(layout).assigned
      : 0;
  const capacity = isBracket ? (stage.bracket?.size ?? 0) : layout ? poolLayoutCounts(layout).total : 0;
  const canUndo = isBracket ? (bracket?.canUndo ?? false) : (layout?.canUndo ?? false);

  const metaText = isBracket
    ? `${filled} / ${capacity} слотов`
    : layout
      ? `${filled} / ${capacity} распределено · ${poolLayoutCounts(layout).poolCount} ${poolCountWord(poolLayoutCounts(layout).poolCount)}`
      : "";

  const readOnly = stage.status === "POOL_LAYOUT_STATUS_READY";

  function handleToggleFixation() {
    const nextStatus = readOnly ? "draft" : "ready";
    const onSuccess = () =>
      toastSuccess(nextStatus === "ready" ? "Состав зафиксирован" : "Состав возвращён в черновик");
    if (isBracket) {
      setBracketStatus.mutate(nextStatus, {
        onSuccess,
        onError: (err: Error) => toastError(bracketErrorMessage(err.message)),
      });
    } else {
      setLayoutStatus.mutate(nextStatus, {
        onSuccess,
        onError: (err: Error) => toastError(err.message),
      });
    }
  }

  return (
    <div data-slot="stage-page-screen" className="flex flex-col">
      <PageHeader
        crumb={`НОМИНАЦИИ · ${nomination.title.toUpperCase()} · ЭТАП ${stage.position + 1}`}
        title={stage.title}
        status={<Badge>{stageExecutionStatusLabel(stage.executionStatus)}</Badge>}
        meta={metaText}
        secondary={
          <Button type="button" variant="outline" asChild>
            <Link href={`/admin/nominations/${nomination.id}/stages`}>← Схема номинации</Link>
          </Button>
        }
        action={
          <Button
            type="button"
            variant={readOnly ? "outline" : "default"}
            onClick={handleToggleFixation}
            loading={isBracket ? setBracketStatus.isPending : setLayoutStatus.isPending}
          >
            {readOnly ? "Вернуть в черновик" : "Зафиксировать"}
          </Button>
        }
      />

      <Col gap={4} className="p-4">
        <StageSummaryCards
          stage={stage}
          stages={stages}
          nominationId={nomination.id}
          filled={filled}
          capacity={capacity}
        />

        <StageActions stage={stage} filled={filled} canUndo={canUndo} />

        <Row gap={6} align="start" wrap>
          <div className="min-w-0 flex-1">
            {isBracket ? <BracketSeeding stageId={stageId} /> : <NominationPools stageId={stageId} />}
          </div>
          <div className="w-full shrink-0 lg:w-[320px]">
            <StageRail
              nominationId={nomination.id}
              currentStageId={stageId}
              stages={stages}
              issues={issues}
            />
          </div>
        </Row>
      </Col>
    </div>
  );
}
