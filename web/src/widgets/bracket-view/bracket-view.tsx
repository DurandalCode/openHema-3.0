"use client";

import { MapPin, Medal, Trophy } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Col, Row } from "@/shared/ui/stack";
import { cn } from "@/shared/lib/cn";
import { boutStateLabel, poolStatusLabel, type BoutState, type PoolStatus } from "@/entities/pool/lib/types";
import { slotDisplayName } from "@/entities/bracket/lib/labels";
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
 * PairCard — пара круга: два слота, а если пара материализована — счёт и
 * состояние её боя (FR-13/FR-19). Подсвечивается, если это текущий бой
 * половины круга.
 */
function PairCard({ pair, isCurrent }: { pair: BracketPair; isCurrent: boolean }) {
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
          <span className="text-sm font-medium tabular-nums">
            {bout.scoreA}:{bout.scoreB}
          </span>
          <Badge tone={boutStateTone(bout.state)}>{boutStateLabel(bout.state)}</Badge>
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
        {half.pairs.map((pair) => (
          <PairCard
            key={pair.index}
            pair={pair}
            isCurrent={half.currentBoutId !== "" && pair.bout?.id === half.currentBoutId}
          />
        ))}
      </Col>
    </Col>
  );
}

/** RoundColumn — один круг сетки: заголовок и его половины друг под другом. */
function RoundColumn({ round }: { round: BracketRound }) {
  return (
    <Col gap={3} className="w-[240px] shrink-0">
      <h3 className="text-center text-sm font-semibold text-foreground">{round.title}</h3>
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
            <RoundColumn key={round.number} round={round} />
          ))}
        </Row>
      </div>
    </Col>
  );
}
