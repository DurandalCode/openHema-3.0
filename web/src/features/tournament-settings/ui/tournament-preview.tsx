import { ExternalLink } from "lucide-react";
import { Col, Row } from "@/shared/ui/stack";
import { TournamentHero } from "@/entities/tournament/ui/tournament-hero";
import type { Tournament } from "@/entities/tournament/lib/types";

/**
 * TournamentPreview — «как это увидит гость» рядом с редактором (spec
 * FR-3…FR-6): рендерит **тот же** `TournamentHero`, что и главная — второй,
 * отдельно свёрстанной версии блока не заводится (расхождение с главной
 * хуже отсутствия превью). `tournament` приходит уже собранным вызывающей
 * стороной через `draftToTournament(saved, draft)` (`entities/tournament/
 * lib/draft.ts`) — сам компонент не знает про черновик и сохранённое
 * состояние, только рендерит переданный турнир (NFR-3: без запросов и
 * задержки).
 */
export function TournamentPreview({ tournament }: { tournament: Tournament }) {
  return (
    <Col gap={3}>
      <Row align="center" justify="between">
        <span className="font-mono text-[10px] uppercase tracking-[.14em] text-caption-foreground">
          Превью главной
        </span>
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="size-3" />
          Открыть главную
        </a>
      </Row>
      <div className="rounded-lg border border-border">
        <TournamentHero tournament={tournament} />
      </div>
    </Col>
  );
}
