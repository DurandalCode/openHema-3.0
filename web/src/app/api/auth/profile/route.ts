import { NextResponse, type NextRequest } from "next/server";
import { authClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { getAccessToken } from "@/lib/session/cookies";
import { userToJson } from "@/lib/grpc/serialize";

export const runtime = "nodejs";

// MAX_PROFILE_FIELD_LEN зеркалит
// server/modules/auth/service/profile_policy.go (MaxProfileFieldLen) — обе
// колонки unbounded TEXT, лимит только в валидации. Проверяется здесь ДО
// вызова RPC: без пре-проверки ошибка дошла бы до пользователя как сырой
// текст Go-домена ("auth: invalid profile") через generic errorResponse.
const MAX_PROFILE_FIELD_LEN = 100;

/**
 * PATCH /api/auth/profile — правка отображаемого имени и клуба (spec 0037,
 * FR-13/FR-15). Пустое или слишком длинное имя, слишком длинный клуб —
 * отклоняются на границе BFF (тот же приём, что `PUT /api/tournament` для
 * пустого названия) — быстрый отказ без RPC; сервер (FR-14) — вторая линия
 * защиты, её ошибка тоже маппится в 400. Клуб опционален: пустая строка —
 * легальное значение («клуб не указан»).
 */
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let displayName: string;
  let club: string;
  try {
    ({ displayName, club } = await req.json());
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!displayName || !displayName.trim()) {
    return NextResponse.json({ error: "display name is required" }, { status: 400 });
  }
  if ([...displayName].length > MAX_PROFILE_FIELD_LEN) {
    return NextResponse.json(
      { error: `display name must be at most ${MAX_PROFILE_FIELD_LEN} characters` },
      { status: 400 },
    );
  }
  if (club && [...club].length > MAX_PROFILE_FIELD_LEN) {
    return NextResponse.json(
      { error: `club must be at most ${MAX_PROFILE_FIELD_LEN} characters` },
      { status: 400 },
    );
  }

  try {
    const res = await authClient.updateProfile(
      { displayName, club: club ?? "" },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ user: userToJson(res.user) });
  } catch (err) {
    return errorResponse(err);
  }
}
