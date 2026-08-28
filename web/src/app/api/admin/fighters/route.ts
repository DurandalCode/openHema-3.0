import { NextResponse, type NextRequest } from "next/server";
import { fighterAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { fightersToJson, fighterToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";
import {
  isRosterFilterParamsError,
  parsePositiveInt,
  parseRosterFilterParams,
  toRosterStatusCounts,
} from "./roster-query";

export const runtime = "nodejs";

type CreateBody = {
  tournamentId: string;
  name: string;
  club?: string;
  nominationIds?: string[];
};

/** DEFAULT_PAGE_SIZE — размер страницы ростера, если `pageSize` не передан (spec 0026 FR-11). */
const DEFAULT_PAGE_SIZE = 20;

/**
 * GET /api/admin/fighters?tournamentId=...&statuses=...&nominationIds=...&
 * clubs=...&includeNoClub=1&search=...&page=...&pageSize=... — постраничный
 * ростер турнира (только admin), спека 0041 T20: фильтр/поиск/постраничность
 * выполняются на сервере (`ListRoster`), не в браузере (FR-1..FR-3). Ответ —
 * `{fighters, totalCount, statusCounts}`: `totalCount` — под текущий
 * фильтр, для постраничной навигации (FR-5); `statusCounts` — по всему
 * ростеру турнира, НЕ зависит от фильтра/поиска (FR-4).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const filters = parseRosterFilterParams(params);
  if (isRosterFilterParamsError(filters)) {
    return NextResponse.json({ error: filters.error }, { status: 400 });
  }

  const page = parsePositiveInt(params.get("page"), 1);
  const pageSize = parsePositiveInt(params.get("pageSize"), DEFAULT_PAGE_SIZE);
  const limit = pageSize;
  const offset = (page - 1) * pageSize;

  try {
    const res = await fighterAdminClient.listRoster(
      { ...filters, limit, offset },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({
      fighters: fightersToJson(res.fighters),
      totalCount: res.totalCount,
      statusCounts: toRosterStatusCounts(res.statusCounts),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST /api/admin/fighters — ручное заведение бойца (только admin). */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body?.tournamentId) {
    return NextResponse.json({ error: "tournamentId is required" }, { status: 400 });
  }
  if (!body.name || !body.name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  try {
    const res = await fighterAdminClient.createFighter(
      {
        tournamentId: body.tournamentId,
        name: body.name,
        club: body.club ?? "",
        nominationIds: body.nominationIds ?? [],
      },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ fighter: fighterToJson(res.fighter) });
  } catch (err) {
    return errorResponse(err);
  }
}
