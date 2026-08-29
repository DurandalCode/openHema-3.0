import { Swords, Trophy } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/shared/ui/card";
import { Col, Row } from "@/shared/ui/stack";
import type { Tournament } from "../lib/types";
import {
  contactHref,
  contactLabel,
  daysUntil,
  formatEntryFee,
  formatEventRange,
  venueLine,
} from "../lib/format";
import { emblemSrc, regulationsHref } from "../lib/files";
import { RegulationsLink } from "./regulations-link";
import { TournamentProgram } from "./tournament-program";

/**
 * countdownLabel — текст обратного отсчёта афиши (спека 0034, FR-4).
 * `null` — дата начала не задана/невалидна, либо уже наступила/прошла
 * (`daysUntil` < 0): афиша «до старта» не показывает отсчёт задним числом,
 * это уже не её фаза (`tournamentPhase` решает, что турнир идёт/завершён).
 * Точная формулировка границ (N=0/N=1) не задана спекой жёстко — решение
 * этого файла: «сегодня»/«завтра» читаются как факт, а не как «через 0/1
 * дней».
 */
function countdownLabel(days: number | null): string | null {
  if (days === null || days < 0) return null;
  if (days === 0) return "до старта: сегодня";
  if (days === 1) return "до старта: завтра";
  return `до старта: ${days} дней`;
}

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
 * сервере (главная), и на клиенте (превью).
 *
 * `now` (спека 0034, FR-4/AC-1/AC-2) — опора для обратного отсчёта «до
 * старта N дней». Опционален и по умолчанию берётся как `new Date()` в теле
 * функции (вычисляется при каждом вызове, а не один раз при загрузке
 * модуля) — это сознательный компромисс: оба существующих вызывающих места
 * (`app/page.tsx`, `TournamentPreview` живого превью 0029) не обязаны знать
 * о новом пропе и продолжают работать без изменений, а тесты этого файла
 * передают `now` явно для детерминированности. Будущая композиция
 * `widgets/home/home-screen.tsx` (T23) сможет передавать `now` осознанно
 * (например, синхронизированным с `serverNowUnixMs` живой сводки).
 *
 * `arenasCount` (спека 0039, FR-4/AC-3) — число площадок турнира.
 * **Опционален**: компонент остаётся презентационным и не ходит за
 * площадками сам — если проп не передан, счётчик не рендерится вовсе (как и
 * при `0`, когда площадок фактически ещё нет — правило 0001, «ни прочерков,
 * ни заглушек»). Считает и передаёт его вызывающая композиция
 * (`widgets/home/home-screen.tsx` — из уже загруженного `liveSnapshot`),
 * живое превью настроек турнира (`features/tournament-settings`) его не
 * передаёт — площадки не его данные.
 */
export function TournamentHero({
  tournament,
  now = new Date(),
  arenasCount,
}: {
  tournament: Tournament | null;
  now?: Date;
  arenasCount?: number;
}) {
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
  const countdown = countdownLabel(daysUntil(tournament.eventStartAt || null, now));
  const contacts = tournament.contacts.filter((c) => c.value);

  // Факты турнира (спека 0039, FR-1/FR-2/FR-4): место, взнос, число
  // площадок. Каждый — независимо опциональный (FR-5, правило 0001): пустое
  // поле просто не попадает в строку, вместо прочерка или заглушки.
  const venue = venueLine(tournament);
  const fee = formatEntryFee(tournament.entryFeeMinor, tournament.entryFeeCurrency);
  const hasArenasCount = arenasCount !== undefined && arenasCount > 0;
  const hasFacts = venue !== "" || fee !== null || hasArenasCount;

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
          {emblemSrc(tournament) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={emblemSrc(tournament)}
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
          {countdown && (
            <Badge tone="info" className="text-xs font-normal normal-case tracking-normal">
              {countdown}
            </Badge>
          )}
        </Col>

        {tournament.description && (
          <p className="max-w-2xl text-pretty text-base text-muted-foreground md:text-lg">
            {tournament.description}
          </p>
        )}

        {hasFacts && (
          <Row
            align="center"
            justify="center"
            gap={4}
            wrap
            className="text-sm text-muted-foreground"
          >
            {venue && <span>{venue}</span>}
            {fee !== null && <span>Взнос: {fee}</span>}
            {hasArenasCount && <span>Площадок: {arenasCount}</span>}
          </Row>
        )}

        <RegulationsLink url={regulationsHref(tournament)} />

        <TournamentProgram program={tournament.program} />

        {contacts.length > 0 && (
          <Row align="center" justify="center" gap={3} wrap>
            {contacts.map((c, i) => (
              <Button key={c.id ?? i} variant="outline" size="sm" asChild>
                <a
                  href={contactHref(c.type, c.value)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {contactLabel(c.type)}: {c.value}
                </a>
              </Button>
            ))}
          </Row>
        )}
      </Col>
    </section>
  );
}
