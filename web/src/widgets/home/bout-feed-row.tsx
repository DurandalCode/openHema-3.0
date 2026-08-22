import { boutStateLabel } from "@/entities/pool/lib/types";
import type { LiveFeedBoutDto } from "@/entities/tournament-live/lib/types";
import { boutOutcomeLabel, boutTimeLabel } from "@/entities/tournament-live/lib/feed";

/**
 * BoutFeedRow — одна строка ленты боёв дня (спека 0034, FR-15..FR-18,
 * AC-11..AC-14): время (фактическое, `boutTimeLabel`), площадка, пара,
 * номинация+этап, счёт, состояние, а для завершённого — итог
 * (`boutOutcomeLabel`).
 */
export function BoutFeedRow({ bout }: { bout: LiveFeedBoutDto }) {
  const outcome = boutOutcomeLabel(bout);
  const nominationLabel = [bout.nominationName, bout.stageTitle].filter(Boolean).join(" · ");

  return (
    <tr className="border-b border-border/60 text-sm">
      <td className="py-2 pr-4 whitespace-nowrap font-mono text-xs text-muted-foreground">
        {boutTimeLabel(bout)}
      </td>
      <td className="py-2 pr-4 whitespace-nowrap">{bout.arenaName}</td>
      <td className="py-2 pr-4">
        {bout.fighterA.name} — {bout.fighterB.name}
      </td>
      <td className="py-2 pr-4 text-xs text-muted-foreground">{nominationLabel}</td>
      <td className="py-2 pr-4 whitespace-nowrap font-mono">
        {bout.scoreA}:{bout.scoreB}
      </td>
      <td className="py-2 pr-4 whitespace-nowrap text-xs text-muted-foreground">
        {boutStateLabel(bout.state)}
        {outcome && ` · ${outcome}`}
      </td>
    </tr>
  );
}
