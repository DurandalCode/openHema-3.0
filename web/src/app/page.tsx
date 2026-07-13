import { getCurrentUser } from "@/entities/user/model/get-current-user";
import { getActiveTournament } from "@/entities/tournament/model/get-active-tournament";
import { getNominations } from "@/entities/nomination/model/get-nominations";
import { getNominationParticipants } from "@/entities/application/model/get-nomination-participants";
import type { NominationParticipants } from "@/entities/application/lib/types";
import { getNominationRoster } from "@/entities/fighter/model/get-nomination-roster";
import type { RosterEntry } from "@/entities/fighter/lib/types";
import { siteConfig } from "@/shared/config/site-config";
import { Col, Row } from "@/shared/ui/stack";
import { AuthCta } from "@/features/auth/ui/auth-cta";
import { TournamentHero } from "@/widgets/tournament-hero/tournament-hero";
import { NominationsList } from "@/widgets/nominations-list/nominations-list";

export const dynamic = "force-dynamic";

/**
 * HomePage — главная ведёт с турнира и номинаций (FR-7); информация о самой
 * платформе живёт отдельно на /about (FR-8).
 */
export default async function HomePage() {
  const [user, tournament] = await Promise.all([
    getCurrentUser(),
    getActiveTournament(),
  ]);
  const nominations = await getNominations(tournament?.id ?? "");
  const participantsByNomination: Record<string, NominationParticipants> = Object.fromEntries(
    await Promise.all(
      nominations.map(async (n) => [n.id, await getNominationParticipants(n.id)] as const),
    ),
  );
  // rosterByNomination — реальный состав номинации (бойцы), появляется после
  // регистрации первого бойца. Пока пуст, NominationsList показывает воронку
  // заявок (UX-решение, спека 0007 п.5).
  const rosterByNomination: Record<string, RosterEntry[]> = Object.fromEntries(
    await Promise.all(
      nominations.map(async (n) => [n.id, await getNominationRoster(n.id)] as const),
    ),
  );

  return (
    <Col>
      {/* Tournament */}
      <TournamentHero tournament={tournament} />

      {/* Nominations */}
      <NominationsList
        nominations={nominations}
        participantsByNomination={participantsByNomination}
        rosterByNomination={rosterByNomination}
        isAuthenticated={Boolean(user)}
      />

      {!user && (
        <Col align="center" gap={3} className="mx-auto w-full max-w-6xl px-4 pb-16 text-center">
          <p className="text-sm text-muted-foreground">
            Хотите участвовать? Создайте аккаунт.
          </p>
          <AuthCta />
        </Col>
      )}

      {/* Footer */}
      <footer className="border-t border-border/60">
        <Row
          align="center"
          justify="between"
          className="mx-auto w-full max-w-6xl px-4 py-6 text-sm text-muted-foreground"
        >
          <span>{siteConfig.name}</span>
          <span>Пет-проект · в разработке</span>
        </Row>
      </footer>
    </Col>
  );
}
