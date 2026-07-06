import { NextResponse } from "next/server";
import { adminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { getAccessToken } from "@/lib/session/cookies";
import { userToJson } from "@/lib/grpc/serialize";

export const runtime = "nodejs";

/** GET /api/admin/admins — список всех администраторов. */
export async function GET(): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  try {
    const res = await adminClient.listAdmins(
      {},
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const admins = (res.admins ?? []).map(userToJson);
    return NextResponse.json({ admins });
  } catch (err) {
    return errorResponse(err);
  }
}
