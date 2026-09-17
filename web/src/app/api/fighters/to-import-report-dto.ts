import { toJson } from "@bufbuild/protobuf";
import {
  ImportFightersResponseSchema,
  type ImportFightersResponse,
} from "@/gen/hema/v1/fighter_pb";
import type {
  ImportReport,
  ImportRowError,
  ImportRowOutcome,
  ImportRowReport,
  ImportSummary,
} from "@/entities/fighter/lib/types";

const EMPTY_SUMMARY: ImportSummary = {
  rowsRead: 0,
  created: 0,
  updated: 0,
  skipped: 0,
  rejected: 0,
};

/**
 * toImportReportDto — proto-отчёт импорта (`ImportFightersResponse`, спека
 * 0049) → JSON-DTO для браузера, рядом с `to-fighter-dto.ts`.
 *
 * Идёт через настоящий `toJson` (как `fighterToJson`): enum'ы приезжают
 * строковыми литералами (`IMPORT_ROW_OUTCOME_CREATED`), а proto3 опускает
 * дефолты — поэтому каждое поле схлопывается здесь в явный ноль/пустую
 * строку/пустой массив, и UI не разбирается с `undefined`.
 */
export function toImportReportDto(res: ImportFightersResponse): ImportReport {
  const raw = toJson(ImportFightersResponseSchema, res) as {
    summary?: Partial<ImportSummary>;
    rows?: Partial<ImportRowReport>[];
    dryRun?: boolean;
  };

  return {
    dryRun: raw.dryRun ?? false,
    summary: raw.summary
      ? {
          rowsRead: raw.summary.rowsRead ?? 0,
          created: raw.summary.created ?? 0,
          updated: raw.summary.updated ?? 0,
          skipped: raw.summary.skipped ?? 0,
          rejected: raw.summary.rejected ?? 0,
        }
      : { ...EMPTY_SUMMARY },
    rows: (raw.rows ?? []).map(
      (row): ImportRowReport => ({
        line: row.line ?? 0,
        name: row.name ?? "",
        club: row.club ?? "",
        outcome: (row.outcome as ImportRowOutcome) ?? "IMPORT_ROW_OUTCOME_UNSPECIFIED",
        nominationTitles: row.nominationTitles ?? [],
        addedNominationIds: row.addedNominationIds ?? [],
        fighterId: row.fighterId ?? "",
        error: (row.error as ImportRowError) ?? "IMPORT_ROW_ERROR_UNSPECIFIED",
        errorDetail: row.errorDetail ?? "",
      }),
    ),
  };
}
