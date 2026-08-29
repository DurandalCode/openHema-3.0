import Link from "next/link";
import { ForecastTime } from "@/shared/ui/forecast-time";
import type { ConsoleNomination } from "@/entities/tournament-console/lib/types";
import type { LiveNominationPhase } from "@/entities/tournament-live/lib/types";

const PHASE_LABEL: Record<LiveNominationPhase, string> = {
  upcoming: "скоро",
  running: "идёт",
  finished: "итоги",
};

/**
 * ConsoleNominationRow — строка номинации пульта (спека 0043, FR-12):
 * фаза, текущий этап, прогресс боёв (поставленные пулы), остаток
 * непоставленных числом без времени (горизонт оценки, FR-9). Ссылка ведёт
 * на схему этапов номинации.
 */
export function ConsoleNominationRow({
  nomination,
  now = new Date(),
}: {
  nomination: ConsoleNomination;
  now?: Date;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b py-2 text-sm last:border-b-0">
      <div className="min-w-0 flex-1">
        <Link href={`/admin/nominations/${nomination.nominationId}/stages`} className="font-medium hover:underline">
          {nomination.title}
        </Link>
        <span className="ml-2 text-caption-foreground">{PHASE_LABEL[nomination.phase]}</span>
        {nomination.currentStageTitle && (
          <span className="ml-2 text-caption-foreground">· {nomination.currentStageTitle}</span>
        )}
      </div>
      <div className="text-caption-foreground">
        {nomination.boutFinished} из {nomination.boutTotal}
        {nomination.boutRemainingUnseated > 0 && ` (+${nomination.boutRemainingUnseated} не поставлено)`}
      </div>
      {nomination.expectedFinishAt && (
        <ForecastTime
          forecast={{
            expectedStartAt: nomination.expectedFinishAt,
            boutsAhead: 0,
            provisional: nomination.provisional,
            imminent: false,
          }}
          now={now}
        />
      )}
    </div>
  );
}
