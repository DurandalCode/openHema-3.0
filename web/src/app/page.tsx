import Link from "next/link";
import { Swords } from "lucide-react";
import { getCurrentUser } from "@/entities/user/model/get-current-user";
import { getActiveTournament } from "@/entities/tournament/model/get-active-tournament";
import { getNominations } from "@/entities/nomination/model/get-nominations";
import { siteConfig } from "@/shared/config/site-config";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Col, Row } from "@/shared/ui/stack";
import { AuthCta } from "@/features/auth/ui/auth-cta";
import { TournamentHero } from "@/widgets/tournament-hero/tournament-hero";
import { NominationsList } from "@/widgets/nominations-list/nominations-list";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [user, tournament] = await Promise.all([
    getCurrentUser(),
    getActiveTournament(),
  ]);
  const nominations = await getNominations(tournament?.id ?? "");

  return (
    <Col>
      {/* Hero */}
      <Col
        as="section"
        align="center"
        gap={6}
        className="relative mx-auto w-full max-w-6xl px-4 py-24 text-center md:py-32"
      >
        <Badge
          variant="outline"
          className="gap-2 border-border/60 bg-muted/40 px-3 py-1 text-xs font-normal text-muted-foreground"
        >
          <Swords className="size-3" />
          Платформа для HEMA-сообщества
        </Badge>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-balance md:text-6xl">
          {siteConfig.name}
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground text-pretty md:text-lg">
          {siteConfig.description}.
        </p>
        {user ? (
          <Button size="lg" asChild>
            <Link href="/dashboard">Перейти в кабинет</Link>
          </Button>
        ) : (
          <AuthCta />
        )}
      </Col>

      {/* Tournament */}
      <TournamentHero tournament={tournament} />

      {/* Nominations */}
      <NominationsList nominations={nominations} />

      {/* Footer */}
      <footer className="border-t border-border/60">
        <Row
          align="center"
          justify="between"
          className="mx-auto w-full max-w-6xl px-4 py-6 text-sm text-muted-foreground"
        >
          <span>{siteConfig.name}</span>
          <span>Пет-проект · в разработке</span>
        </Row>
      </footer>
    </Col>
  );
}
