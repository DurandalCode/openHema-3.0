import "server-only";

import { authClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import type { Timestamp } from "@bufbuild/protobuf/wkt";
import type { CurrentUser } from "../lib/types";

/**
 * timestampToIso превращает google.protobuf.Timestamp в ISO-строку.
 * Возвращает пустую строку, если timestamp отсутствует.
 */
function timestampToIso(ts: Timestamp | undefined): string {
  if (!ts) return "";
  return new Date(Number(ts.seconds) * 1000 + ts.nanos / 1_000_000).toISOString();
}

/**
 * getCurrentUser — единственная точка получения текущего пользователя
 * на сервере. Читает access-токен из httpOnly-cookie, зовёт gRPC `me`.
 *
 * Возвращает `null`, если токена нет или он невалиден — НЕ редиректит.
 * Решение о редиректе принимает вызывающий роут.
 *
 * Server-only: использует next/headers (cookies) и connect-node (gRPC).
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;

  try {
    const res = await authClient.me(
      {},
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.user) return null;
    const u = res.user;
    return {
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      createdAt: timestampToIso(u.createdAt),
    };
  } catch {
    return null;
  }
}
