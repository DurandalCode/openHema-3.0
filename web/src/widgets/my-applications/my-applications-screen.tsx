"use client";

import Link from "next/link";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { SkeletonCards } from "@/shared/ui/skeletons";
import { Col } from "@/shared/ui/stack";
import { useMyApplications } from "@/features/my-applications/api/use-my-applications";
import { ApplicationCard } from "@/features/my-applications/ui/application-card";

/**
 * MyApplicationsScreen — экран «Мои заявки» (спека 0036, 15a): скелетон в
 * форме карточек при загрузке (FR-24), оформленная ошибка с повтором вместо
 * пустого списка при отказе запроса (FR-24/AC-12), пустое состояние со
 * ссылкой на номинации (FR-25/AC-13), иначе — список `ApplicationCard`.
 * Название номинации берётся из `nominationTitleById` (пропа с сервера,
 * NFR-плана «названия — SSR-проп, не query»); промах по ключу — карточка
 * без названия (FR-26).
 *
 * Заголовок — простой `<h1>`+`<p>` (не админский `PageHeader`, публичный
 * экран без действий/статуса в шапке).
 */
export function MyApplicationsScreen({
  nominationTitleById,
}: {
  nominationTitleById: Record<string, string>;
}) {
  const { data: applications, isLoading, isError, refetch } = useMyApplications();

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Мои заявки</h1>
      <p className="mt-2 text-muted-foreground">
        Статус и история ваших заявок на участие в турнире.
      </p>
      <div className="mt-8">
        {isLoading ? (
          <SkeletonCards count={2} />
        ) : isError ? (
          <Col gap={3} align="start">
            <p className="text-sm text-destructive">Не удалось загрузить заявки</p>
            <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
              Повторить
            </Button>
          </Col>
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
            {applications.map((application) => (
              <ApplicationCard
                key={application.id}
                application={application}
                nominationTitle={nominationTitleById[application.nominationId]}
              />
            ))}
          </Col>
        )}
      </div>
    </div>
  );
}
