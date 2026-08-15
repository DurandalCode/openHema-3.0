/**
 * schemaIssueCounts — счётчики проблем схемы по классу (спека 0031, FR-6):
 * строка диагностики над холстом показывает по счётчику на встретившийся
 * класс, а не бейджи `SchemaIssuesSummary` (старый виджет, удаляется). Не
 * дублирует `schemaErrorCount` (0028, `labels.ts`) — та считает только
 * `error` для колонки списка номинаций и не трогается.
 */

import type { SchemaIssue } from "./types";

export type SchemaIssueCounts = { error: number; warning: number; info: number };

export function schemaIssueCounts(issues: SchemaIssue[]): SchemaIssueCounts {
  const counts: SchemaIssueCounts = { error: 0, warning: 0, info: 0 };
  for (const issue of issues) {
    if (issue.severity === "SCHEMA_ISSUE_SEVERITY_ERROR") counts.error++;
    else if (issue.severity === "SCHEMA_ISSUE_SEVERITY_WARNING") counts.warning++;
    else if (issue.severity === "SCHEMA_ISSUE_SEVERITY_INFO") counts.info++;
  }
  return counts;
}
