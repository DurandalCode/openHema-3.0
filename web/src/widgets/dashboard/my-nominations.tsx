import Link from "next/link";
import { Row } from "@/shared/ui/stack";
import { myNominationProgress } from "@/entities/tournament-live/lib/my-view";
import type { LiveFeedBoutDto } from "@/entities/tournament-live/lib/types";
import type { Participation } from "@/entities/fighter/lib/types";

/**
 * MyNominations — «Мои номинации» кабинета (спека 0038, FR-30..FR-32): одна
 * строка на действующее участие бойца, прогресс контейнера + личный счёт,
 * либо «раскладка ещё не готова», когда снапшот пока не даёт боёв этой
 * номинации бойцу (FR-32). Название — из `nominationTitleById` (SSR-проп,
 * тот же приём, что `MyApplicationsScreen`); незаявленный ключ — без
 * названия, не ошибка.
 */
export function MyNominations({
  participations,
  bouts,
  fighterId,
  nominationTitleById,
}: {
  participations: Participation[];
  bouts: LiveFeedBoutDto[];
  fighterId: string;
  nominationTitleById: Record<string, string>;
}) {
  const active = participations.filter((p) => p.status === "PARTICIPATION_STATUS_ACTIVE");
  if (active.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
        Мои номинации
      </span>
      <div className="flex flex-col gap-2">
        {active.map((p) => {
          const progress = myNominationProgress(bouts, fighterId, p.nominationId);
          return (
            <Link
              key={p.nominationId}
              href={`/nominations/${p.nominationId}`}
              className="rounded-lg border border-border bg-card px-4 py-3 text-sm transition-colors hover:border-primary/50"
            >
              <Row justify="between" align="center" gap={3} wrap>
                <span className="font-bold">
                  {nominationTitleById[p.nominationId] ?? "Номинация"}
                </span>
                {progress ? (
                  <Row gap={3} align="center" wrap>
                    <span className="text-muted-foreground">
                      {progress.containerName} · {progress.done} из {progress.total} боёв
                      проведено
                    </span>
                    <span className="font-mono text-success">{progress.wins} побед</span>
                  </Row>
                ) : (
                  <span className="text-muted-foreground">раскладка ещё не готова</span>
                )}
              </Row>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
