import { Card, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { getActiveTournament } from "@/entities/tournament/model/get-active-tournament";
import { getNominations } from "@/entities/nomination/model/get-nominations";
import { ApplicationsScreen } from "@/features/application-review/ui/applications-screen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ nominationId?: string }> };

/**
 * /admin/applications — экран «Заявки» (spec 0025): очередь на разбор
 * таблицей, чипы статусов со счётчиками, выпадающий список номинаций,
 * поиск, действия флоу, карточка заявки с историей. При переходе с
 * `?nominationId=...` (со страницы номинаций) фильтр по номинации
 * предзаполняется — так же используется как «заявки одной номинации».
 * Заголовок раздела — `PageHeader`, рендерится самим экраном (0024, FR-19).
 */
export default async function AdminApplicationsPage({ searchParams }: PageProps) {
  const { nominationId } = await searchParams;
  const tournament = await getActiveTournament();
  const nominations = tournament ? await getNominations(tournament.id) : [];

  if (!tournament) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle>Активный турнир не найден</CardTitle>
            <CardDescription>
              Проверьте миграции модуля tournament — заявки привязаны к
              номинациям активного турнира.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <ApplicationsScreen
      tournamentId={tournament.id}
      nominations={nominations}
      tournamentName={tournament.title}
      initialNominationId={nominationId}
    />
  );
}
