/**
 * ForecastTime — единственное место, где прогноз (спека 0043, ADR 0020)
 * рендерится в интерфейс: «ориентировочно 11:20 · через ~14 минут» либо
 * «вот-вот» (AC-4), с пометкой «предварительно», когда оценка идёт по
 * резерву каскада (ADR 0020, п.4). Ничего не рендерит, если прогноза нет
 * (`expectedStartAt === null`) — горизонт оценки, FR-9/FR-24: отсутствие
 * прогноза не ошибка, вызывающий экран сам решает, что показать вместо
 * него (прочерк, очередь без времени).
 */

import { Badge } from "./badge";
import { type ForecastDto, formatForecastSummary } from "@/shared/lib/forecast-time";

export type ForecastTimeProps = {
  forecast: ForecastDto | null;
  now?: Date;
  className?: string;
};

export function ForecastTime({ forecast, now, className }: ForecastTimeProps) {
  if (!forecast || !forecast.expectedStartAt) return null;

  const summary = formatForecastSummary(forecast.expectedStartAt, forecast.imminent, now);

  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ""}`.trim()}>
      <span className="text-muted-foreground">{summary}</span>
      {forecast.provisional && (
        <Badge variant="outline" className="text-[11px]">
          предварительно
        </Badge>
      )}
    </span>
  );
}
