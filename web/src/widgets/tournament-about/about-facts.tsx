import { Card } from "@/shared/ui/card";
import type { Tournament } from "@/entities/tournament/lib/types";
import { formatEntryFee, formatEventRange, venueLine } from "@/entities/tournament/lib/format";

/**
 * AboutFacts — плитки «когда / где / номинаций / взнос» экрана «О турнире»
 * (спека 0038, T13, FR-43): та же структура stat-tile, что и `Card` с
 * `eyebrow`/`title`/`value` уже использует остальной проект (карточки
 * настроек, живая сводка). Каждая плитка — независимое опциональное поле
 * (правило 0001, FR-44): «когда» скрывается без обеих дат, «где» — без
 * названия и адреса площадки одновременно, «взнос» — при `entryFeeMinor
 * === null` (см. `formatEntryFee`). «Номинаций» показывается всегда, даже
 * при нуле — это не поле профиля турнира, а факт о переданном списке
 * номинаций, скрывать который не за что.
 */
export function AboutFacts({
  tournament,
  nominationsCount,
}: {
  tournament: Tournament;
  nominationsCount: number;
}) {
  const eventRange = formatEventRange(tournament.eventStartAt, tournament.eventEndAt);
  const venue = venueLine(tournament);
  const fee = formatEntryFee(tournament.entryFeeMinor, tournament.entryFeeCurrency);

  return (
    <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {eventRange && <Card eyebrow="Когда" title={eventRange} />}
      {venue && <Card eyebrow="Где" title={venue} />}
      <Card eyebrow="Номинаций" title={String(nominationsCount)} />
      {fee !== null && <Card eyebrow="Взнос" title={fee} />}
    </div>
  );
}
