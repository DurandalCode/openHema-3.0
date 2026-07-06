import { NextResponse } from "next/server";
import { clearSessionCookies } from "@/lib/session/cookies";

export const runtime = "nodejs";

/** POST /api/auth/logout — очистка сессии (удаление cookie). */
export async function POST(): Promise<NextResponse> {
  await clearSessionCookies();
  return NextResponse.json({ ok: true });
}
