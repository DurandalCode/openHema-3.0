import { ConnectError, Code } from "@connectrpc/connect";
import { NextResponse, type NextRequest } from "next/server";
import { authClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";

export const runtime = "nodejs";

/**
 * POST /api/auth/password-reset/confirm — установка нового пароля по
 * одноразовой ссылке восстановления (spec 0037, FR-7/FR-8). В отличие от
 * `password-reset/route.ts`, здесь ошибка **должна** дойти до гостя: он
 * должен узнать, что ссылка недействительна, и не должен догадываться,
 * почему (`InvalidArgument` не различает «нет токена»/«просрочен»/
 * «использован», FR-8) — единый человекочитаемый текст вместо `rawMessage`
 * сервера.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let token: string;
  let password: string;
  try {
    ({ token, password } = await req.json());
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  try {
    await authClient.resetPassword({ token, newPassword: password });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ConnectError && err.code === Code.InvalidArgument) {
      return NextResponse.json(
        { error: "ссылка недействительна или устарела" },
        { status: 400 },
      );
    }
    return errorResponse(err);
  }
}
