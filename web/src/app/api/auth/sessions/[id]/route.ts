import { NextResponse, type NextRequest } from "next/server";
import { authClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * DELETE /api/auth/sessions/[id] — завершить одну сессию (спека 0042,
 * FR-12). Сервер сверяет владение сессией через `CallerID` (не через
 * «текущую сессию»), поэтому `X-Refresh-Token` здесь не нужен — только
 * `Authorization`. Чужая сессия → `PermissionDenied` → 403 (FR-17).
 */
export async function DELETE(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;

  try {
    await authClient.revokeSession(
      { sessionId: id },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
