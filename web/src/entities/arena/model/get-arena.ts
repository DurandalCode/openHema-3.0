import "server-only";

import { arenaAdminClient } from "@/lib/grpc/client";
import { arenaToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";
import type { Arena } from "../lib/types";

/**
 * getArena — точка получения одной площадки на сервере для SSR страницы
 * управления площадкой (FR-9). Зовёт admin-gRPC `getArena` (требует ADMIN),
 * прокидывая access-токен из httpOnly-cookie.
 *
 * Возвращает `null`, если токена нет или gRPC ответил не 2xx. Решение о
 * редиректе / показе ошибки принимает вызывающий роут (admin-зона уже
 * защищена layout-guard на роль ADMIN — сюда попадают только админы).
 *
 * Server-only: использует next/headers (cookies) и connect-node (gRPC).
 */
export async function getArena(id: string): Promise<Arena | null> {
  if (!id) return null;
  const accessToken = await getAccessToken();
  if (!accessToken) return null;
  try {
    const res = await arenaAdminClient.getArena(
      { id },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return arenaToJson(res.arena);
  } catch {
    return null;
  }
}