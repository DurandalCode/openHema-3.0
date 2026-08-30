import Link from "next/link";
import { formatRelativeTime } from "@/shared/lib/datetime";
import type { ConsoleAlert, ConsoleAlertKind } from "@/entities/tournament-console/lib/types";

const KIND_LABEL: Record<ConsoleAlertKind, string> = {
  arena_idle: "Площадка простаивает",
  bout_stuck: "Бой не завершён вовремя",
  pool_not_started: "Пул стоит, но не начат",
  pool_done_not_unseated: "Пул доигран, площадка занята впустую",
  next_stage_not_built: "Следующий этап не сформирован",
  nomination_stalled: "Номинация не двинулась",
};

const ARENA_KINDS: ConsoleAlertKind[] = [
  "arena_idle",
  "bout_stuck",
  "pool_not_started",
  "pool_done_not_unseated",
];

/**
 * alertHref — переход на экран, где сигнал чинится (спека 0043,
 * FR-13/FR-17): площадочные виды — на страницу площадки, номинационные —
 * на схему этапов номинации.
 */
function alertHref(alert: ConsoleAlert): string {
  if (ARENA_KINDS.includes(alert.kind)) return `/admin/arenas/${alert.arenaId}`;
  return `/admin/nominations/${alert.nominationId}/stages`;
}

/** alertContext — объект сигнала («Ристалище 1», «Длинный меч · Пул A»). */
function alertContext(alert: ConsoleAlert): string {
  if (ARENA_KINDS.includes(alert.kind)) {
    return alert.poolName ? `${alert.arenaName} · ${alert.poolName}` : alert.arenaName;
  }
  return alert.nominationName;
}

/** AlertRow — одна запись ленты «требует внимания» (спека 0043, FR-14/FR-15). */
export function AlertRow({ alert, now = new Date() }: { alert: ConsoleAlert; now?: Date }) {
  return (
    <Link
      href={alertHref(alert)}
      className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm hover:bg-destructive/10"
    >
      <span className="min-w-0 break-words">
        <span className="font-medium">{KIND_LABEL[alert.kind]}</span>
        <span className="ml-2 text-caption-foreground">{alertContext(alert)}</span>
      </span>
      <span className="shrink-0 text-caption-foreground">{formatRelativeTime(alert.since, now)}</span>
    </Link>
  );
}
