import { Button } from "@/shared/ui/button";
import { Col, Row } from "@/shared/ui/stack";
import type { ContactJson } from "@/entities/tournament/lib/types";
import { contactHref, contactLabel } from "@/entities/tournament/lib/format";

/**
 * AboutOrganizers — блок «Организаторы» экрана «О турнире» (спека 0038,
 * T13, FR-46): главный судья и контакты организаторов **одним** блоком.
 *
 * Решение: не переиспользует готовый `widgets/home/venue-contacts.tsx` как
 * компонент — тот рендерит собственную `<section>` с собственным
 * заголовком («Контакты организаторов»/«Зрителю») и не знает о главном
 * судье, а FR-46 требует ровно один блок «Организаторы» с обоими фактами
 * внутри; обернуть `VenueContacts` во внешний блок означало бы вложенные
 * заголовки или проп для скрытия заголовка ради одного места использования.
 * Вместо этого верстка контактов написана заново, но **не дублирует
 * логику форматирования** — `contactHref`/`contactLabel` те же функции
 * `entities/tournament/lib/format.ts`, что использует и `VenueContacts`, и
 * `TournamentHero`.
 *
 * Пустое поле не рендерится (правило 0001): главный судья — если `""`,
 * контакты — если ни одного заполненного значения; блок целиком скрывается,
 * если пусты оба факта.
 */
export function AboutOrganizers({
  chiefJudge,
  contacts,
}: {
  chiefJudge: string;
  contacts: ContactJson[];
}) {
  const filledContacts = contacts.filter((c) => c.value);
  if (!chiefJudge && filledContacts.length === 0) return null;

  return (
    <Col gap={3}>
      <h3 className="text-sm font-semibold text-muted-foreground">Организаторы</h3>
      {chiefJudge && (
        <p className="text-sm">
          Главный судья: <span className="font-medium">{chiefJudge}</span>
        </p>
      )}
      {filledContacts.length > 0 && (
        <Row gap={3} wrap>
          {filledContacts.map((c, i) => (
            <Button key={c.id ?? i} variant="outline" size="sm" asChild>
              <a href={contactHref(c.type, c.value)} target="_blank" rel="noopener noreferrer">
                {contactLabel(c.type)}: {c.value}
              </a>
            </Button>
          ))}
        </Row>
      )}
    </Col>
  );
}
