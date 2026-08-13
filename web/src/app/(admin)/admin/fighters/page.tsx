import { Card, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { getActiveTournament } from "@/entities/tournament/model/get-active-tournament";
import { getNominations } from "@/entities/nomination/model/get-nominations";
import { FightersScreen } from "@/features/fighter-management/ui/fighters-screen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /admin/fighters — экран «Бойцы» (spec 0026): ростер турнира таблицей,
 * фильтры/поиск/пагинация, карточка бойца (перевод/вывод/возврат/правка/
 * участия), модалка ручного заведения. Заголовок раздела — `PageHeader`,
 * рендерится самим экраном (0024, FR-19).
 */
export default async function AdminFightersPage() {
  const tournament = await getActiveTournament();
  const nominations = tournament ? await getNominations(tournament.id) : [];

  if (!tournament) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle>Активный турнир не найден</CardTitle>
            <CardDescription>
              Проверьте миграции модуля tournament — бойцы привязываются к
              активному турниру.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <FightersScreen
      tournamentId={tournament.id}
      nominations={nominations}
      tournamentName={tournament.title}
    />
  );
}
