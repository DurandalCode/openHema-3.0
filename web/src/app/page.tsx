import { getCurrentUser } from "@/entities/user/model/get-current-user";
import { getActiveTournament } from "@/entities/tournament/model/get-active-tournament";
import { getNominations } from "@/entities/nomination/model/get-nominations";
import { getNominationParticipants } from "@/entities/application/model/get-nomination-participants";
import type { NominationParticipants } from "@/entities/application/lib/types";
import { getNominationRoster } from "@/entities/fighter/model/get-nomination-roster";
import type { RosterEntry } from "@/entities/fighter/lib/types";
import { getTournamentLive } from "@/entities/tournament-live/model/get-tournament-live";
import { HomeScreen } from "@/widgets/home/home-screen";

export const dynamic = "force-dynamic";

/**
 * HomePage — тонкая server-обёртка (приём NFR-2 спеки 0032: композиция
 * живёт в виджете, страница — только сбор данных). Ведёт с турнира и
 * номинаций (FR-7); переключение по состоянию турнира (до старта / идёт /
 * завершён, спека 0034 FR-1) — в `widgets/home/home-screen.tsx`.
 * Информация о самой платформе живёт отдельно на /about (FR-8).
 */
export default async function HomePage() {
  const [user, tournament] = await Promise.all([
    getCurrentUser(),
    getActiveTournament(),
  ]);
  const [nominations, initialLiveSnapshot] = await Promise.all([
    getNominations(tournament?.id ?? ""),
    getTournamentLive(tournament?.id ?? ""),
  ]);
  const participantsByNomination: Record<string, NominationParticipants> = Object.fromEntries(
    await Promise.all(
      nominations.map(async (n) => [n.id, await getNominationParticipants(n.id)] as const),
    ),
  );
  // rosterByNomination — реальный состав номинации (бойцы), появляется после
  // регистрации первого бойца. Пока пуст, NominationsList показывает воронку
  // заявок (UX-решение, спека 0007 п.5).
  const rosterByNomination: Record<string, RosterEntry[]> = Object.fromEntries(
    await Promise.all(
      nominations.map(async (n) => [n.id, await getNominationRoster(n.id)] as const),
    ),
  );

  return (
    <HomeScreen
      tournament={tournament}
      nominations={nominations}
      participantsByNomination={participantsByNomination}
      rosterByNomination={rosterByNomination}
      isAuthenticated={Boolean(user)}
      initialLiveSnapshot={initialLiveSnapshot}
    />
  );
}
