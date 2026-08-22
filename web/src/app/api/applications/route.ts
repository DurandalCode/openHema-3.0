import { Code, ConnectError } from "@connectrpc/connect";
import { NextResponse, type NextRequest } from "next/server";
import { applicationClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { applicationsToJson, applicationToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type SubmitBody = {
  nominationId: string;
  club?: string;
  needsEquipment?: boolean;
};

/** GET /api/applications — заявки текущего пользователя («мои заявки»). */
export async function GET(): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  try {
    const res = await applicationClient.listMyApplications(
      {},
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ applications: applicationsToJson(res.applications) });
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST /api/applications — подать заявку в номинацию (текущий пользователь). */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: SubmitBody;
  try {
    body = (await req.json()) as SubmitBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body?.nominationId) {
    return NextResponse.json({ error: "nominationId is required" }, { status: 400 });
  }

  try {
    const res = await applicationClient.submitApplication(
      {
        nominationId: body.nominationId,
        club: body.club ?? "",
        needsEquipment: body.needsEquipment ?? false,
      },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ application: applicationToJson(res.application) });
  } catch (err) {
    return submitErrorResponse(err);
  }
}

/**
 * submitErrorResponse — отказ подачи заявки в человеческом виде (спека
 * 0036, FR-6). `errorResponse` схлопывает `AlreadyExists` (активный дубль,
 * 0005) и `FailedPrecondition` (приём закрыт, 0012) в один 409 с волатильным
 * текстом Go-домена; здесь оба различаются по `connect.Code` и получают
 * свой русский текст — это наш BFF-код, не доменная строка, поэтому его
 * можно писать прямо тут (приём 0027).
 */
function submitErrorResponse(err: unknown): NextResponse {
  if (err instanceof ConnectError) {
    if (err.code === Code.AlreadyExists) {
      return NextResponse.json(
        { error: "Вы уже подали заявку в эту номинацию" },
        { status: 409 },
      );
    }
    if (err.code === Code.FailedPrecondition) {
      return NextResponse.json(
        { error: "Приём заявок в эту номинацию завершён" },
        { status: 409 },
      );
    }
    if (err.code === Code.NotFound) {
      return NextResponse.json({ error: "Номинация не найдена" }, { status: 404 });
    }
  }
  return errorResponse(err);
}
