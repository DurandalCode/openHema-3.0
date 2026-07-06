import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { getAccessToken } from "@/lib/session/cookies";
import { userToJson } from "@/lib/grpc/serialize";

export const runtime = "nodejs";

/** GET /api/admin/users — список пользователей (пагинация limit/offset). */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const limit = Number(searchParams.get("limit") ?? "100");
    const offset = Number(searchParams.get("offset") ?? "0");
    const res = await adminClient.listUsers(
      { limit, offset },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const users = (res.users ?? []).map(userToJson);
    return NextResponse.json({ users });
  } catch (err) {
    return errorResponse(err);
  }
}
