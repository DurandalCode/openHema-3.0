import { EmptyState } from "@/shared/ui/empty-state";
import { PageHeader } from "@/shared/ui/page-header";
import { getActiveTournament } from "@/entities/tournament/model/get-active-tournament";
import { TournamentScreen } from "@/features/tournament-settings/ui/tournament-screen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /admin/tournament — профиль активного турнира (spec 0029, A12): редактор и
 * живое превью главной в два столбца (`TournamentScreen`). Отсутствие
 * активного турнира объясняется на языке организатора (FR-16, AC-10) — без
 * упоминания миграций/модулей, которые видел прежний текст.
 */
export default async function AdminTournamentPage() {
  const tournament = await getActiveTournament();

  if (!tournament) {
    return (
      <div data-slot="tournament-screen" className="flex flex-col">
        <PageHeader crumb="ТУРНИР" title="Профиль турнира" />
        <EmptyState
          className="p-16"
          title="Активный турнир не найден"
          hint="Обратитесь к администратору системы: профиль турнира ещё не заведён."
        />
      </div>
    );
  }

  return <TournamentScreen tournament={tournament} />;
}
