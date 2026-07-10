import { Card, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { getActiveTournament } from "@/entities/tournament/model/get-active-tournament";
import { getNominations } from "@/entities/nomination/model/get-nominations";
import { ApplicationsOverview } from "@/features/application-review/ui/applications-overview";
import { AdminHeader } from "../admin-header";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ nominationId?: string }> };

/**
 * /admin/applications — сводный экран заявок турнира (FR-14): фильтрация по
 * статусу и/или номинации, подтверждение оплаты, регистрация. При переходе с
 * `?nominationId=...` (со страницы номинаций) фильтр по номинации
 * предзаполняется — так же используется как «заявки одной номинации».
 */
export default async function AdminApplicationsPage({ searchParams }: PageProps) {
  const { nominationId } = await searchParams;
  const tournament = await getActiveTournament();
  const nominations = tournament ? await getNominations(tournament.id) : [];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-16">
      <AdminHeader
        title="Заявки"
        description="Все заявки турнира: фильтрация по статусу и номинации, подтверждение оплаты, регистрация."
      />

      <div className="mt-8">
        {tournament ? (
          <ApplicationsOverview
            tournamentId={tournament.id}
            nominations={nominations}
            initialNominationId={nominationId}
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Активный турнир не найден</CardTitle>
              <CardDescription>
                Проверьте миграции модуля tournament — заявки привязаны к
                номинациям активного турнира.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </div>
  );
}
