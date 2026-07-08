import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { getActiveTournament } from "@/entities/tournament/model/get-active-tournament";
import { TournamentSettingsForm } from "@/features/tournament-settings/ui/tournament-settings-form";
import { TournamentHero } from "@/widgets/tournament-hero/tournament-hero";
import { AdminHeader } from "../admin-header";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** /admin/tournament — настройки профиля активного турнира. */
export default async function AdminTournamentPage() {
  const tournament = await getActiveTournament();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16">
      <AdminHeader
        backHref="/admin"
        title="Турнир"
        description="Профиль активного турнира. Изменения сразу видны на главной."
      />

      <div className="mt-8">
        <TournamentHero tournament={tournament} />
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Настройки</CardTitle>
          <CardDescription>
            Название, описание, дата проведения, эмблема и контакты.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tournament ? (
            <TournamentSettingsForm tournament={tournament} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Активный турнир не найден. Проверьте миграции модуля tournament.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}