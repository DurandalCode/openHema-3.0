"use client";

import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Col, Row } from "@/shared/ui/stack";
import { allowedApplicantActions, stateLabel } from "@/entities/application/lib/state";
import type { Application } from "@/entities/application/lib/types";
import { useMyApplications } from "../api/use-my-applications";
import { useDeclarePayment } from "../api/use-declare-payment";
import { useWithdrawApplication } from "../api/use-withdraw-application";

/** MyApplicationsList — раздел кабинета «Мои заявки»: статус, действия
 * заявителя (оплатить/отозвать), гейтинг по состоянию (FR-4/FR-6). */
export function MyApplicationsList() {
  const { data: applications = [], isLoading } = useMyApplications();

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }
  if (applications.length === 0) {
    return <p className="text-sm text-muted-foreground">Заявок пока нет.</p>;
  }

  return (
    <Col gap={3}>
      {applications.map((app) => (
        <ApplicationRow key={app.id} application={app} />
      ))}
    </Col>
  );
}

function ApplicationRow({ application }: { application: Application }) {
  const declare = useDeclarePayment();
  const withdraw = useWithdrawApplication();
  const actions = allowedApplicantActions(application.state);
  const error = declare.error?.message ?? withdraw.error?.message ?? null;

  return (
    <Card>
      <CardContent className="pt-6">
        <Row align="center" justify="between" gap={4} wrap>
          <Col gap={1}>
            <Badge variant="outline">{stateLabel(application.state)}</Badge>
          </Col>
          <Row gap={2}>
            {actions.includes("declarePayment") && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                loading={declare.isPending}
                onClick={() => declare.mutate(application.id)}
              >
                Я оплатил
              </Button>
            )}
            {actions.includes("withdraw") && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                loading={withdraw.isPending}
                onClick={() => withdraw.mutate(application.id)}
              >
                Отозвать
              </Button>
            )}
          </Row>
        </Row>
        {error && (
          <Alert variant="destructive" className="mt-3">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
