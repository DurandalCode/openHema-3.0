import { Col } from "@/shared/ui/stack";
import { stageConfigLabel } from "@/entities/stage/lib/labels";
import { waitingHint } from "@/entities/stage/lib/schema-chain";
import type { Stage } from "@/entities/stage/lib/types";
import type { LivePoolDto } from "@/entities/nomination-live/lib/types";
import type { Bracket } from "@/entities/bracket/lib/types";
import { PoolCard } from "@/widgets/nomination-public/pool-card";
import { StagePromise } from "@/widgets/nomination-public/stage-promise";
import { BracketView } from "@/widgets/bracket-view/bracket-view";

/**
 * StageSection — секция одного этапа номинации (спека 0035, FR-15/FR-21):
 * групповой этап с уже сформированными пулами — заголовок этапа и сетка
 * карточек групп (`PoolCard`); этап-сетка с готовым брекетом — заголовок и
 * `BracketView` (тот же read-only виджет, что у организатора). Этап, для
 * которого в снапшоте ещё нет ни пулов, ни сетки (AC-4), — блок-обещание
 * `StagePromise` вместо заголовка с пустым содержимым: подпись самого
 * блока уже несёт название этапа, второй заголовок был бы дублем.
 */
export function StageSection({
  stage,
  stages,
  pools,
  bracket,
}: {
  stage: Stage;
  stages: Stage[];
  pools: LivePoolDto[];
  bracket: Bracket | null;
}) {
  if (stage.type === "STAGE_TYPE_GROUPS" && pools.length === 0) {
    return (
      <StagePromise
        title={stage.title}
        configLabel={stageConfigLabel(stage)}
        waitingHint={waitingHint(stage, stages)}
      />
    );
  }

  if (stage.type === "STAGE_TYPE_BRACKET" && !bracket) {
    return (
      <StagePromise
        title={stage.title}
        configLabel={stageConfigLabel(stage)}
        waitingHint={waitingHint(stage, stages)}
      />
    );
  }

  return (
    <Col gap={3}>
      <h2 className="text-sm font-medium text-muted-foreground">{stage.title}</h2>
      {stage.type === "STAGE_TYPE_GROUPS" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pools.map((livePool) => (
            <PoolCard key={livePool.pool.id} livePool={livePool} />
          ))}
        </div>
      )}
      {stage.type === "STAGE_TYPE_BRACKET" && bracket && <BracketView bracket={bracket} />}
    </Col>
  );
}
