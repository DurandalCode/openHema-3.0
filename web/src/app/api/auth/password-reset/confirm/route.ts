import { ConnectError, Code } from "@connectrpc/connect";
import { NextResponse, type NextRequest } from "next/server";
import { authClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";

export const runtime = "nodejs";

// MIN_PASSWORD_LEN зеркалит server/modules/auth/service/password_policy.go
// (MinPasswordLen, FR-11) — единая политика длины пароля. Проверяется здесь
// ДО вызова RPC: сервер возвращает один и тот же Code.InvalidArgument и для
// битого токена (ErrInvalidResetToken, FR-8 — причины внутри токена
// намеренно не различаются), и для слабого пароля (ErrWeakPassword) — без
// этой пре-проверки гость с валидной ссылкой и коротким паролем получил бы
// сообщение «ссылка недействительна» вместо подсказки про длину пароля.
const MIN_PASSWORD_LEN = 8;

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

  if (typeof password !== "string" || password.length < MIN_PASSWORD_LEN) {
    return NextResponse.json(
      { error: `Пароль должен быть не короче ${MIN_PASSWORD_LEN} символов` },
      { status: 400 },
    );
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
