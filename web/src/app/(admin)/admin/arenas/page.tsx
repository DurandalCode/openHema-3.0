import { Card, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { getActiveTournament } from "@/entities/tournament/model/get-active-tournament";
import { ArenasScreen } from "@/features/arena-management/ui/arenas-screen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /admin/arenas — экран «Площадки» (spec 0027): список с живым статусом
 * (свободна/готовится/идёт бой/между боями/завершён), порядком, модалками
 * создания и правки (включая дефолтную длительность боя). Заголовок
 * раздела — `PageHeader`, рендерится самим экраном (0024, FR-19).
 */
export default async function AdminArenasPage() {
  const tournament = await getActiveTournament();

  if (!tournament) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle>Активный турнир не найден</CardTitle>
            <CardDescription>
              Проверьте миграции модуля tournament — площадки привязываются
              к активному турниру.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return <ArenasScreen tournamentId={tournament.id} tournamentName={tournament.title} />;
}