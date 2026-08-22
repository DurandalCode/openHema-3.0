"use client";

import { MapPin, Medal, Trophy } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Col, Row } from "@/shared/ui/stack";
import { cn } from "@/shared/lib/cn";
import { boutScoreLabel, boutStateLabel, poolStatusLabel, type BoutState, type PoolStatus } from "@/entities/pool/lib/types";
import { slotDisplayName } from "@/entities/bracket/lib/labels";
import { bracketFinalRounds } from "@/entities/bracket/lib/types";
import type { Bracket, BracketHalf, BracketPair, BracketRound, BracketSlot } from "@/entities/bracket/lib/types";

/** boutStateTone — статусный тон боя пары (дизайн-система 0022). */
function boutStateTone(state: BoutState): "neutral" | "live" | "success" {
  switch (state) {
    case "BOUT_STATE_IN_PROGRESS":
      return "live";
    case "BOUT_STATE_FINISHED":
      return "success";
    default:
      return "neutral";
  }
}

/** containerStatusTone — статусный тон половины круга (дизайн-система 0022). */
function containerStatusTone(status: PoolStatus): "neutral" | "info" | "warn" | "live" | "success" {
  switch (status) {
    case "POOL_STATUS_READY":
      return "info";
    case "POOL_STATUS_PREPARING":
      return "warn";
    case "POOL_STATUS_ACTIVE":
      return "live";
    case "POOL_STATUS_FINISHED":
      return "success";
    default:
      return "neutral";
  }
}

/**
 * SlotRow — один слот пары: имя бойца, «Бай» пустого слота уже разрешённой
 * пары (FR-9), либо подпись пары-источника ожидающего слота (FR-13).
 */
function SlotRow({ slot, pairResolved }: { slot: BracketSlot; pairResolved: boolean }) {
  const filled = slot.state === "BRACKET_SLOT_STATE_FILLED";
  const pending = slot.state === "BRACKET_SLOT_STATE_PENDING";
  return (
    <Row
      align="center"
      className={cn(
        "rounded-md px-2 py-1 text-sm",
        filled ? "bg-muted font-medium" : "text-muted-foreground",
        pending && "text-xs italic",
      )}
    >
      <span>{slotDisplayName(slot, pairResolved)}</span>
    </Row>
  );
}

/**
 * PairCard — пара круга: два слота, а если пара материализована — счёт
 * (`boutScoreLabel`, спека 0035 FR-13: прочерк у неначатого боя вместо
 * `0:0`) и состояние её боя (FR-19). Подсвечивается, если это текущий бой
 * половины круга; для текущей пары дополнительно показывается площадка
 * половины (спека 0035, FR-17/AC-12) — рядом с самой парой, а не только
 * один раз на уровне половины (`HalfBlock`, FR-19a/спека 0033).
 */
function PairCard({
  pair,
  isCurrent,
  arenaName,
}: {
  pair: BracketPair;
  isCurrent: boolean;
  arenaName?: string;
}) {
  const { bout } = pair;
  return (
    <Col
      gap={1}
      className={cn(
        "rounded-md border bg-card p-2 transition-colors",
        isCurrent && "border-primary outline outline-2 outline-primary/30",
      )}
      data-current={isCurrent || undefined}
    >
      <SlotRow slot={pair.slotA} pairResolved={pair.resolved} />
      <SlotRow slot={pair.slotB} pairResolved={pair.resolved} />
      {bout && (
        <Row align="center" justify="between" gap={2} className="border-t pt-1">
          <span className="text-sm font-medium tabular-nums">{boutScoreLabel(bout)}</span>
          <Badge tone={boutStateTone(bout.state)}>{boutStateLabel(bout.state)}</Badge>
        </Row>
      )}
      {isCurrent && arenaName && (
        <Row align="center" gap={1} className="text-xs text-muted-foreground">
          <MapPin className="size-3" />
          <span>Площадка: {arenaName}</span>
        </Row>
      )}
    </Col>
  );
}

/**
 * HalfBlock — половина круга: подпись контейнера (уже готовая строка от
 * сервера, `container.name`, FR-19a), площадка и исполнительный статус
 * (FR-19, как у группы — 0011/0013), затем её пары. Половина — визуально
 * отдельный блок: при параллельном ведении на двух площадках (FR-12a) статус
 * и арена каждой половины не должны смешиваться в общей ленте.
 */
function HalfBlock({ half }: { half: BracketHalf }) {
  const { container } = half;
  return (
    <Col gap={2} className="min-w-[240px] rounded-lg border bg-card p-3">
      <Col gap={1}>
        <Row align="center" justify="between" gap={2} className="flex-wrap">
          <span className="text-sm font-medium">{container.name}</span>
          <Badge tone={containerStatusTone(container.status)}>{poolStatusLabel(container.status)}</Badge>
        </Row>
        {container.arenaId && (
          <Row align="center" gap={1} className="text-xs text-muted-foreground">
            <MapPin className="size-3" />
            <span>{container.arenaName || "—"}</span>
          </Row>
        )}
      </Col>
      <Col gap={2}>
        {half.pairs.map((pair) => {
          const isCurrent = half.currentBoutId !== "" && pair.bout?.id === half.currentBoutId;
          return (
            <PairCard
              key={pair.index}
              pair={pair}
              isCurrent={isCurrent}
              arenaName={isCurrent ? container.arenaName : undefined}
            />
          );
        })}
      </Col>
    </Col>
  );
}

/** RoundEmphasis — визуальное выделение финала/боя за 3-е место (FR-18). */
type RoundEmphasis = "final" | "third-place";

/**
 * RoundColumn — один круг сетки: заголовок и его половины друг под другом.
 * Финал и бой за 3-е место (`emphasis`, спека 0035, FR-18/AC-13) выделяются
 * акцентным блоком правого края сетки вместо обычной колонки — золотой тон
 * для финала (тот же приём, что и у бейджа чемпиона выше), приглушённый
 * акцент для боя за 3-е место — они остаются раздельными колонками, не
 * сливаясь друг с другом.
 */
function RoundColumn({ round, emphasis }: { round: BracketRound; emphasis?: RoundEmphasis }) {
  return (
    <Col
      gap={3}
      className={cn(
        "w-[240px] shrink-0",
        emphasis === "final" && "rounded-lg border-2 border-gold/60 bg-gold/5 p-2",
        emphasis === "third-place" && "rounded-lg border-2 border-muted-foreground/30 bg-muted/40 p-2",
      )}
      data-emphasis={emphasis}
    >
      <Row align="center" justify="center" gap={1} className="flex-wrap">
        <h3 className="text-center text-sm font-semibold text-foreground">{round.title}</h3>
        {emphasis === "final" && (
          <Badge variant="gold" className="gap-1 text-[10px]">
            <Trophy className="size-3" />
            Финал
          </Badge>
        )}
        {emphasis === "third-place" && (
          <Badge variant="secondary" className="gap-1 text-[10px]">
            <Medal className="size-3" />
            3-е место
          </Badge>
        )}
      </Row>
      <Col gap={4}>
        {round.halves.map((half) => (
          <HalfBlock key={half.half} half={half} />
        ))}
      </Col>
    </Col>
  );
}

/**
 * BracketView — сетка целиком: круги → половины → пары (FR-19). Read-only,
 * общий для админского и публичного экрана. Круги идут горизонтальной
 * прокруткой (`overflow-x-auto`), пары внутри круга — вертикальным стеком:
 * сетка на 32 слота (8 контейнеров первого круга) не растягивает страницу
 * «простынёй» и остаётся читаемой на телефоне (NFR-2).
 */
export function BracketView({ bracket }: { bracket: Bracket }) {
  const { final, thirdPlace } = bracketFinalRounds(bracket);
  return (
    <Col gap={4}>
      {(bracket.champion || bracket.thirdPlaceWinner) && (
        <Row gap={2} className="flex-wrap">
          {bracket.champion && (
            <Badge variant="gold" className="gap-1 text-sm">
              <Trophy className="size-3.5" />
              Чемпион: {bracket.champion.name}
            </Badge>
          )}
          {bracket.thirdPlaceWinner && (
            <Badge variant="secondary" className="gap-1 text-sm">
              <Medal className="size-3.5" />
              3-е место: {bracket.thirdPlaceWinner.name}
            </Badge>
          )}
        </Row>
      )}
      <div className="overflow-x-auto">
        <Row gap={4} align="start" className="w-max pb-2">
          {bracket.rounds.map((round) => (
            <RoundColumn
              key={round.number}
              round={round}
              emphasis={round === final ? "final" : round === thirdPlace ? "third-place" : undefined}
            />
          ))}
        </Row>
      </div>
    </Col>
  );
}
