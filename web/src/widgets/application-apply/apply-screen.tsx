"use client";

import Link from "next/link";
import { Button } from "@/shared/ui/button";
import { Col, Row } from "@/shared/ui/stack";
import type { Nomination } from "@/entities/nomination/lib/types";
import { isTerminal, stateLabel } from "@/entities/application/lib/state";
import { useMyApplications } from "@/features/my-applications/api/use-my-applications";
import { ApplyApplicationForm } from "@/features/my-applications/ui/apply-application-form";
import { ApplyWhatNext } from "./apply-what-next";

/**
 * ApplyScreen — экран «Заявка на участие» (спека 0036, макет 14a): шапка со
 * ссылкой возврата в номинацию и подписью «турнир · номинация» (FR-2), затем
 * ровно одна из трёх взаимоисключающих веток:
 *
 * 1. приём открыт, активной заявки у пользователя ещё нет — форма
 *    (`ApplyApplicationForm`) рядом с блоком «Что дальше» (`ApplyWhatNext`),
 *    FR-3/FR-4, AC-1;
 * 2. приём в номинацию завершён (`status !== OPEN`) — объяснение и ссылка
 *    назад в номинацию вместо формы (FR-7, AC-5);
 * 3. у пользователя уже есть активная (нетерминальная) заявка в эту
 *    номинацию — её состояние и ссылка на «Мои заявки» вместо формы (FR-8,
 *    AC-4).
 *
 * `useMyApplications()` — тот же кэш, что использует список «Мои заявки»
 * (ключ общий, лишний запрос на этом экране приемлем — см. риски plan.md).
 */
export function ApplyScreen({
  nomination,
  tournamentName,
}: {
  nomination: Nomination;
  tournamentName?: string | null;
}) {
  const myApplications = useMyApplications();
  const activeApplication = (myApplications.data ?? []).find(
    (application) => application.nominationId === nomination.id && !isTerminal(application.state),
  );

  const isOpen = nomination.status === "NOMINATION_STATUS_OPEN";
  const caption = tournamentName ? `${tournamentName} · ${nomination.title}` : nomination.title;

  return (
    <Col gap={8}>
      <Col gap={2}>
        <Link
          href={`/nominations/${nomination.id}`}
          className="text-sm text-muted-foreground underline underline-offset-2"
        >
          ← {nomination.title}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Заявка на участие</h1>
        <p className="text-muted-foreground">{caption}</p>
      </Col>

      {!isOpen ? (
        <Col gap={3} className="items-start">
          <p className="text-sm text-muted-foreground">
            Приём заявок в эту номинацию завершён — подать заявку уже нельзя.
          </p>
          <Button asChild variant="outline">
            <Link href={`/nominations/${nomination.id}`}>← Вернуться в номинацию</Link>
          </Button>
        </Col>
      ) : activeApplication ? (
        <Col gap={3} className="items-start">
          <p className="text-sm text-muted-foreground">
            Вы уже подали заявку в эту номинацию — {stateLabel(activeApplication.state)}.
          </p>
          <Button asChild variant="outline">
            <Link href="/applications">Мои заявки</Link>
          </Button>
        </Col>
      ) : (
        <Row gap={8} wrap align="start">
          <div className="min-w-[280px] flex-1">
            <ApplyApplicationForm nominationId={nomination.id} />
          </div>
          <div className="w-full shrink-0 lg:w-[320px]">
            <ApplyWhatNext />
          </div>
        </Row>
      )}
    </Col>
  );
}
