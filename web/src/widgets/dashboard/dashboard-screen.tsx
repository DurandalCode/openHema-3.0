"use client";

import { useTournamentLive } from "@/features/tournament-live/api/use-tournament-live";
import { tournamentPhase } from "@/entities/tournament-live/lib/phase";
import { withdrawalReasonLabel } from "@/entities/fighter/lib/labels";
import { Col } from "@/shared/ui/stack";
import type { CurrentUser } from "@/entities/user/lib/types";
import type { Fighter } from "@/entities/fighter/lib/types";
import type { TournamentLiveSnapshotDto } from "@/entities/tournament-live/lib/types";
import { NotificationsCard } from "@/features/profile/ui/notifications-card";
import { NextBoutCard } from "./next-bout-card";
import { MyNominations } from "./my-nominations";
import { MyApplicationsPreview } from "./my-applications-preview";
import { ProfileCard } from "./profile-card";
import { SecurityCard } from "./security-card";
import { LogoutButton } from "./logout-button";

/**
 * DashboardScreen — композиция кабинета (спека 0038, NFR-2): единственный
 * держатель `useTournamentLive` на странице (тот же приём, что
 * `widgets/home/home-screen.tsx`). `enabled` решается один раз на
 * монтировании из `initialSnapshot` (боец есть + турнир уже идёт, FR-30..
 * FR-37/NFR-3) — гость и пользователь без бойца вообще не открывают живой
 * канал: подписываться некому.
 */
export function DashboardScreen({
  user,
  myFighter,
  initialSnapshot,
  nominationTitleById,
}: {
  user: CurrentUser;
  myFighter: Fighter | null;
  initialSnapshot: TournamentLiveSnapshotDto;
  nominationTitleById: Record<string, string>;
}) {
  const enabled = Boolean(myFighter) && tournamentPhase(initialSnapshot.nominations) === "running";
  const snapshot = useTournamentLive(initialSnapshot, enabled);

  const withdrawn = myFighter?.status === "FIGHTER_STATUS_WITHDRAWN";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Кабинет</h1>
      <p className="mt-2 text-muted-foreground">
        Привет, {user.displayName || user.email}.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
        <Col gap={8}>
          {myFighter && withdrawn && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
              Вы выбыли из турнира
              {withdrawalReasonLabel(myFighter.withdrawalReason)
                ? ` (${withdrawalReasonLabel(myFighter.withdrawalReason)})`
                : ""}
              .
            </div>
          )}

          {myFighter && !withdrawn && (
            <NextBoutCard bouts={snapshot.bouts} fighterId={myFighter.id} />
          )}

          {myFighter && (
            <MyNominations
              participations={myFighter.participations}
              bouts={snapshot.bouts}
              fighterId={myFighter.id}
              nominationTitleById={nominationTitleById}
            />
          )}

          <MyApplicationsPreview nominationTitleById={nominationTitleById} />
        </Col>

        <Col gap={4}>
          <ProfileCard user={user} />
          <SecurityCard user={user} />
          <NotificationsCard user={user} />
          <LogoutButton />
        </Col>
      </div>
    </div>
  );
}
