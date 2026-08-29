import { NextResponse, type NextRequest } from "next/server";
import { authClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { getAccessToken } from "@/lib/session/cookies";
import { userToJson } from "@/lib/grpc/serialize";

export const runtime = "nodejs";

/**
 * PUT /api/auth/notifications — правка личных переключателей уведомлений
 * (спека 0042, FR-20). Требует access-cookie. Включение вида при
 * неподтверждённом адресе → `ErrEmailNotVerified` → `CodeFailedPrecondition`
 * → 409 (FR-21), маппинг уже есть в `errorResponse`.
 */
export async function PUT(req: NextRequest): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let applicationState: boolean;
  let poolSeated: boolean;
  try {
    ({ applicationState, poolSeated } = await req.json());
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  try {
    const res = await authClient.updateNotificationSettings(
      { settings: { applicationState, poolSeated } },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ user: userToJson(res.user) });
  } catch (err) {
    return errorResponse(err);
  }
}
