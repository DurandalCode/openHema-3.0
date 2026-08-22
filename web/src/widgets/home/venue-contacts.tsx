import { Button } from "@/shared/ui/button";
import { Col, Row } from "@/shared/ui/stack";
import type { ContactJson } from "@/entities/tournament/lib/types";
import { contactHref, contactLabel } from "@/entities/tournament/lib/format";

/**
 * VenueContacts — контакты организаторов из профиля турнира (спека 0034,
 * FR-10 «до старта» / FR-22 «Зрителю»). Один компонент для обеих фаз — оба
 * FR описывают один и тот же набор данных (`Tournament.contacts`), только
 * заголовок блока меняется по контексту вызывающего экрана (`title` проп).
 * Пустые контакты отфильтрованы, блок не рендерится вовсе без ни одного
 * заполненного контакта (правило 0001, как в `TournamentHero`).
 */
export function VenueContacts({
  contacts,
  title = "Контакты организаторов",
}: {
  contacts: ContactJson[];
  title?: string;
}) {
  const filled = contacts.filter((c) => c.value);
  if (filled.length === 0) return null;

  return (
    <section id="venue-contacts" className="mx-auto w-full max-w-6xl px-4 py-8">
      <Col gap={3}>
        <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
        <Row gap={3} wrap>
          {filled.map((c, i) => (
            <Button key={c.id ?? i} variant="outline" size="sm" asChild>
              <a href={contactHref(c.type, c.value)} target="_blank" rel="noopener noreferrer">
                {contactLabel(c.type)}: {c.value}
              </a>
            </Button>
          ))}
        </Row>
      </Col>
    </section>
  );
}
