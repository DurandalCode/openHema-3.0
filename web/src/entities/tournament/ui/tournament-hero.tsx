import { Swords, Trophy } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/shared/ui/card";
import { Col, Row } from "@/shared/ui/stack";
import type { ContactType, Tournament } from "../lib/types";
import { contactHref, formatEventRange } from "../lib/format";

const CONTACT_LABELS: Partial<Record<ContactType, string>> = {
  CONTACT_TYPE_TELEGRAM: "Telegram",
  CONTACT_TYPE_VK: "VK",
  CONTACT_TYPE_FACEBOOK: "Facebook",
  CONTACT_TYPE_WEBSITE: "Сайт",
  CONTACT_TYPE_EMAIL: "Email",
  CONTACT_TYPE_OTHER: "Контакт",
};

/** TournamentHero — секция главной с профилем активного турнира.
 * Пустые поля скрываются (FR-6/AC-4): пустой турник или вовсе отсутствие
 * турнира показывают мягкую заглушку.
 *
 * Общий блок для главной (`app/page.tsx`) и живого превью редактора
 * (`features/tournament-settings`, spec 0029 FR-3) — переехал сюда из
 * `widgets/tournament-hero/` (spec 0029, обзор п.1): `features` не может
 * импортировать `widgets` (FSD), а расхождение превью с главной хуже, чем
 * общий компонент на уровне `entities`. Разметка и классы — без изменений.
 *
 * Презентационный: без хуков и server-only импортов — рендерится и на
 * сервере (главная), и на клиенте (превью). */
export function TournamentHero({ tournament }: { tournament: Tournament | null }) {
  // Турнира нет — спокойная заглушка (см. FR-6).
  if (!tournament || !tournament.title) {
    return (
      <section
        id="tournament"
        className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-16 md:py-24"
      >
        <Card className="border-dashed">
          <CardHeader className="items-center text-center">
            <Trophy className="size-8 text-muted-foreground" />
            <CardTitle>Турнир скоро появится</CardTitle>
            <CardDescription>
              Организаторы ещё заполняют профиль турнира. Загляните позже.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  const eventRange = formatEventRange(tournament.eventStartAt, tournament.eventEndAt);
  const contacts = tournament.contacts.filter((c) => c.value);

  return (
    <section
      id="tournament"
      className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-16 md:py-24"
    >
      <Col align="center" gap={8} className="text-center">
        <Badge variant="gold" className="gap-2 px-3 py-1 text-xs font-normal">
          <Swords className="size-3" />
          Активный турнир
        </Badge>

        <Col align="center" gap={4}>
          {tournament.emblemUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tournament.emblemUrl}
              alt={tournament.title}
              className="size-24 rounded-full object-cover ring-1 ring-border/60"
            />
          )}
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            {tournament.title}
          </h2>
          {eventRange && (
            <p className="text-muted-foreground text-lg">{eventRange}</p>
          )}
        </Col>

        {tournament.description && (
          <p className="max-w-2xl text-pretty text-base text-muted-foreground md:text-lg">
            {tournament.description}
          </p>
        )}

        {contacts.length > 0 && (
          <Row align="center" justify="center" gap={3} wrap>
            {contacts.map((c, i) => (
              <Button key={c.id ?? i} variant="outline" size="sm" asChild>
                <a
                  href={contactHref(c.type, c.value)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {CONTACT_LABELS[c.type] ?? "Контакт"}: {c.value}
                </a>
              </Button>
            ))}
          </Row>
        )}
      </Col>
    </section>
  );
}
