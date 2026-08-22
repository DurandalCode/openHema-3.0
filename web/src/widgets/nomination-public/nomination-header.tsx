import Link from "next/link";
import { Badge } from "@/shared/ui/badge";
import { Col, Row } from "@/shared/ui/stack";
import { nominationStatusLabel, type Nomination } from "@/entities/nomination/lib/types";
import type { NominationPosition } from "@/entities/nomination-live/lib/position";

/**
 * NominationHeader — шапка публичной страницы номинации (спека 0035,
 * FR-1/FR-2/FR-3): название, описание (только если задано — пустая строка не
 * рисует пустой абзац), ссылка «На главную», плашка статуса приёма заявок
 * (0012, показывается только когда приём не открыт) и отметка живого
 * положения номинации (`nominationPosition`): «идёт · <этап>» для `running`,
 * «завершена» для `finished`, ничего — для `upcoming` (FR-3 — «не начата» не
 * требует отдельной плашки). Чистый компонент отображения, без хуков.
 */
export function NominationHeader({
  nomination,
  position,
}: {
  nomination: Nomination;
  position: NominationPosition;
}) {
  return (
    <Col gap={2}>
      <Link href="/" className="text-sm text-muted-foreground underline underline-offset-2">
        ← На главную
      </Link>
      <Row align="center" gap={2} className="flex-wrap">
        <h1 className="text-3xl font-semibold tracking-tight">{nomination.title}</h1>
        {nomination.status !== "NOMINATION_STATUS_OPEN" && (
          <Badge variant="secondary">{nominationStatusLabel(nomination.status)}</Badge>
        )}
        {position.phase === "running" && <Badge tone="live">идёт · {position.stageTitle}</Badge>}
        {position.phase === "finished" && <Badge tone="success">завершена</Badge>}
      </Row>
      {nomination.description && <p className="text-muted-foreground">{nomination.description}</p>}
    </Col>
  );
}
