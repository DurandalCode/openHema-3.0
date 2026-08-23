import { Swords } from "lucide-react";
import { siteConfig } from "@/shared/config/site-config";
import { Badge } from "@/shared/ui/badge";
import { Col } from "@/shared/ui/stack";
import { getActiveTournament } from "@/entities/tournament/model/get-active-tournament";
import { getNominations } from "@/entities/nomination/model/get-nominations";
import { TournamentAboutScreen } from "@/widgets/tournament-about/tournament-about-screen";

export const dynamic = "force-dynamic";

/**
 * AboutPlatformFallback — прежнее содержимое `/about» («О платформе»),
 * сохранено как запасной вариант (спека 0038, FR-48) на случай отсутствия
 * активного турнира: страница «О турнире» не может показать профиль
 * турнира, которого нет, и не должна превращаться в пустой экран.
 */
function AboutPlatformFallback() {
  return (
    <Col
      as="section"
      align="center"
      gap={6}
      className="mx-auto w-full max-w-3xl px-4 py-16 text-center md:py-24"
    >
      <Badge variant="gold" className="gap-2 px-3 py-1 text-xs font-normal">
        <Swords className="size-3" />
        О платформе
      </Badge>
      <h1 className="max-w-2xl text-3xl font-bold tracking-tight text-balance md:text-5xl">
        {siteConfig.name}
      </h1>
      <p className="max-w-xl text-base text-muted-foreground text-pretty md:text-lg">
        {siteConfig.description}. Раздел пока в разработке — подробнее о
        платформе расскажем здесь по мере готовности остальных фич.
      </p>
    </Col>
  );
}

/**
 * AboutPage — раздел «О турнире» (спека 0038, T13, FR-43..FR-49): серверная
 * обёртка (правило NFR-2/0032 — композиция в виджете, роут только данные +
 * рендер), по образцу `app/applications/page.tsx`. Активного турнира нет —
 * прежний текст о платформе (FR-48, `AboutPlatformFallback`); есть — профиль
 * турнира и его номинации (для CTA и счётчика) в `TournamentAboutScreen`.
 */
export default async function AboutPage() {
  const tournament = await getActiveTournament();
  if (!tournament) {
    return <AboutPlatformFallback />;
  }

  const nominations = await getNominations(tournament.id);

  return <TournamentAboutScreen tournament={tournament} nominations={nominations} />;
}
