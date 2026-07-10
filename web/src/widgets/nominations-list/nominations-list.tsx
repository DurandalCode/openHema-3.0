import { CheckCircle2, FileText, Swords, Users } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/shared/ui/card";
import { Col, Row } from "@/shared/ui/stack";
import type { Nomination } from "@/entities/nomination/lib/types";
import type { NominationParticipants } from "@/entities/application/lib/types";
import { SubmitApplicationButton } from "@/features/my-applications/ui/submit-application-button";

/** NominationsList — секция публичной страницы турнира со списком номинаций.
 * Пустые поля скрываются (FR-12/AC-10); при отсутствии номинаций секция не
 * рендерится вовсе, чтобы не занимать место на странице.
 *
 * Стартовый лист (имена заявленных/подтверждённых) и счётчик
 * «заявлено · подтверждено / лимит» — публичны (FR-15/FR-16). Кнопка «Подать
 * заявку» видна только аутентифицированному пользователю (FR-1/FR-11).
 *
 * Server component: данные приходят через props из `getNominations()` и
 * `getNominationParticipants()`. */
export function NominationsList({
  nominations,
  participantsByNomination,
  isAuthenticated,
}: {
  nominations: Nomination[];
  participantsByNomination: Record<string, NominationParticipants>;
  isAuthenticated: boolean;
}) {
  if (nominations.length === 0) return null;

  return (
    <section
      id="nominations"
      className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-16 md:py-24"
    >
      <Col align="center" gap={8}>
        <Badge variant="gold" className="gap-2 px-3 py-1 text-xs font-normal">
          <Swords className="size-3" />
          Номинации
        </Badge>
        <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">
          Номинации турнира
        </h2>
        <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {nominations.map((n) => {
            const participants = participantsByNomination[n.id];
            return (
              <Card key={n.id}>
                <CardHeader>
                  <CardTitle>{n.title}</CardTitle>
                  {n.description && <CardDescription>{n.description}</CardDescription>}
                </CardHeader>
                <CardContent>
                  <Col gap={3} className="text-sm text-muted-foreground">
                    {participants && (
                      <Row align="center" gap={2}>
                        <Users className="size-4" />
                        <span>
                          Заявлено {participants.appliedCount} · подтверждено{" "}
                          {participants.confirmedCount}
                          {participants.fighterCapacity !== null &&
                            ` / ${participants.fighterCapacity}`}
                        </span>
                      </Row>
                    )}
                    {n.metadata.rulesUrl && (
                      <Row align="center" gap={2}>
                        <FileText className="size-4" />
                        <a
                          href={n.metadata.rulesUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-2 hover:text-foreground"
                        >
                          Правила
                        </a>
                      </Row>
                    )}
                    {participants && participants.participants.length > 0 && (
                      <Col gap={1}>
                        {participants.participants.map((p, i) => (
                          <Row key={i} align="center" gap={2}>
                            {p.state === "APPLICATION_STATE_PAID" ||
                            p.state === "APPLICATION_STATE_REGISTERED" ? (
                              <CheckCircle2 className="size-3.5 text-primary" />
                            ) : (
                              <span className="size-3.5" />
                            )}
                            <span>{p.displayName}</span>
                          </Row>
                        ))}
                      </Col>
                    )}
                    {isAuthenticated && <SubmitApplicationButton nominationId={n.id} />}
                  </Col>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </Col>
    </section>
  );
}
