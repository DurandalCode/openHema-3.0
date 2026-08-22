"use client";

import { useState } from "react";
import { Col, Row } from "@/shared/ui/stack";
import { AuthCta } from "@/features/auth/ui/auth-cta";
import { TournamentHero } from "@/entities/tournament/ui/tournament-hero";
import { NominationsList } from "@/widgets/nominations-list/nominations-list";
import { applicationsSummary } from "@/entities/application/lib/summary";
import { tournamentPhase } from "@/entities/tournament-live/lib/phase";
import { useTournamentLive } from "@/features/tournament-live/api/use-tournament-live";
import { siteConfig } from "@/shared/config/site-config";
import { ApplicationsSummarySection } from "./applications-summary";
import { JoinSteps } from "./join-steps";
import { VenueContacts } from "./venue-contacts";
import { TournamentStrip } from "./tournament-strip";
import { ArenasNow } from "./arenas-now";
import { BoutFeed } from "./bout-feed";
import { NominationsRail } from "./nominations-rail";
import { RegistrationClosed } from "./registration-closed";
import type { Tournament } from "@/entities/tournament/lib/types";
import type { Nomination } from "@/entities/nomination/lib/types";
import type { NominationParticipants } from "@/entities/application/lib/types";
import type { RosterEntry } from "@/entities/fighter/lib/types";
import type { TournamentLiveSnapshotDto } from "@/entities/tournament-live/lib/types";

/**
 * HomeScreen — композиция публичной главной по состоянию турнира (спека
 * 0034, FR-1): до старта (афиша + номинации + «как участвовать») либо
 * идёт/завершён (полоса турнира + площадки/лента боёв + сайдбар номинаций).
 * Единственный держатель `useTournamentLive` на странице (NFR-2 — одна
 * живая подписка независимо от числа номинаций турнира).
 *
 * `enabled` для `useTournamentLive` решается один раз при монтировании из
 * фазы, выведенной на сервере (`initialLiveSnapshot`) — по контракту самого
 * хука (см. его doc-комментарий): в фазах `before`/`finished` подписка не
 * нужна (FR-23), поэтому если турнир стартует, пока гость смотрит «до
 * старта», это подхватится следующей загрузкой страницы, не в рамках той
 * же сессии — осознанное упрощение, явно допущенное дизайном хука.
 * Отображаемая фаза (`phase`) при этом пересчитывается на каждый новый
 * снапшот реактивно — уже открытая в `running` подписка донесёт переход в
 * `finished` без перезагрузки.
 *
 * `now` — синхронизирован с `serverNowUnixMs` живой сводки (не
 * `new Date()` на клиенте): детерминированно между серверным рендером и
 * клиентской гидратацией, как и предполагал комментарий `TournamentHero`
 * при добавлении опционального пропа `now`.
 */
export function HomeScreen({
  tournament,
  nominations,
  participantsByNomination,
  rosterByNomination,
  isAuthenticated,
  initialLiveSnapshot,
}: {
  tournament: Tournament | null;
  nominations: Nomination[];
  participantsByNomination: Record<string, NominationParticipants>;
  rosterByNomination: Record<string, RosterEntry[]>;
  isAuthenticated: boolean;
  initialLiveSnapshot: TournamentLiveSnapshotDto;
}) {
  const [enabled] = useState(
    () => tournamentPhase(initialLiveSnapshot.nominations) === "running",
  );
  const liveSnapshot = useTournamentLive(initialLiveSnapshot, enabled);
  const phase = tournamentPhase(liveSnapshot.nominations);

  const now = tournament
    ? new Date(Number(liveSnapshot.serverNowUnixMs) || Date.now())
    : new Date();

  const footer = (
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
  );

  if (phase === "before") {
    return (
      <Col>
        <TournamentHero tournament={tournament} now={now} />

        <NominationsList
          nominations={nominations}
          participantsByNomination={participantsByNomination}
          rosterByNomination={rosterByNomination}
          isAuthenticated={isAuthenticated}
        />

        <ApplicationsSummarySection summary={applicationsSummary(participantsByNomination)} />

        <JoinSteps isAuthenticated={isAuthenticated} />

        {tournament && <VenueContacts contacts={tournament.contacts} />}

        {!isAuthenticated && (
          <Col align="center" gap={3} className="mx-auto w-full max-w-6xl px-4 pb-16 text-center">
            <p className="text-sm text-muted-foreground">
              Хотите участвовать? Создайте аккаунт.
            </p>
            <AuthCta />
          </Col>
        )}

        {footer}
      </Col>
    );
  }

  // running | finished — площадки/лента боёв только в running (FR-23:
  // турнир завершён — площадки больше не актуальны).
  const anyRegistrationOpen = nominations.some((n) => n.status === "NOMINATION_STATUS_OPEN");

  // tournament гарантированно не null здесь: running/finished выводится из
  // liveSnapshot.nominations (tournamentPhase), а сводка приходит от
  // getTournamentLive(tournament.id) — без активного турнира номинаций в
  // ней не бывает, и phase остался бы "before".
  return (
    <Col>
      <TournamentStrip tournament={tournament!} snapshot={liveSnapshot} phase={phase} now={now} />

      <Row gap={4} align="start" className="mx-auto w-full max-w-6xl">
        <Col className="min-w-0 flex-1">
          {phase === "running" && <ArenasNow arenas={liveSnapshot.arenas} />}
          <BoutFeed bouts={liveSnapshot.bouts} nominations={liveSnapshot.nominations} />
        </Col>
        <NominationsRail nominations={liveSnapshot.nominations} />
      </Row>

      {!anyRegistrationOpen && <RegistrationClosed isAuthenticated={isAuthenticated} />}

      {tournament && <VenueContacts contacts={tournament.contacts} title="Зрителю" />}

      {footer}
    </Col>
  );
}
