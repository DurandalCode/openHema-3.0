import { Card, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { getActiveTournament } from "@/entities/tournament/model/get-active-tournament";
import { NominationManagement } from "@/features/nomination-management/ui/nomination-management";
import { AdminHeader } from "../admin-header";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** /admin/nominations — управление номинациями активного турнира. */
export default async function AdminNominationsPage() {
  const tournament = await getActiveTournament();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16">
      <AdminHeader
        backHref="/admin"
        title="Номинации"
        description="Дисциплины/категории активного турнира. Изменения сразу видны на главной."
      />

      <div className="mt-8">
        {tournament ? (
          <NominationManagement tournamentId={tournament.id} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Активный турнир не найден</CardTitle>
              <CardDescription>
                Проверьте миграции модуля tournament — номинации привязываются
                к активному турниру.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </div>
  );
}
