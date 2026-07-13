import { Card, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { getActiveTournament } from "@/entities/tournament/model/get-active-tournament";
import { getNominations } from "@/entities/nomination/model/get-nominations";
import { FighterRoster } from "@/features/fighter-management/ui/fighter-roster";
import { AdminHeader } from "../admin-header";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /admin/fighters — ростер бойцов активного турнира (спека 0007): ручное
 * заведение, вывод/возврат, участие в номинациях. Отдельно от /admin/applications
 * (воронка заявок, 0005) — боец не завязан на заявку после регистрации.
 */
export default async function AdminFightersPage() {
  const tournament = await getActiveTournament();
  const nominations = tournament ? await getNominations(tournament.id) : [];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16">
      <AdminHeader
        title="Бойцы"
        description="Ростер турнира: бойцы и их участие в номинациях. Отдельно от заявок — боец не завязан на заявку после регистрации."
      />

      <div className="mt-8">
        {tournament ? (
          <FighterRoster tournamentId={tournament.id} nominations={nominations} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Активный турнир не найден</CardTitle>
              <CardDescription>
                Проверьте миграции модуля tournament — бойцы привязываются к
                активному турниру.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </div>
  );
}
