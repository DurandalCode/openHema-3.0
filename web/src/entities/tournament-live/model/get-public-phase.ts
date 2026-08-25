import "server-only";

import { getActiveTournament } from "@/entities/tournament/model/get-active-tournament";
import { tournamentPhase, type TournamentPhase } from "../lib/phase";
import { getTournamentLive } from "./get-tournament-live";

/**
 * getPublicPhase — фаза турнира для навигации (спека 0039, блок B): тот же
 * путь и та же чистая функция (`tournamentPhase`), которой пользуется
 * главная (`app/page.tsx`) — навбар и страница не могут разойтись в оценке
 * фазы (иначе FR-7 нарушался бы через раз).
 *
 * `getActiveTournament`/`getTournamentLive` уже сами ловят ошибки gRPC и
 * возвращают безопасный дефолт (`null`/пустой снапшот) — внешний try/catch
 * здесь на случай, если это когда-нибудь перестанет быть так (защита от
 * регресса, не дублирование их контракта).
 *
 * Server-only: транзитивно тянет gRPC-клиенты.
 */
export async function getPublicPhase(): Promise<TournamentPhase> {
  try {
    const tournament = await getActiveTournament();
    if (!tournament) return "before";

    const snapshot = await getTournamentLive(tournament.id);
    return tournamentPhase(snapshot.nominations);
  } catch {
    return "before";
  }
}
