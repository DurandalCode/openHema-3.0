import { Badge } from "@/shared/ui/badge";
import { Card, CardContent } from "@/shared/ui/card";
import { ForecastTime } from "@/shared/ui/forecast-time";
import { Col, Row } from "@/shared/ui/stack";
import { boutsUntil, nextBout } from "@/entities/tournament-live/lib/my-view";
import type { LiveFeedBoutDto } from "@/entities/tournament-live/lib/types";

/** opponentOf — соперник бойца в бою (по стороне, на которой боец НЕ стоит). */
function opponentOf(bout: LiveFeedBoutDto, fighterId: string) {
  return bout.fighterA.fighterId === fighterId ? bout.fighterB : bout.fighterA;
}

function myScoreLine(bout: LiveFeedBoutDto, fighterId: string): string {
  const iAmA = bout.fighterA.fighterId === fighterId;
  return iAmA ? `${bout.scoreA}:${bout.scoreB}` : `${bout.scoreB}:${bout.scoreA}`;
}

/**
 * NextBoutCard — «Ваш следующий бой» кабинета (спека 0038, FR-33/FR-34;
 * спека 0043, FR-23): идущий бой бойца — с текущим счётом; иначе ближайший
 * не начатый — с очередью боёв до него (`boutsUntil`, не тронуто) плюс
 * ориентировочное время и обратный отсчёт, когда пул уже поставлен на
 * площадку (`bout.forecast`, AC-6); если пул ещё не поставлен —
 * объяснение вместо времени (AC-5, горизонт оценки — FR-9). `null`, если у
 * бойца нет боёв в снапшоте вовсе (FR-37/FR-32 решают вызывающая сторона и
 * `my-nominations`, этот компонент просто ничего не рендерит).
 */
export function NextBoutCard({
  bouts,
  fighterId,
}: {
  bouts: LiveFeedBoutDto[];
  fighterId: string;
}) {
  const bout = nextBout(bouts, fighterId);
  if (!bout) return null;

  const opponent = opponentOf(bout, fighterId);
  const inProgress = bout.state === "BOUT_STATE_IN_PROGRESS";
  const until = boutsUntil(bouts, bout);

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="pt-6">
        <Col gap={2}>
          <Row align="center" gap={2}>
            {inProgress && <Badge tone="live">Идёт сейчас</Badge>}
            <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
              {inProgress ? "Ваш бой" : "Ваш следующий бой"}
            </span>
          </Row>
          <span className="text-lg font-bold">Вы — {opponent.name}</span>
          <span className="text-sm text-muted-foreground">
            {bout.nominationName}
            {bout.poolName && ` · ${bout.poolName}`}
            {bout.arenaName && ` · ${bout.arenaName}`}
          </span>
          {inProgress ? (
            <span className="font-mono text-2xl font-bold">{myScoreLine(bout, fighterId)}</span>
          ) : (
            <Col gap={1}>
              <span className="text-sm text-muted-foreground">
                {until === 0 ? "вы следующие" : `через ${until} ${boutsWord(until)}`}
              </span>
              {bout.forecast?.expectedStartAt ? (
                <ForecastTime forecast={bout.forecast} className="text-sm" />
              ) : (
                <span className="text-xs text-muted-foreground">
                  пул ещё не поставлен на площадку
                </span>
              )}
            </Col>
          )}
        </Col>
      </CardContent>
    </Card>
  );
}

function boutsWord(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "боёв";
  const mod10 = n % 10;
  if (mod10 === 1) return "бой";
  if (mod10 >= 2 && mod10 <= 4) return "боя";
  return "боёв";
}
