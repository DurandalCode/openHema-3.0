import { NextResponse } from "next/server";
import { authClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { getAccessToken } from "@/lib/session/cookies";
import { userToJson } from "@/lib/grpc/serialize";

export const runtime = "nodejs";

/** GET /api/auth/me — текущий пользователь по access-токену из cookie. */
export async function GET(): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  try {
    const res = await authClient.me(
      {},
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ user: userToJson(res.user) });
  } catch (err) {
    return errorResponse(err);
  }
}
