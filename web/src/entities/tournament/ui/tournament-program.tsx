import { Col, Row } from "@/shared/ui/stack";
import type { TournamentProgramDay } from "../lib/types";
import { formatProgramDate } from "../lib/format";

/**
 * TournamentProgram — программа турнира по дням (спека 0040, FR-14/FR-15):
 * список дней, внутри каждого — упорядоченные пункты «время + текст».
 * Пустая программа — компонент не рендерит ничего (FR-16, правило 0001),
 * тот же приём, что `RegulationsLink`/`VenueContacts` для своих опциональных
 * полей.
 *
 * На уровне `entities`, а не `widgets` — переиспользуется и афишей главной
 * (`entities/tournament/ui/tournament-hero.tsx`, `widgets/home/
 * tournament-strip.tsx`), и страницей `/about`
 * (`widgets/tournament-about/tournament-about-screen.tsx`): `entities` не
 * может импортировать `widgets` (FSD), а расхождение верстки между двумя
 * местами показа хуже общего компонента (тот же принцип, что уже привёл
 * `RegulationsLink` на этот уровень, спека 0039 T2).
 */
export function TournamentProgram({
  program,
  title = "Программа турнира",
}: {
  program: TournamentProgramDay[];
  title?: string;
}) {
  if (program.length === 0) return null;

  return (
    <section id="tournament-program" className="w-full">
      <Col gap={3}>
        <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
        <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {program.map((day, dayIdx) => (
            <Col
              key={day.date || dayIdx}
              gap={2}
              className="rounded-lg border border-border p-3"
            >
              {day.date && (
                <span className="text-sm font-medium">{formatProgramDate(day.date)}</span>
              )}
              <Col gap={1}>
                {day.items.map((item, itemIdx) => (
                  <Row
                    key={itemIdx}
                    gap={2}
                    data-testid="tournament-program-item"
                    className="text-sm text-muted-foreground"
                  >
                    {item.timeLabel && (
                      <span className="shrink-0 font-mono text-xs text-foreground">
                        {item.timeLabel}
                      </span>
                    )}
                    <span>{item.text}</span>
                  </Row>
                ))}
              </Col>
            </Col>
          ))}
        </div>
      </Col>
    </section>
  );
}
