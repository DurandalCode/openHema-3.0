"use client";

import Link from "next/link";
import { EmptyState } from "@/shared/ui/empty-state";
import { SkeletonCards } from "@/shared/ui/skeletons";
import { Col, Row } from "@/shared/ui/stack";
import { useMyApplications } from "@/features/my-applications/api/use-my-applications";
import { ApplicationCard } from "@/features/my-applications/ui/application-card";

const PREVIEW_COUNT = 2;

/**
 * MyApplicationsPreview — «Мои заявки» кабинета (спека 0038, FR-28/FR-29):
 * первые `PREVIEW_COUNT` заявок (переиспользует `ApplicationCard` из 0036,
 * не отдельную мини-карточку — то же состояние/тональность/действия) и
 * ссылка на полный список. Пусто — приглашение подать заявку (FR-29), а не
 * пустое место.
 */
export function MyApplicationsPreview({
  nominationTitleById,
}: {
  nominationTitleById: Record<string, string>;
}) {
  const { data: applications, isLoading } = useMyApplications();

  return (
    <Col gap={3}>
      <Row justify="between" align="baseline">
        <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
          Мои заявки
        </span>
        <Link href="/applications" className="text-xs underline underline-offset-2">
          Все заявки →
        </Link>
      </Row>

      {isLoading ? (
        <SkeletonCards count={PREVIEW_COUNT} />
      ) : !applications || applications.length === 0 ? (
        <EmptyState
          title="Заявок пока нет"
          hint="Выберите номинацию и подайте заявку — она появится здесь."
        >
          <Link
            href="/#nominations"
            className="text-sm underline underline-offset-2 hover:text-foreground"
          >
            Список номинаций
          </Link>
        </EmptyState>
      ) : (
        <Col gap={3}>
          {applications.slice(0, PREVIEW_COUNT).map((application) => (
            <ApplicationCard
              key={application.id}
              application={application}
              nominationTitle={nominationTitleById[application.nominationId]}
            />
          ))}
        </Col>
      )}
    </Col>
  );
}
