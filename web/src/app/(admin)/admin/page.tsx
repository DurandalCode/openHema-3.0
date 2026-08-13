import { getCurrentUser } from "@/entities/user/model/get-current-user";
import { getActiveTournament } from "@/entities/tournament/model/get-active-tournament";
import { UsersScreen } from "@/features/admin/ui/users-screen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** /admin — экран «Пользователи»: единый список учётных записей (спека 0024). */
export default async function AdminPage() {
  const [user, tournament] = await Promise.all([
    getCurrentUser(),
    getActiveTournament(),
  ]);

  return (
    <UsersScreen currentUserId={user?.id ?? ""} tournamentName={tournament?.title} />
  );
}
