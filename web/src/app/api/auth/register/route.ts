import { NextRequest, NextResponse } from "next/server";
import { authClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { setSessionCookies } from "@/lib/session/cookies";
import { userToJson } from "@/lib/grpc/serialize";

export const runtime = "nodejs";

/** POST /api/auth/register — регистрация нового пользователя. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { email, password, displayName } = await req.json();
    const res = await authClient.register({ email, password, displayName });

    if (res.tokens) {
      await setSessionCookies(res.tokens.accessToken, res.tokens.refreshToken);
    }

    return NextResponse.json({ user: userToJson(res.user) });
  } catch (err) {
    return errorResponse(err);
  }
}
