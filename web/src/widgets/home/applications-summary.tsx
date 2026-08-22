import { Users } from "lucide-react";
import { Card } from "@/shared/ui/card";
import { Row } from "@/shared/ui/stack";
import type { ApplicationsSummary } from "@/entities/application/lib/summary";

/**
 * ApplicationsSummarySection — сводка приёма заявок по турниру целиком
 * (спека 0034, FR-5, AC-3/AC-4-style «нечего суммировать»). Три плитки:
 * заявлено / подтверждено / мест всего (последняя — только если у турнира
 * есть номинация с заданной вместимостью).
 *
 * Не рендерится вовсе, если совсем нечего показать: ни заявок, ни
 * вместимости ни у одной номинации (FR-5) — тот же кейс, для которого
 * `applicationsSummary` возвращает `{ applied: 0, confirmed: 0, capacity:
 * null }`.
 */
export function ApplicationsSummarySection({ summary }: { summary: ApplicationsSummary }) {
  if (summary.applied === 0 && summary.confirmed === 0 && summary.capacity === null) {
    return null;
  }

  return (
    <section
      id="applications-summary"
      className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-8"
    >
      <Row gap={4} wrap justify="center">
        <Card
          eyebrow={
            <span className="inline-flex items-center gap-1">
              <Users className="size-3" />
              Заявлено
            </span>
          }
          value={summary.applied}
          className="min-w-[160px] flex-1"
        />
        <Card eyebrow="Подтверждено" value={summary.confirmed} className="min-w-[160px] flex-1" />
        {summary.capacity !== null && (
          <Card eyebrow="Мест всего" value={summary.capacity} className="min-w-[160px] flex-1" />
        )}
      </Row>
    </section>
  );
}
