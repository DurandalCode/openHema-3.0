"use client";

import { PageHeader } from "@/shared/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { useConsole } from "../api/use-console";
import { ConsoleArenaCard } from "./console-arena-card";
import { ConsoleNominationRow } from "./console-nomination-row";
import { ConsoleQueueList } from "./console-queue-list";
import { AttentionFeed } from "./attention-feed";
import type { TournamentConsoleSnapshotDto } from "@/entities/tournament-console/lib/types";

/**
 * ConsoleScreen — корень экрана «Пульт» (спека 0043, FR-8/FR-9/FR-19):
 * живой операционный дашборд оператора турнира — все площадки, все
 * номинации, очередь готовых пулов, лента «требует внимания». Read-only
 * относительно домена (FR-13/FR-17): каждая карточка ведёт на экран, где
 * выполняется действие, сам пульт ничего не ставит и не завершает.
 *
 * `useConsole` держит живое состояние (SSE + polling-fallback, FR-18);
 * `initialSnapshot` — SSR-снапшот с сервера (страница уже сходила за ним
 * до монтирования этого клиентского компонента), поэтому первый рендер не
 * пустой даже до открытия канала.
 */
export function ConsoleScreen({
  tournamentId,
  initialSnapshot,
}: {
  tournamentId: string;
  initialSnapshot: TournamentConsoleSnapshotDto;
}) {
  const snapshot = useConsole(tournamentId, initialSnapshot);

  return (
    <div className="flex flex-col gap-6 px-4 py-6 md:px-6">
      <PageHeader title="Пульт" />

      <section aria-label="Требует внимания" className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-caption-foreground">Требует внимания</h2>
        <AttentionFeed alerts={snapshot.alerts} />
      </section>

      <section aria-label="Площадки" className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-caption-foreground">Площадки</h2>
        {snapshot.arenas.length === 0 ? (
          <p className="text-sm text-caption-foreground">В турнире нет активных площадок.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {snapshot.arenas.map((arena) => (
              <ConsoleArenaCard key={arena.arenaId} arena={arena} />
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Номинации</CardTitle>
          </CardHeader>
          <CardContent>
            {snapshot.nominations.length === 0 ? (
              <p className="text-sm text-caption-foreground">В турнире нет номинаций.</p>
            ) : (
              <div className="flex flex-col">
                {snapshot.nominations.map((nomination) => (
                  <ConsoleNominationRow key={nomination.nominationId} nomination={nomination} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Очередь на постановку</CardTitle>
          </CardHeader>
          <CardContent>
            <ConsoleQueueList items={snapshot.queue} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
