import Link from "next/link";
import { minuteWord } from "@/shared/lib/datetime";
import type { ConsoleQueueItem } from "@/entities/tournament-console/lib/types";

/** queueEstimateLabel — «~7 минут» из секунд (спека 0043, FR-13). */
function queueEstimateLabel(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `~${minutes} ${minuteWord(minutes)}`;
}

/**
 * ConsoleQueueList — очередь готовых к постановке пулов (спека 0043,
 * FR-13): пулы READY, ни на одной площадке. Ссылка ведёт на список
 * площадок — саму постановку выполняет оператор там (пульт read-only,
 * FR-17).
 */
export function ConsoleQueueList({ items }: { items: ConsoleQueueItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-caption-foreground">Очередь пуста.</p>;
  }
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => (
        <li key={item.poolId} className="flex items-center justify-between gap-2 text-sm">
          <Link href="/admin/arenas" className="hover:underline">
            {item.nominationName} · {item.poolName}
            {item.stageTitle && ` · ${item.stageTitle}`}
          </Link>
          <span className="text-caption-foreground">
            {item.boutCount} боёв · {queueEstimateLabel(item.estimatedSeconds)}
          </span>
        </li>
      ))}
    </ul>
  );
}
