import "server-only";

import { fighterClient } from "@/lib/grpc/client";
import { fighterToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";
import type { Fighter } from "../lib/types";

/**
 * getMyFighter — боец текущего пользователя в активном турнире на сервере
 * для SSR (спека 0038, ADR 0016: только владелец, только чтение). Читает
 * access-токен из httpOnly-cookie, зовёт gRPC FighterService.GetMyFighter.
 *
 * Возвращает `null` при отсутствии токена, ошибке gRPC или пустом ответе
 * (у пользователя нет бойца в турнире — нормальный случай, FR-41, не
 * ошибка). Решение о том, как показать «бойца нет», принимает вызывающий
 * виджет (widgets/dashboard), не эта функция.
 *
 * Server-only: connect-node (gRPC) не работает в браузере.
 */
export async function getMyFighter(): Promise<Fighter | null> {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;

  try {
    const res = await fighterClient.getMyFighter(
      {},
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return fighterToJson(res.fighter);
  } catch {
    return null;
  }
}
