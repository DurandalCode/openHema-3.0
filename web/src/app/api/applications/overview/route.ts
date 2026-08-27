import { NextResponse, type NextRequest } from "next/server";
import { applicationAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { applicationsToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";
import { ApplicationState } from "@/gen/hema/v1/application_pb";

export const runtime = "nodejs";

// STATE_BY_NAME/STATE_NAME_BY_VALUE — маппинг между строковым DTO-литералом
// заявки (тот же, что уже несёт `Application.state` в JSON-ответе,
// `applicationsToJson`) и числовым значением generated-enum'а, который ждёт
// gRPC-запрос. `ListApplicationsRequest.statuses` — числа на проводе gRPC,
// но клиентский DTO (`entities/application/lib/types.ts`) держит статус
// строкой — тот же приём, что `sourceKindDtoToProto` в `lib/grpc/serialize.ts`
// для других enum'ов, применённый локально (файл вне разрешённого для правки
// скоупа этого трека).
const STATE_BY_NAME: Record<string, ApplicationState> = {
  APPLICATION_STATE_UNSPECIFIED: ApplicationState.UNSPECIFIED,
  APPLICATION_STATE_SUBMITTED: ApplicationState.SUBMITTED,
  APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION: ApplicationState.AWAITING_PAYMENT_CONFIRMATION,
  APPLICATION_STATE_PAID: ApplicationState.PAID,
  APPLICATION_STATE_REGISTERED: ApplicationState.REGISTERED,
  APPLICATION_STATE_WITHDRAWN: ApplicationState.WITHDRAWN,
};

const STATE_NAME_BY_VALUE: Record<ApplicationState, string> = {
  [ApplicationState.UNSPECIFIED]: "APPLICATION_STATE_UNSPECIFIED",
  [ApplicationState.SUBMITTED]: "APPLICATION_STATE_SUBMITTED",
  [ApplicationState.AWAITING_PAYMENT_CONFIRMATION]: "APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION",
  [ApplicationState.PAID]: "APPLICATION_STATE_PAID",
  [ApplicationState.REGISTERED]: "APPLICATION_STATE_REGISTERED",
  [ApplicationState.WITHDRAWN]: "APPLICATION_STATE_WITHDRAWN",
};

// DEFAULT_LIMIT — тот же дефолт, что уже принят `GET /api/admin/users`
// (ListUsers) для limit/offset без потолка сверху (план 0041, «Общее» —
// сервис не задаёт свой дефолт/потолок сверх уже принятого в проекте).
const DEFAULT_LIMIT = 100;

/**
 * GET /api/applications/overview?tournamentId=&statuses=&nominationIds=&needsEquipment=&search=&limit=&offset=
 * — сводный экран заявок турнира (admin) с серверными поиском/фильтром/
 * постраничностью (спека 0041, FR-1..FR-6, план «Web»).
 *
 * `statuses`/`nominationIds` — повторяющиеся query-параметры
 * (`?statuses=X&statuses=Y`), не CSV-строка в одном значении: `getAll`
 * читает их без ручного парсинга разделителя, симметрично тому, как REST
 * обычно кодирует множественный выбор в этом проекте. `needsEquipment` —
 * `"true"`/отсутствует (точечный флаг, не набор). `limit`/`offset` — тот же
 * стиль постраничности, что уже принят `GET /api/admin/users` (ListUsers).
 *
 * Ответ несёт `totalCount` (число заявок под фильтром, без limit/offset —
 * для постраничной навигации, FR-5) и `statusCounts` — счётчики по ВСЕМ
 * заявкам турнира, не зависящие от фильтра/поиска (FR-4).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const tournamentId = searchParams.get("tournamentId");
  if (!tournamentId) {
    return NextResponse.json({ error: "tournamentId is required" }, { status: 400 });
  }

  const statuses: ApplicationState[] = [];
  for (const raw of searchParams.getAll("statuses")) {
    const value = STATE_BY_NAME[raw];
    if (value === undefined) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
    statuses.push(value);
  }

  const nominationIds = searchParams.getAll("nominationIds");
  const needsEquipment = searchParams.get("needsEquipment") === "true" ? true : undefined;
  const search = searchParams.get("search")?.trim() || undefined;
  const limit = Number(searchParams.get("limit") ?? String(DEFAULT_LIMIT));
  const offset = Number(searchParams.get("offset") ?? "0");

  try {
    const res = await applicationAdminClient.listApplications(
      { tournamentId, statuses, nominationIds, needsEquipment, search, limit, offset },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({
      applications: applicationsToJson(res.applications),
      totalCount: res.totalCount ?? 0,
      statusCounts: (res.statusCounts ?? []).map((c) => ({
        status: STATE_NAME_BY_VALUE[c.status] ?? "APPLICATION_STATE_UNSPECIFIED",
        count: c.count,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
