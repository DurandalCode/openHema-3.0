import { redirect } from "next/navigation";
import { getCurrentUser } from "@/entities/user/model/get-current-user";
import { getMyFighter } from "@/entities/fighter/model/get-my-fighter";
import { getActiveTournament } from "@/entities/tournament/model/get-active-tournament";
import { getNominations } from "@/entities/nomination/model/get-nominations";
import { getTournamentLive } from "@/entities/tournament-live/model/get-tournament-live";
import { emptyTournamentLiveSnapshot } from "@/entities/tournament-live/lib/types";
import { DashboardScreen } from "@/widgets/dashboard/dashboard-screen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DashboardPage — защищённый кабинет (спека 0038), сужен до server-обёртки
 * (правило 0032, NFR-2): композиция — в `DashboardScreen`. Живая сводка
 * турнира запрашивается, только если у пользователя есть боец в активном
 * турнире (`myFighter`) — иначе некому подписываться (NFR-3), и снапшот не
 * нужен ни для одного блока экрана.
 */
export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const [myFighter, tournament] = await Promise.all([
    getMyFighter(),
    getActiveTournament(),
  ]);

  const [nominations, initialSnapshot] = await Promise.all([
    getNominations(tournament?.id ?? ""),
    myFighter ? getTournamentLive(tournament?.id ?? "") : Promise.resolve(emptyTournamentLiveSnapshot(tournament?.id ?? "")),
  ]);
  const nominationTitleById = Object.fromEntries(nominations.map((n) => [n.id, n.title]));

  return (
    <DashboardScreen
      user={user}
      myFighter={myFighter}
      initialSnapshot={initialSnapshot}
      nominationTitleById={nominationTitleById}
    />
  );
}
