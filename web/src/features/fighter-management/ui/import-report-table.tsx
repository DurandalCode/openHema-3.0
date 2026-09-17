"use client";

import { useMemo } from "react";
import { EmptyState } from "@/shared/ui/empty-state";
import { TableHead, type TableHeadCol } from "@/shared/ui/table-head";
import { TableRow, type TableRowCellTone } from "@/shared/ui/table-row";
import { TableScroll } from "@/shared/ui/table-scroll";
import { importOutcomeLabel, importRowErrorLabel } from "@/entities/fighter/lib/labels";
import type { ImportRowOutcome, ImportRowReport } from "@/entities/fighter/lib/types";
import type { Nomination } from "@/entities/nomination/lib/types";

const COLUMNS: TableHeadCol[] = [
  { label: "Строка", width: 80 },
  { label: "Боец" },
  { label: "Клуб", width: 180 },
  { label: "Номинации" },
  { label: "Исход", width: 140 },
  { label: "Причина", width: 240 },
];

const DASH = "—";

const outcomeTone: Record<ImportRowOutcome, TableRowCellTone> = {
  IMPORT_ROW_OUTCOME_UNSPECIFIED: "muted",
  IMPORT_ROW_OUTCOME_CREATED: "green",
  IMPORT_ROW_OUTCOME_UPDATED: "accent",
  IMPORT_ROW_OUTCOME_SKIPPED: "muted",
  IMPORT_ROW_OUTCOME_REJECTED: "red",
};

/**
 * ImportReportTable — таблица строк файла (спека 0049): одна и та же и для
 * предпросмотра (`dryRun`), и для отчёта после записи — форма отчёта у них
 * общая (FR-3/FR-10), различаются только сводка и кнопки диалога.
 *
 * Колонка «Строка» — номер строки в файле, как его видит admin в редакторе
 * (FR-11a): по нему отчёт прикладывается к файлу и правятся отклонённые
 * строки.
 *
 * Колонка «Номинации» показывает то, что записано в файле; если колонка в
 * файле была пуста и сработало умолчание из диалога (FR-5a), показываются
 * названия фактически добавленных участий — иначе строка выглядела бы
 * «без номинаций», хотя участия появятся.
 */
export function ImportReportTable({
  rows,
  nominations,
}: {
  rows: ImportRowReport[];
  nominations: Nomination[];
}) {
  const titleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of nominations) map.set(n.id, n.title);
    return map;
  }, [nominations]);

  function nominationsText(row: ImportRowReport): string {
    if (row.nominationTitles.length > 0) return row.nominationTitles.join(", ");
    const added = row.addedNominationIds.map((id) => titleById.get(id) ?? id);
    return added.length > 0 ? added.join(", ") : DASH;
  }

  if (rows.length === 0) {
    return (
      <div data-slot="import-report-table" className="overflow-hidden rounded-lg border border-border">
        <TableHead cols={COLUMNS} />
        <EmptyState
          title="В файле нет строк"
          hint="Проверьте, что под строкой заголовка есть данные."
        />
      </div>
    );
  }

  return (
    <div data-slot="import-report-table" className="overflow-hidden rounded-lg border border-border">
      <TableScroll>
        <div className="min-w-[880px]">
          <TableHead cols={COLUMNS} />
          {rows.map((row) => (
            <TableRow
              key={row.line}
              cells={[
                { text: String(row.line), width: 80, mono: true, tone: "muted" },
                { text: row.name || DASH, tone: "strong" },
                { text: row.club || DASH, width: 180, tone: "body" },
                { text: nominationsText(row), tone: "body" },
                { text: importOutcomeLabel(row.outcome), width: 140, tone: outcomeTone[row.outcome] },
                {
                  text: importRowErrorLabel(row.error, row.errorDetail) ?? DASH,
                  width: 240,
                  tone: row.error === "IMPORT_ROW_ERROR_UNSPECIFIED" ? "muted" : "red",
                },
              ]}
            />
          ))}
        </div>
      </TableScroll>
    </div>
  );
}
