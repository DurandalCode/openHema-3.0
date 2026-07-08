import { Swords, Trophy } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/shared/ui/card";
import type { ContactType, Tournament } from "@/entities/tournament/lib/types";

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
 * Server component: данные приходят через props из `getActiveTournament()`. */
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
      <div className="flex flex-col items-center gap-8 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
          <Swords className="size-3" />
          Активный турнир
        </div>

        <div className="flex flex-col items-center gap-4">
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
        </div>

        {tournament.description && (
          <p className="max-w-2xl text-pretty text-base text-muted-foreground md:text-lg">
            {tournament.description}
          </p>
        )}

        {contacts.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-3">
            {contacts.map((c, i) => (
              <a
                key={c.id ?? i}
                href={contactHref(c.type, c.value)}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-border/60 px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
              >
                {CONTACT_LABELS[c.type] ?? "Контакт"}: {c.value}
              </a>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/** formatEventRange формирует человекочитаемый диапазон дат проведения.
 * - только start: «1 декабря 2026 г., 10:00» (однодневный).
 * - start + end, разные дни: «1 декабря 2026 г., 10:00 — 3 декабря 2026 г., 18:00».
 * - start + end, один день: «1 декабря 2026 г., 10:00 — 18:00» (только время).
 * Опционально: оба поля пусты → null ( hero скрывает строку, FR-6/AC-7). */
export function formatEventRange(startIso: string, endIso: string): string | null {
  let start = startIso ? new Date(startIso) : null;
  let end = endIso ? new Date(endIso) : null;
  if (start && Number.isNaN(start.getTime())) start = null;
  if (end && Number.isNaN(end.getTime())) end = null;
  if (!start && !end) return null;

  const startStr = start ? formatDateTime(start) : null;
  if (start && end) {
    const sameDay =
      start.toDateString() === end.toDateString();
    const endStr = sameDay ? formatTime(end) : formatDateTime(end);
    return `${startStr} — ${endStr}`;
  }
  if (start) return startStr;
  if (end) return `до ${formatDateTime(end)}`;
  return null;
}

function formatDateTime(d: Date): string {
  return d.toLocaleString("ru-RU", { dateStyle: "long", timeStyle: "short" });
}

function formatTime(d: Date): string {
  return d.toLocaleString("ru-RU", { timeStyle: "short" });
}

/** contactHref превращает пару (тип, значение) в URL ссылки. */
export function contactHref(type: ContactType, value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  switch (type) {
    case "CONTACT_TYPE_TELEGRAM":
      return value.startsWith("@")
        ? `https://t.me/${value.slice(1)}`
        : `https://t.me/${value}`;
    case "CONTACT_TYPE_VK":
      return /^https?:\/\//i.test(value)
        ? value
        : `https://vk.com/${value.replace(/^\//, "")}`;
    case "CONTACT_TYPE_FACEBOOK":
      return /^https?:\/\//i.test(value)
        ? value
        : `https://facebook.com/${value.replace(/^\//, "")}`;
    case "CONTACT_TYPE_EMAIL":
      return value.includes(":") ? value : `mailto:${value}`;
    case "CONTACT_TYPE_WEBSITE":
    case "CONTACT_TYPE_OTHER":
    default:
      return value;
  }
}