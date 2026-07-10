import { Swords } from "lucide-react";
import { siteConfig } from "@/shared/config/site-config";
import { Badge } from "@/shared/ui/badge";
import { Col } from "@/shared/ui/stack";

export const dynamic = "force-dynamic";

/**
 * AboutPage — раздел «О платформе» (FR-8). Сейчас краткая заготовка;
 * подробное наполнение — по мере готовности остальных фич.
 */
export default function AboutPage() {
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
