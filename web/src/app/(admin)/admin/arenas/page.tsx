import { Card, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { getActiveTournament } from "@/entities/tournament/model/get-active-tournament";
import { ArenaManagement } from "@/features/arena-management/ui/arena-management";
import { AdminHeader } from "../admin-header";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** /admin/arenas — управление площадками (ристалищами) активного турнира. */
export default async function AdminArenasPage() {
  const tournament = await getActiveTournament();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16">
      <AdminHeader
        title="Площадки"
        description="Ристалища/арены активного турнира. Управление боями появится позже."
      />

      <div className="mt-8">
        {tournament ? (
          <ArenaManagement tournamentId={tournament.id} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Активный турнир не найден</CardTitle>
              <CardDescription>
                Проверьте миграции модуля tournament — площадки привязываются
                к активному турниру.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </div>
  );
}