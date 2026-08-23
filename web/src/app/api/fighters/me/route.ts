import { NextResponse } from "next/server";
import { fighterClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { fighterToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

/**
 * GET /api/fighters/me — боец текущего пользователя в активном турнире
 * (спека 0038, ADR 0016). Нет access-cookie → 401. Сервер вернул пустого
 * fighter (у пользователя нет бойца, FR-41) → `{fighter: null}` — это не
 * ошибка.
 */
export async function GET(): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  try {
    const res = await fighterClient.getMyFighter(
      {},
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ fighter: fighterToJson(res.fighter) });
  } catch (err) {
    return errorResponse(err);
  }
}
