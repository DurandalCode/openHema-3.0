import { redirect } from "next/navigation";
import { getCurrentUser } from "@/entities/user/model/get-current-user";
import { getActiveTournament } from "@/entities/tournament/model/get-active-tournament";
import { getNominations } from "@/entities/nomination/model/get-nominations";
import { MyApplicationsScreen } from "@/widgets/my-applications/my-applications-screen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Мои заявки — защищённая страница (вынесена из кабинета, доступна из
 * навбара), только для аутентифицированных пользователей. Сужена до
 * серверной обёртки (спека 0036, NFR-2): сессия → карта названий номинаций
 * активного турнира → композиция в `MyApplicationsScreen` (правило 0032).
 * Название номинации join'ится тут же, а не хранится в заявке (спека 0036,
 * «Принятые решения», п.4) — тем же приёмом, что на админском экране заявок
 * (0025).
 */
export default async function ApplicationsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const tournament = await getActiveTournament();
  const nominations = await getNominations(tournament?.id ?? "");
  const nominationTitleById = Object.fromEntries(nominations.map((n) => [n.id, n.title]));

  return <MyApplicationsScreen nominationTitleById={nominationTitleById} />;
}
