import { NextResponse, type NextRequest } from "next/server";
import { fighterAdminClient, nominationClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { fightersToJson, nominationsToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";
import { fighterStatusLabel, withdrawalReasonLabel } from "@/entities/fighter/lib/labels";
import { CSV_BOM, toCsv } from "@/shared/lib/csv";
import { isRosterFilterParamsError, parseRosterFilterParams } from "../roster-query";

export const runtime = "nodejs";

/**
 * EXPORT_LIMIT — экспорт выгружает весь отфильтрованный набор одним вызовом
 * `ListRoster` вместо постраничного добора (спека 0041, план «Экспорт CSV»
 * — «деталь реализации»): для масштаба турнира (тысячи бойцов, спека 0041)
 * одного запроса с большим `limit` достаточно, постраничный добор не нужен.
 */
const EXPORT_LIMIT = 100_000;

const CSV_HEADER = ["Имя", "Клуб", "Статус", "Причина", "Номинации"];

/**
 * GET /api/admin/fighters/export?tournamentId=...&statuses=...&
 * nominationIds=...&clubs=...&includeNoClub=1&search=... — CSV-выгрузка
 * ростера турнира с учётом текущего фильтра/поиска экрана (спека 0041,
 * FR-11/FR-14): те же query-параметры, что у `GET /api/admin/fighters`
 * (T20), БЕЗ `page`/`pageSize` — экспортируется весь отфильтрованный набор,
 * не одна страница. Одна строка — один боец: имя, клуб, статус (для
 * выбывшего — причина, 0026 FR-5), список названий АКТИВНЫХ участий через
 * `"; "` в одной ячейке. Кодировка — UTF-8 с BOM (Excel), разделитель —
 * запятая, экранирование — RFC 4180 (`shared/lib/csv.ts`, FR-15).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const filters = parseRosterFilterParams(req.nextUrl.searchParams);
  if (isRosterFilterParamsError(filters)) {
    return NextResponse.json({ error: filters.error }, { status: 400 });
  }

  try {
    const rosterRes = await fighterAdminClient.listRoster(
      { ...filters, limit: EXPORT_LIMIT, offset: 0 },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const fighters = fightersToJson(rosterRes.fighters);

    // Номинации нужны для подписи участий именем, не id (FR-11) — Fighter
    // несёт только nominationId. tournament_id запроса опционален (резолв в
    // активный турнир на сервере, см. roster-query.ts) — если явно не
    // передан, берём его с любого бойца ответа; при пустом ростере строк
    // всё равно не будет, названия не нужны.
    const tournamentId = filters.tournamentId ?? fighters[0]?.tournamentId;
    const nominationTitleById = new Map<string, string>();
    if (tournamentId && fighters.length > 0) {
      const nominationsRes = await nominationClient.listNominations({ tournamentId });
      for (const n of nominationsToJson(nominationsRes.nominations)) {
        nominationTitleById.set(n.id, n.title);
      }
    }

    const rows = fighters.map((f) => {
      const withdrawn = f.status === "FIGHTER_STATUS_WITHDRAWN";
      const reason = withdrawn ? (withdrawalReasonLabel(f.withdrawalReason) ?? "") : "";
      const activeNominations = f.participations
        .filter((p) => p.status === "PARTICIPATION_STATUS_ACTIVE")
        .map((p) => nominationTitleById.get(p.nominationId) ?? p.nominationId)
        .join("; ");
      return [f.name, f.club, fighterStatusLabel(f.status), reason, activeNominations];
    });

    const csv = CSV_BOM + toCsv(CSV_HEADER, rows);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="roster.csv"',
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
