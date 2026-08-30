import { Badge } from "@/shared/ui/badge";
import { ForecastTime } from "@/shared/ui/forecast-time";
import { Col, Row } from "@/shared/ui/stack";
import { cn } from "@/shared/lib/cn";
import { boutScoreLabel, boutStateLabel, outcomeOf } from "@/entities/pool/lib/types";
import type { BoardBout } from "@/entities/pool/lib/types";

/**
 * outcomeLabel — исход завершённого боя (спека 0013, FR-3; спека 0035,
 * FR-14) как текст: имя победителя либо «ничья».
 */
function outcomeLabel(bout: BoardBout): string {
  const outcome = outcomeOf(bout.scoreA, bout.scoreB);
  if (outcome === "draw") return "ничья";
  return outcome === "A" ? bout.fighterA.name : bout.fighterB.name;
}

/**
 * BoutRow — строка одного боя пула на публичной странице номинации (спека
 * 0035, FR-13/FR-14): номер по порядку, пара бойцов, счёт (`boutScoreLabel`
 * — прочерк у не начатого боя, AC-9), состояние боя и, для завершённого боя,
 * исход (AC-11). Текущий бой группы выделяется (AC-10). Извлечено из
 * инлайновой строки `widgets/nomination-pools-public/nomination-pools-public.tsx`
 * в самостоятельный переиспользуемый компонент.
 */
export function BoutRow({ bout, isCurrent }: { bout: BoardBout; isCurrent: boolean }) {
  const finished = bout.state === "BOUT_STATE_FINISHED";
  return (
    <Col
      gap={1}
      className={cn("rounded-md px-1.5 py-1", isCurrent && "outline outline-2 outline-primary")}
      data-current={isCurrent || undefined}
    >
      <Row align="center" justify="between" gap={2} className="flex-wrap">
        <span className="text-sm">
          {bout.sequenceNumber}. {bout.fighterA.name} — {bout.fighterB.name}
        </span>
        <Row align="center" gap={2}>
          <span className="text-sm font-medium tabular-nums">{boutScoreLabel(bout)}</span>
          <Badge variant={isCurrent ? "default" : "outline"}>{boutStateLabel(bout.state)}</Badge>
        </Row>
      </Row>
      {finished && (
        <span className="text-xs text-muted-foreground">Исход: {outcomeLabel(bout)}</span>
      )}
      {bout.state === "BOUT_STATE_NOT_STARTED" && bout.forecast?.expectedStartAt && (
        <span className="text-xs">
          <ForecastTime forecast={bout.forecast} />
        </span>
      )}
    </Col>
  );
}
