"use client";

import { Col } from "@/shared/ui/stack";
import type { Nomination } from "@/entities/nomination/lib/types";
import type { NominationLiveSnapshotDto } from "@/entities/nomination-live/lib/types";
import { nominationPosition } from "@/entities/nomination-live/lib/position";
import { schemaChain } from "@/entities/stage/lib/schema-chain";
import { useNominationLive } from "@/features/nomination-live/api/use-nomination-live";
import { NominationHeader } from "@/widgets/nomination-public/nomination-header";
import { SchemaChain } from "@/widgets/nomination-public/schema-chain";
import { StageSection } from "@/widgets/nomination-public/stage-section";
import { EmptyLayout } from "@/widgets/nomination-public/empty-layout";
import { NominationResults } from "@/widgets/nomination-results/nomination-results";

/**
 * NominationPublicScreen — композиция публичной страницы номинации (спека
 * 0035, NFR-2): шапка → итоги (`NominationResults`, только доигранные
 * секции — сам компонент ничего не рендерит, если показывать нечего) →
 * цепочка схемы (`SchemaChain`, тоже сама решает не рендериться при пустом
 * списке этапов, AC-5) → секции этапов. Пока ни один пул и ни одна сетка не
 * зафиксированы (FR-23/AC-6), секции этапов заменяются оформленным пустым
 * состоянием — шапка и цепочка схемы остаются на месте. Единственная точка
 * входа в живой канал (`useNominationLive`) на весь экран — засеяна
 * SSR-снапшотом, обновляется без перезагрузки страницы (FR-24).
 */
export function NominationPublicScreen({
  nominationId,
  nomination,
  initialSnapshot,
}: {
  nominationId: string;
  nomination: Nomination;
  initialSnapshot: NominationLiveSnapshotDto;
}) {
  const snapshot = useNominationLive(nominationId, initialSnapshot);
  const { stages, pools, brackets, results } = snapshot;

  const position = nominationPosition(snapshot);
  const chain = schemaChain(stages);
  const draft = pools.length === 0 && brackets.length === 0;
  const orderedStages = [...stages].sort(
    (a, b) => a.position - b.position || a.title.localeCompare(b.title),
  );

  return (
    <Col gap={8}>
      <NominationHeader nomination={nomination} position={position} />
      <NominationResults results={results} />
      <SchemaChain chain={chain} />
      {draft ? (
        <EmptyLayout />
      ) : (
        <Col gap={8}>
          {orderedStages.map((stage) => (
            <StageSection
              key={stage.id}
              stage={stage}
              stages={stages}
              pools={pools.filter((p) => p.pool.stageId === stage.id)}
              bracket={brackets.find((b) => b.stage.id === stage.id) ?? null}
            />
          ))}
        </Col>
      )}
    </Col>
  );
}
