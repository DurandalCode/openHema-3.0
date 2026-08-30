"use client";

import { PageHeader } from "@/shared/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { useConsole } from "../api/use-console";
import { ConsoleArenaCard } from "./console-arena-card";
import { ConsoleNominationRow } from "./console-nomination-row";
import { ConsoleQueueList } from "./console-queue-list";
import { AttentionFeed, AttentionFeedCompact } from "./attention-feed";
import type {
  ConsoleArena,
  ConsoleNomination,
  ConsoleQueueItem,
  TournamentConsoleSnapshotDto,
} from "@/entities/tournament-console/lib/types";

/**
 * ArenasGrid — сетка карточек площадок (спека 0043, FR-11). Число колонок
 * параметризовано вызывающим: мобильная вкладка — одна колонка на всю
 * ширину (спека 0045, FR-14), планшет-и-шире — прежняя многоколоночная
 * сетка (без изменений).
 */
function ArenasGrid({ arenas, columnsClassName }: { arenas: ConsoleArena[]; columnsClassName: string }) {
  if (arenas.length === 0) {
    return <p className="text-sm text-caption-foreground">В турнире нет активных площадок.</p>;
  }
  return (
    <div data-testid="arenas-grid" className={`grid grid-cols-1 gap-3 ${columnsClassName}`}>
      {arenas.map((arena) => (
        <ConsoleArenaCard key={arena.arenaId} arena={arena} />
      ))}
    </div>
  );
}

/** NominationsCard — карточка «Номинации» (спека 0043, FR-12), общая для мобильной вкладки и десктопной раскладки. */
function NominationsCard({ nominations }: { nominations: ConsoleNomination[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Номинации</CardTitle>
      </CardHeader>
      <CardContent>
        {nominations.length === 0 ? (
          <p className="text-sm text-caption-foreground">В турнире нет номинаций.</p>
        ) : (
          <div className="flex flex-col">
            {nominations.map((nomination) => (
              <ConsoleNominationRow key={nomination.nominationId} nomination={nomination} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** QueueCard — карточка «Очередь на постановку» (спека 0043, FR-13), общая для мобильной вкладки и десктопной раскладки. */
function QueueCard({ items }: { items: ConsoleQueueItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Очередь на постановку</CardTitle>
      </CardHeader>
      <CardContent>
        <ConsoleQueueList items={items} />
      </CardContent>
    </Card>
  );
}

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
 *
 * Мобильная/десктопная композиция (спека 0045, FR-11/FR-15): оба варианта
 * рендерятся в DOM всегда, видимость — классами `md:hidden`/`hidden
 * md:flex` (тот же паттерн, что `admin-nav-drawer.tsx`/`admin-nav-links.tsx`,
 * 0044) — на телефоне «Площадки»/«Номинации»/«Очередь» переключаются
 * вкладками со счётчиком (`Tabs`, `shared/ui/tabs.tsx`), на планшете-и-шире
 * — прежним одновременным потоком без изменений. Лента «Требует внимания»
 * закреплена над вкладками вне зависимости от выбранной (FR-12): компактный
 * вид (`AttentionFeedCompact`) на телефоне, полный (`AttentionFeed`) — на
 * планшете-и-шире.
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
        <div className="md:hidden">
          <AttentionFeedCompact alerts={snapshot.alerts} />
        </div>
        <div className="hidden md:flex md:flex-col md:gap-2">
          <AttentionFeed alerts={snapshot.alerts} />
        </div>
      </section>

      <div className="md:hidden" data-testid="console-mobile">
        <Tabs defaultValue="arenas">
          <TabsList>
            <TabsTrigger value="arenas">Площадки · {snapshot.arenas.length}</TabsTrigger>
            <TabsTrigger value="nominations">Номинации · {snapshot.nominations.length}</TabsTrigger>
            <TabsTrigger value="queue">Очередь · {snapshot.queue.length}</TabsTrigger>
          </TabsList>
          <TabsContent value="arenas" className="pt-3">
            <ArenasGrid arenas={snapshot.arenas} columnsClassName="" />
          </TabsContent>
          <TabsContent value="nominations" className="pt-3">
            <NominationsCard nominations={snapshot.nominations} />
          </TabsContent>
          <TabsContent value="queue" className="pt-3">
            <QueueCard items={snapshot.queue} />
          </TabsContent>
        </Tabs>
      </div>

      <div className="hidden md:flex md:flex-col md:gap-6" data-testid="console-desktop">
        <section aria-label="Площадки" className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-caption-foreground">Площадки</h2>
          <ArenasGrid arenas={snapshot.arenas} columnsClassName="sm:grid-cols-2 xl:grid-cols-3" />
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <NominationsCard nominations={snapshot.nominations} />
          <QueueCard items={snapshot.queue} />
        </div>
      </div>
    </div>
  );
}
