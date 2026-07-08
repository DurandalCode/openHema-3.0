import Link from "next/link";
import { Swords, Users, Trophy } from "lucide-react";
import { getCurrentUser } from "@/entities/user/model/get-current-user";
import { getActiveTournament } from "@/entities/tournament/model/get-active-tournament";
import { siteConfig } from "@/shared/config/site-config";
import { Button } from "@/shared/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { AuthCta } from "@/features/auth/ui/auth-cta";
import { TournamentHero } from "@/widgets/tournament-hero/tournament-hero";

export const dynamic = "force-dynamic";

const features = [
  {
    icon: Trophy,
    title: "Турниры",
    description:
      "Создание и проведение турниров. Сетки, расписания, результаты — в одном месте.",
  },
  {
    icon: Users,
    title: "Участники",
    description:
      "Регистрация бойцов, управление составами, рейтинги и история выступлений.",
  },
  {
    icon: Swords,
    title: "Судейство",
    description:
      "Протоколы поединков, баллы судей, обмен ударами в реальном времени.",
  },
];

export default async function HomePage() {
  const [user, tournament] = await Promise.all([
    getCurrentUser(),
    getActiveTournament(),
  ]);

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-4 py-24 text-center md:py-32">
        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
          <Swords className="size-3" />
            Платформа для HEMA-сообщества
        </div>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-balance md:text-6xl">
          {siteConfig.name}
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground text-pretty md:text-lg">
          {siteConfig.description}. Создавайте турниры, регистрируйте
          участников и ведите судейство поединков в единой системе.
        </p>
        {user ? (
          <Button size="lg" asChild>
            <Link href="/dashboard">Перейти в кабинет</Link>
          </Button>
        ) : (
          <AuthCta />
        )}
      </section>

      {/* Features */}
      <section
        id="features"
        className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-16 md:py-24"
      >
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Возможности
          </h2>
          <p className="mt-3 text-muted-foreground">
            Базовый набор функций платформы. Расширяется по мере развития.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {features.map((f) => (
            <Card key={f.title}>
              <CardHeader>
                <div className="flex size-10 items-center justify-center rounded-lg border bg-muted">
                  <f.icon className="size-5 text-foreground" />
                </div>
                <CardTitle className="mt-2">{f.title}</CardTitle>
                <CardDescription>{f.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      {/* Tournament */}
      <TournamentHero tournament={tournament} />

      {/* Footer */}
      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-6 text-sm text-muted-foreground">
          <span>{siteConfig.name}</span>
          <span>Пет-проект · в разработке</span>
        </div>
      </footer>
    </div>
  );
}
