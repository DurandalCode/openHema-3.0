import { Card, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { getActiveTournament } from "@/entities/tournament/model/get-active-tournament";
import { NominationsScreen } from "@/features/nomination-management/ui/nominations-screen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /admin/nominations — экран «Номинации» (spec 0028): таблица с порядком,
 * статусом приёма заявок, сводкой схемы этапов и подписанными действиями,
 * модалки создания/правки, подтверждение удаления с вводом названия.
 * Заголовок раздела — `PageHeader`, рендерится самим экраном (0024, FR-19).
 */
export default async function AdminNominationsPage() {
  const tournament = await getActiveTournament();

  if (!tournament) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle>Активный турнир не найден</CardTitle>
            <CardDescription>
              Проверьте миграции модуля tournament — номинации привязываются
              к активному турниру.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return <NominationsScreen tournamentId={tournament.id} tournamentName={tournament.title} />;
}
