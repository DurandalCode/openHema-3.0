import Link from "next/link";
import { Badge } from "@/shared/ui/badge";
import { Col, Row } from "@/shared/ui/stack";
import type { Tournament } from "@/entities/tournament/lib/types";
import { formatEventRange } from "@/entities/tournament/lib/format";
import { TournamentProgram } from "@/entities/tournament/ui/tournament-program";
import type { TournamentLiveSnapshotDto } from "@/entities/tournament-live/lib/types";
import {
  arenasBusy,
  arenasTotal,
  boutsDone,
  boutsTotal,
  tournamentDayNumber,
} from "@/entities/tournament-live/lib/counters";

/**
 * TournamentStrip — сжатая афиша турнира в фазах «идёт»/«завершён» (спека
 * 0034, FR-12/FR-13, AC-18): название, даты, отметка «день N · идёт» (или
 * «Турнир завершён»), ссылка на подробности. Счётчик занятых площадок
 * показывается только пока турнир идёт — в `finished` площадки уже не
 * актуальны (FR-23); счётчик боёв остаётся как итоговый.
 *
 * `detailsHref` — куда ведёт «о турнире»: не зафиксировано ни спекой, ни
 * планом (полная афиша `TournamentHero` не рендерится рядом с этим виджетом
 * в фазах «идёт»/«завершён» — FR-12 говорит именно «сжимается», а не
 * «остаётся на странице»), поэтому это проп с дефолтом, а не жёстко
 * зашитый якорь — решает композиция `widgets/home/home-screen.tsx` (T23).
 */
export function TournamentStrip({
  tournament,
  snapshot,
  phase,
  now,
  detailsHref = "#tournament",
}: {
  tournament: Tournament;
  snapshot: TournamentLiveSnapshotDto;
  phase: "running" | "finished";
  now: Date;
  detailsHref?: string;
}) {
  const eventRange = formatEventRange(tournament.eventStartAt, tournament.eventEndAt);
  const day = tournamentDayNumber(tournament.eventStartAt || null, now);
  const statusLabel =
    phase === "finished" ? "Турнир завершён" : day !== null ? `День ${day} · идёт` : "Идёт";

  return (
    <section
      id="tournament-strip"
      className="border-b border-border/60 bg-surface-raised"
    >
      <Row
        align="center"
        justify="between"
        wrap
        gap={4}
        className="mx-auto w-full max-w-6xl px-4 py-3"
      >
        <Col gap={1}>
          <Row align="center" gap={3} wrap>
            <span className="text-lg font-semibold tracking-tight">{tournament.title}</span>
            <Badge tone={phase === "finished" ? "neutral" : "live"}>{statusLabel}</Badge>
          </Row>
          {eventRange && <span className="text-xs text-muted-foreground">{eventRange}</span>}
        </Col>

        <Row align="center" gap={4} wrap className="text-sm text-muted-foreground">
          <span>
            Боёв {boutsDone(snapshot.bouts)} из {boutsTotal(snapshot.bouts)}
          </span>
          {phase === "running" && (
            <span>
              Площадок занято {arenasBusy(snapshot.arenas)} из {arenasTotal(snapshot.arenas)}
            </span>
          )}
          <Link href={detailsHref} className="underline underline-offset-2 hover:text-foreground">
            О турнире
          </Link>
        </Row>
      </Row>

      {tournament.program.length > 0 && (
        <div className="mx-auto w-full max-w-6xl px-4 pb-3">
          <TournamentProgram program={tournament.program} title="Программа" />
        </div>
      )}
    </section>
  );
}
