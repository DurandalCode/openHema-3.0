import "server-only";

import { stageAdminClient } from "@/lib/grpc/client";
import { stagesToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";
import type { Stage } from "@/entities/stage/lib/types";

/**
 * getStages — список этапов номинации на сервере (спека 0018, FR-18) для
 * SSR-выбора виджета на `.../stages/[stageId]` — группа рендерит
 * `NominationPools`, сетка — `BracketSeeding` (`plan.md`, «Маршруты
 * страниц»). Прямого `GetStage` RPC нет (`plan.md`, «Контракты»), поэтому
 * этап ищется в списке `ListStages` по `id`.
 *
 * Зовёт админский `StageAdminService.ListStages` — тот же RPC, что и
 * BFF `GET /api/nominations/[id]/stages` (`app/api/nominations/[id]/stages/route.ts`),
 * только напрямую из server component, как `getArenaLiveBoard`
 * (`entities/arena-live/model/get-arena-live.ts`).
 *
 * Возвращает `[]` без токена, при пустом `nominationId` или ошибке gRPC —
 * страница показывает `notFound()`.
 *
 * Server-only: next/headers (cookies) + connect-node (gRPC).
 */
export async function getStages(nominationId: string): Promise<Stage[]> {
  if (!nominationId) return [];
  const accessToken = await getAccessToken();
  if (!accessToken) return [];
  try {
    const res = await stageAdminClient.listStages(
      { nominationId },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return stagesToJson(res.stages);
  } catch {
    return [];
  }
}
