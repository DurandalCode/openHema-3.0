import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/entities/user/model/get-current-user";
import { getNomination } from "@/entities/nomination/model/get-nomination";
import { getActiveTournament } from "@/entities/tournament/model/get-active-tournament";
import { ApplyScreen } from "@/widgets/application-apply/apply-screen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

/**
 * /nominations/[id]/apply — экран «Заявка на участие» (спека 0036, FR-1):
 * отдельный роут подачи, доступный только вошедшему пользователю — гость
 * уводится на вход (FR-1, AC-2). Несуществующая номинация — оформленная 404
 * (FR-9), тем же `not-found.tsx`, что публичная страница номинации (ловится
 * по родительскому сегменту `nominations/[id]`). Турнир — только для
 * подписи в шапке экрана, недоступность турнира не блокирует страницу.
 * Тонкая серверная обёртка (правило 0032, NFR-2): вся композиция — в
 * `ApplyScreen`.
 */
export default async function ApplyPage({ params }: PageProps) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const nomination = await getNomination(id);
  if (!nomination) {
    notFound();
  }

  const tournament = await getActiveTournament();

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-16">
      <ApplyScreen nomination={nomination} tournamentName={tournament?.title} />
    </div>
  );
}
