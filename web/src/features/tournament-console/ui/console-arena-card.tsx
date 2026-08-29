import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { ForecastTime } from "@/shared/ui/forecast-time";
import { boutScoreLabel } from "@/entities/pool/lib/types";
import { idleLabel, type ConsoleArena } from "@/entities/tournament-console/lib/types";

/**
 * ConsoleArenaCard — карточка площадки пульта (спека 0043, FR-11): что на
 * ней стоит, идущий/следующий бой, темп и прогноз завершения пула, простой.
 * Ссылка ведёт на страницу площадки (`/admin/arenas/[id]`) — пульт сам
 * ничего не ставит и не завершает (FR-13/FR-17).
 */
export function ConsoleArenaCard({ arena, now = new Date() }: { arena: ConsoleArena; now?: Date }) {
  const occupied = arena.idleState === "occupied";

  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <Link href={`/admin/arenas/${arena.arenaId}`} className="hover:underline">
            {arena.arenaName}
          </Link>
          {!occupied && (
            <Badge variant="outline" className="font-normal">
              {idleLabel(arena.idleState, arena.freeSince, now)}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      {occupied && (
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="text-muted-foreground">
            {arena.nominationName} · {arena.poolName}
            {arena.stageTitle && ` · ${arena.stageTitle}`}
          </div>
          {arena.currentBout && (
            <div className="flex items-center justify-between gap-2">
              <span>
                {arena.currentBout.fighterA.name} — {arena.currentBout.fighterB.name}
              </span>
              <span className="font-mono">{boutScoreLabel(arena.currentBout)}</span>
            </div>
          )}
          <div className="text-muted-foreground">
            бой {arena.boutFinished + (arena.currentBout ? 1 : 0)} из {arena.boutTotal}
          </div>
          {arena.poolExpectedFinishAt && (
            <div>
              <span className="text-caption-foreground">завершение пула: </span>
              <ForecastTime
                forecast={{
                  expectedStartAt: arena.poolExpectedFinishAt,
                  boutsAhead: 0,
                  provisional: arena.pace?.provisional ?? false,
                  imminent: false,
                }}
                now={now}
              />
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
