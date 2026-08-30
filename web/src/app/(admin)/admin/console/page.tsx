import { Card, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { getActiveTournament } from "@/entities/tournament/model/get-active-tournament";
import { getTournamentConsole } from "@/entities/tournament-console/model/get-tournament-console";
import { ConsoleScreen } from "@/features/tournament-console/ui/console-screen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /admin/console — экран «Пульт» (спека 0043, ADR 0020): живой операционный
 * дашборд оператора турнира. Первый пункт навигации админ-зоны (T18) —
 * экран, на котором оператор проводит турнир.
 */
export default async function AdminConsolePage() {
  const tournament = await getActiveTournament();

  if (!tournament) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle>Активный турнир не найден</CardTitle>
            <CardDescription>
              Пульт показывает живое состояние активного турнира — без него
              нечего отображать.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const snapshot = await getTournamentConsole(tournament.id);

  return <ConsoleScreen tournamentId={tournament.id} initialSnapshot={snapshot} />;
}
