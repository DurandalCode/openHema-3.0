import { Badge } from "@/shared/ui/badge";
import { Row } from "@/shared/ui/stack";
import { schemaIssueCounts } from "@/entities/stage/lib/issues";
import type { SchemaIssue } from "@/entities/stage/lib/types";

/**
 * SchemaDiagnostics — строка состояния схемы над холстом (спека 0031, FR-6,
 * AC-4): «Схема корректна», когда `schemaIssueCounts` даёт нули по всем
 * классам, иначе — по счётчику на каждый встретившийся класс («Ошибки · N»,
 * «Предупреждения · M», «Информация · K»). Заменяет плашечный
 * `SchemaIssuesSummary` старого виджета (по бейджу на *проблему*, не на
 * класс) — здесь ровно один элемент на класс, текст и привязка проблем к
 * этапам остаются на карточках (FR-7, `stage-card.tsx`).
 */
export function SchemaDiagnostics({ issues }: { issues: SchemaIssue[] }) {
  const counts = schemaIssueCounts(issues);
  const total = counts.error + counts.warning + counts.info;

  if (total === 0) {
    return (
      <Row align="center" gap={2} data-testid="schema-diagnostics">
        <Badge tone="success">Схема корректна</Badge>
      </Row>
    );
  }

  return (
    <Row align="center" gap={2} className="flex-wrap" data-testid="schema-diagnostics">
      {counts.error > 0 && <Badge tone="danger">Ошибки · {counts.error}</Badge>}
      {counts.warning > 0 && <Badge tone="warn">Предупреждения · {counts.warning}</Badge>}
      {counts.info > 0 && <Badge tone="info">Информация · {counts.info}</Badge>}
    </Row>
  );
}
