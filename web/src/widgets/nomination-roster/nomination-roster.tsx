import { CheckCircle2 } from "lucide-react";
import { Col, Row } from "@/shared/ui/stack";
import type { RosterEntry } from "@/entities/fighter/lib/types";

/**
 * NominationRoster — публичный состав номинации (бойцы): имя, клуб, статус
 * (в составе/выбыл). Отдельно от воронки заявок (widgets/nominations-list) —
 * спека 0007, п.5: показывать заявки или бойцов решает UX, не домен.
 * Пустой список — валидное состояние (ростер начинается после регистрации).
 */
export function NominationRoster({ entries }: { entries: RosterEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <Col gap={1}>
      {entries.map((e, i) => (
        <Row key={i} align="center" gap={2}>
          {e.inRoster ? (
            <CheckCircle2 className="size-3.5 text-primary" />
          ) : (
            <span className="size-3.5" />
          )}
          <span className={e.inRoster ? undefined : "text-muted-foreground line-through"}>
            {e.name}
          </span>
          {e.club && <span className="text-xs text-muted-foreground">({e.club})</span>}
          {!e.inRoster && <span className="text-xs text-muted-foreground">выбыл</span>}
        </Row>
      ))}
    </Col>
  );
}
