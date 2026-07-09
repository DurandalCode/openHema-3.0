import { FileText, Swords, Users } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Col, Row } from "@/shared/ui/stack";
import type { Nomination } from "@/entities/nomination/lib/types";

/** NominationsList — секция публичной страницы турнира со списком номинаций.
 * Пустые поля скрываются (FR-12/AC-10); при отсутствии номинаций секция не
 * рендерится вовсе, чтобы не занимать место на странице.
 *
 * Server component: данные приходят через props из `getNominations()`. */
export function NominationsList({ nominations }: { nominations: Nomination[] }) {
  if (nominations.length === 0) return null;

  return (
    <section
      id="nominations"
      className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-16 md:py-24"
    >
      <Col align="center" gap={8}>
        <Badge
          variant="outline"
          className="gap-2 border-border/60 bg-muted/40 px-3 py-1 text-xs font-normal text-muted-foreground"
        >
          <Swords className="size-3" />
          Номинации
        </Badge>
        <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">
          Номинации турнира
        </h2>
        <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {nominations.map((n) => (
            <Card key={n.id}>
              <CardHeader>
                <CardTitle>{n.title}</CardTitle>
                {n.description && <CardDescription>{n.description}</CardDescription>}
              </CardHeader>
              {(n.fighterCapacity !== null || n.metadata.rulesUrl) && (
                <CardContent>
                  <Col gap={2} className="text-sm text-muted-foreground">
                    {n.fighterCapacity !== null && (
                      <Row align="center" gap={2}>
                        <Users className="size-4" />
                        <span>До {n.fighterCapacity} бойцов</span>
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
                  </Col>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      </Col>
    </section>
  );
}
