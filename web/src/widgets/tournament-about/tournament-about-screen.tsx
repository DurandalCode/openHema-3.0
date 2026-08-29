import Link from "next/link";
import { Swords } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Col, Row } from "@/shared/ui/stack";
import type { Tournament } from "@/entities/tournament/lib/types";
import type { Nomination } from "@/entities/nomination/lib/types";
import { regulationsHref } from "@/entities/tournament/lib/files";
import { RegulationsLink } from "@/entities/tournament/ui/regulations-link";
import { TournamentProgram } from "@/entities/tournament/ui/tournament-program";
import { AboutFacts } from "./about-facts";
import { AboutOrganizers } from "./about-organizers";

/**
 * TournamentAboutScreen — экран «О турнире» (спека 0038, T13, макет 20a):
 * профиль активного турнира вместо прежней статичной заглушки о платформе
 * (FR-43). Композиция чистая (без хуков): название/описание, плитки-факты
 * (`AboutFacts`), ссылка на регламент (`RegulationsLink`), блок
 * организаторов (`AboutOrganizers`) и CTA (FR-47).
 *
 * `canApply` не приходит отдельным пропом от вызывающего роута — вычисляется
 * прямо здесь из `nominations[].status`, тем же правилом, что уже применяет
 * `widgets/home/home-screen.tsx` (`anyRegistrationOpen`) и
 * `widgets/application-apply/apply-screen.tsx` (`isOpen`):
 * `status === "NOMINATION_STATUS_OPEN"`. Отдельный проп добавлял бы
 * дублирующее вычисление в `app/about/page.tsx` без выгоды — признак уже
 * есть в передаваемых пропах, expected по плану 0038 как раз для этого
 * случая («если такого явного признака у номинации нет в пропах» — здесь
 * он есть).
 *
 * CTA «Подать заявку» ведёт на секцию номинаций главной (`/#nominations`,
 * где выбирается конкретная номинация — сама страница «О турнире» не
 * привязана к одной), «Живой ход турнира» — на главную (`/`), где
 * отображается лента боёв/площадок, пока турнир идёт.
 */
export function TournamentAboutScreen({
  tournament,
  nominations,
}: {
  tournament: Tournament;
  nominations: Nomination[];
}) {
  const canApply = nominations.some((n) => n.status === "NOMINATION_STATUS_OPEN");

  return (
    <Col
      as="section"
      gap={8}
      className="mx-auto w-full max-w-4xl px-4 py-16 md:py-24"
    >
      <Col align="center" gap={4} className="text-center">
        <Badge variant="gold" className="gap-2 px-3 py-1 text-xs font-normal">
          <Swords className="size-3" />О турнире
        </Badge>
        <h1 className="max-w-2xl text-3xl font-bold tracking-tight text-balance md:text-5xl">
          {tournament.title}
        </h1>
        {tournament.description && (
          <p className="max-w-xl text-base text-muted-foreground text-pretty md:text-lg">
            {tournament.description}
          </p>
        )}
      </Col>

      <AboutFacts tournament={tournament} nominationsCount={nominations.length} />

      <RegulationsLink url={regulationsHref(tournament)} />

      <TournamentProgram program={tournament.program} />

      <AboutOrganizers chiefJudge={tournament.chiefJudge} contacts={tournament.contacts} />

      <Row gap={3} wrap justify="center">
        {canApply && (
          <Button asChild>
            <Link href="/#nominations">Подать заявку</Link>
          </Button>
        )}
        <Button asChild variant="outline">
          <Link href="/">Живой ход турнира</Link>
        </Button>
      </Row>
    </Col>
  );
}
