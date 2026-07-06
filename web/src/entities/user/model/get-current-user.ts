import "server-only";

import { authClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { Role as ProtoRole } from "@/gen/hema/v1/common_pb";
import type { Timestamp } from "@bufbuild/protobuf/wkt";
import type { CurrentUser, Role } from "../lib/types";

/**
 * timestampToIso превращает google.protobuf.Timestamp в ISO-строку.
 * Возвращает пустую строку, если timestamp отсутствует.
 */
function timestampToIso(ts: Timestamp | undefined): string {
  if (!ts) return "";
  return new Date(Number(ts.seconds) * 1000 + ts.nanos / 1_000_000).toISOString();
}

/**
 * toRoleSafe нормализует proto-роль (числовой enum) к строковому литералу
 * CurrentUser['role']. Любое неизвестное значение → ROLE_UNSPECIFIED.
 */
function toRoleSafe(r: ProtoRole | undefined): Role {
  switch (r) {
    case ProtoRole.USER:
      return "ROLE_USER";
    case ProtoRole.ADMIN:
      return "ROLE_ADMIN";
    default:
      return "ROLE_UNSPECIFIED";
  }
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
      role: toRoleSafe(u.role),
      createdAt: timestampToIso(u.createdAt),
    };
  } catch {
    return null;
  }
}
