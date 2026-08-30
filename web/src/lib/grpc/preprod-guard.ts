import { NextResponse } from "next/server";
import { getCurrentUser } from "@/entities/user/model/get-current-user";
import { isPreprodModeEnabled } from "@/shared/config/preprod";

export async function assertPreprodAccess(): Promise<NextResponse | null> {
  if (!isPreprodModeEnabled()) return null;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  return null;
}
