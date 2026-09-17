import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { ForecastTime } from "@/shared/ui/forecast-time";
import { Col, Row } from "@/shared/ui/stack";
import type { LiveArenaDto, LiveArenaState } from "@/entities/tournament-live/lib/types";
import { arenaStateLabel, arenaSubtitle } from "@/entities/tournament-live/lib/arena";

function badgeToneFor(state: LiveArenaState): "live" | "warn" | "neutral" {
  switch (state) {
    case "bout_in_progress":
      return "live";
    case "preparing":
      return "warn";
    default:
      return "neutral";
  }
}

/**
 * ArenaCard — карточка одной площадки в блоке «Площадки прямо сейчас»
 * (спека 0034, FR-14, AC-7..AC-9). Три состояния, различаются составом
 * `arena.state`/`arena.currentBout`:
 * - `bout_in_progress`: пара, клубы, текущий счёт, номинация/этап/пул, «бой
 *   N из M» (AC-7);
 * - `preparing`: та же пара (первая непроведённая), без счёта (AC-8);
 * - `free`: без пары/счёта — `arenaSubtitle` уже возвращает "" для free
 *   (AC-9).
 */
export function ArenaCard({ arena }: { arena: LiveArenaDto }) {
  const subtitle = arenaSubtitle(arena);
  const bout = arena.currentBout;

  return (
    <Card>
      <CardHeader>
        <Row align="center" justify="between" gap={2}>
          <CardTitle>{arena.arenaName}</CardTitle>
          <Badge tone={badgeToneFor(arena.state)}>{arenaStateLabel(arena.state)}</Badge>
        </Row>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </CardHeader>
      {bout && (
        <CardContent>
          <Col gap={2} className="text-sm">
            {/* Имя A / счёт / имя B: в один ряд только от `md`. На 360px
                длинные имена с клубом в скобках схлопывались в «столбики по
                букве» (0044 NFR-1). */}
            <Row
              justify="between"
              gap={2}
              data-testid="arena-card-pair"
              className="flex-col items-start md:flex-row md:items-center"
            >
              <span className="font-medium">
                {bout.fighterA.name}
                {bout.fighterA.club && (
                  <span className="text-xs text-muted-foreground"> ({bout.fighterA.club})</span>
                )}
              </span>
              {arena.state === "bout_in_progress" && (
                <span className="font-mono text-base font-semibold">
                  {bout.scoreA}:{bout.scoreB}
                </span>
              )}
              <span className="font-medium">
                {bout.fighterB.name}
                {bout.fighterB.club && (
                  <span className="text-xs text-muted-foreground"> ({bout.fighterB.club})</span>
                )}
              </span>
            </Row>
            <span className="text-xs text-muted-foreground">
              Бой {bout.sequenceNumber} из {bout.poolBoutTotal}
            </span>
            {arena.nextBoutForecast?.expectedStartAt && (
              <span className="text-xs">
                <span className="text-muted-foreground">следующий бой: </span>
                <ForecastTime forecast={arena.nextBoutForecast} />
              </span>
            )}
          </Col>
        </CardContent>
      )}
    </Card>
  );
}
