import Link from "next/link";
import { Badge } from "@/shared/ui/badge";
import { Col, Row } from "@/shared/ui/stack";
import type { LiveNominationDto, LiveNominationPhase } from "@/entities/tournament-live/lib/types";

function phaseLabel(phase: LiveNominationPhase): string {
  switch (phase) {
    case "running":
      return "идёт";
    case "finished":
      return "итоги";
    default:
      return "скоро";
  }
}

function phaseTone(phase: LiveNominationPhase): "live" | "neutral" | "info" {
  switch (phase) {
    case "running":
      return "live";
    case "finished":
      return "neutral";
    default:
      return "info";
  }
}

/**
 * NominationsRail — сайдбар «Номинации» (спека 0034, FR-20): строка на
 * номинацию (название, текущий этап, отметка фазы), ссылка на публичную
 * страницу номинации и ссылка на список всех номинаций.
 *
 * `/nominations/{id}` обслуживает номинацию в любой фазе (в т.ч. итоговый
 * протокол доигранной номинации, FR-23) — отдельного URL для «результатов»
 * в кодовой базе нет, второй инкремент публичной номинации (0035) ещё не
 * реализован.
 *
 * `allNominationsHref` — куда ведёт «Все номинации»: в кодовой базе нет
 * отдельного роута `/nominations` (только `/nominations/[id]`) — прокинуто
 * пропом с дефолтом на главную, решает composition (T23).
 */
export function NominationsRail({
  nominations,
  allNominationsHref = "/",
}: {
  nominations: LiveNominationDto[];
  allNominationsHref?: string;
}) {
  if (nominations.length === 0) return null;

  const sorted = [...nominations].sort((a, b) => a.position - b.position);

  return (
    <aside id="nominations-rail" className="w-full scroll-mt-20 px-4 py-8">
      <Col gap={3}>
        <h2 className="text-lg font-semibold tracking-tight">Номинации</h2>
        <Col gap={2}>
          {sorted.map((n) => {
            const caption = [n.currentStageTitle, n.fighterCount > 0 && `${n.fighterCount} бойцов`]
              .filter(Boolean)
              .join(" · ");
            return (
              <Link
                key={n.nominationId}
                href={`/nominations/${n.nominationId}`}
                className="rounded-md border border-border p-3 text-sm hover:border-foreground/40"
              >
                <Row align="center" justify="between" gap={2}>
                  <span className="font-medium">{n.title}</span>
                  <Badge tone={phaseTone(n.phase)}>{phaseLabel(n.phase)}</Badge>
                </Row>
                {caption && <p className="text-xs text-muted-foreground">{caption}</p>}
              </Link>
            );
          })}
        </Col>
        <Link
          href={allNominationsHref}
          className="text-sm underline underline-offset-2 hover:text-foreground"
        >
          Все номинации
        </Link>
      </Col>
    </aside>
  );
}
