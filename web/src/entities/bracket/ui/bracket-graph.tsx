"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Medal, Trophy } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/cn";
import {
  boutScoreLabel, boutStateLabel, poolStatusLabel,
  type BoutState, type PoolStatus,
} from "@/entities/pool/lib/types";
import { slotDisplayName } from "../lib/labels";
import { bracketFinalRounds, type Bracket, type BracketPair, type BracketSlot } from "../lib/types";
import { buildGraphLayout, type GraphNode } from "../lib/graph-layout";

function boutTone(state: BoutState): "neutral" | "live" | "success" {
  if (state === "BOUT_STATE_IN_PROGRESS") return "live";
  if (state === "BOUT_STATE_FINISHED") return "success";
  return "neutral";
}

function poolTone(status: PoolStatus): "neutral" | "info" | "warn" | "live" | "success" {
  switch (status) {
    case "POOL_STATUS_READY": return "info";
    case "POOL_STATUS_PREPARING": return "warn";
    case "POOL_STATUS_ACTIVE": return "live";
    case "POOL_STATUS_FINISHED": return "success";
    default: return "neutral";
  }
}

function SlotRow({ slot, pair, ready }: { slot: BracketSlot; pair: BracketPair; ready: boolean }) {
  const other = slot.slot === pair.slotA.slot ? pair.slotB : pair.slotA;
  const bye = ready && pair.resolved && slot.state === "BRACKET_SLOT_STATE_EMPTY"
    && other.state === "BRACKET_SLOT_STATE_FILLED";
  const name = slot.state === "BRACKET_SLOT_STATE_EMPTY"
    ? (bye ? "Бай" : "Нет участника")
    : slotDisplayName(slot, pair.resolved);
  return (
    <div className={cn(
      "min-w-0 rounded-md px-2 py-1 text-sm break-words whitespace-normal",
      slot.state === "BRACKET_SLOT_STATE_FILLED" ? "bg-muted font-medium" : "text-muted-foreground",
      slot.state === "BRACKET_SLOT_STATE_PENDING" && "italic",
    )}>
      {name}
    </div>
  );
}

function PairCard({ node, ready }: { node: GraphNode; ready: boolean }) {
  const { pair, half } = node;
  const current = !!half.currentBoutId && pair.bout?.id === half.currentBoutId;
  return (
    <div className={cn(
      "rounded-md border bg-card p-2 shadow-sm",
      current && "border-primary outline outline-2 outline-primary/30",
    )} style={{ minHeight: node.height }} data-current={current || undefined}>
      <div data-graph-content>
      <div className="mb-1 text-xs font-semibold text-muted-foreground">Пара {pair.index}</div>
      <div className="flex flex-col gap-1">
        <SlotRow slot={pair.slotA} pair={pair} ready={ready} />
        <SlotRow slot={pair.slotB} pair={pair} ready={ready} />
      </div>
      {pair.bout && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-1 border-t pt-1">
          <span className="text-sm font-medium tabular-nums">{boutScoreLabel(pair.bout)}</span>
          <Badge tone={boutTone(pair.bout.state)}>{boutStateLabel(pair.bout.state)}</Badge>
        </div>
      )}
      {current && half.container.arenaName && (
        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="size-3 shrink-0" />
          <span className="break-words">Площадка: {half.container.arenaName}</span>
        </div>
      )}
      </div>
    </div>
  );
}

/** The same read-only bracket graph is used by the admin and public views. */
export function BracketGraph({ bracket }: { bracket: Bracket }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<HTMLDivElement>(null);
  const previousStageId = useRef(bracket.stage.id);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [measured, setMeasured] = useState(false);
  const layout = useMemo(() => buildGraphLayout(bracket, heights), [bracket, heights]);
  const { final, thirdPlace } = bracketFinalRounds(bracket);
  const ready = bracket.stage.status === "POOL_LAYOUT_STATUS_READY";

  useEffect(() => {
    if (previousStageId.current === bracket.stage.id) return;
    previousStageId.current = bracket.stage.id;
    setHeights({});
    setMeasured(false);
    if (viewportRef.current) {
      viewportRef.current.scrollLeft = 0;
      viewportRef.current.scrollTop = 0;
    }
  }, [bracket.stage.id]);

  useEffect(() => {
    const cards = graphRef.current?.querySelectorAll<HTMLElement>("[data-graph-card]");
    if (!cards?.length) return;
    const measure = () => {
      const next: Record<string, number> = {};
      cards.forEach((card) => {
        const height = card.querySelector<HTMLElement>("[data-graph-content]")?.getBoundingClientRect().height ?? 0;
        if (height > 0) next[card.dataset.graphCard!] = Math.ceil(height + 18);
      });
      if (Object.keys(next).length !== cards.length) return;
      setMeasured(true);
      setHeights((old) => {
        const keys = Object.keys(next);
        return keys.length === Object.keys(old).length && keys.every((key) => old[key] === next[key])
          ? old : next;
      });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    cards.forEach((card) => {
      const content = card.querySelector("[data-graph-content]");
      if (content) observer.observe(content);
    });
    return () => observer.disconnect();
  }, [bracket]);

  const nodesByKey = new Map(layout.nodes.map((node) => [node.key, node]));
  const descriptions = layout.edges.map((edge) => {
    const from = nodesByKey.get(edge.from)!;
    const to = nodesByKey.get(edge.to)!;
    return edge.kind === "loser"
      ? `Проигравший пары ${from.pair.index}, ${from.round.title.toLowerCase()} → ${to.round.title.toLowerCase()}, сторона ${edge.side === "A" ? "А" : "Б"}`
      : `Победитель пары ${from.pair.index}, ${from.round.title.toLowerCase()} → ${to.round.title.toLowerCase()}, сторона ${edge.side === "A" ? "А" : "Б"}`;
  });

  return (
    <div className="min-w-0 space-y-3">
      {(bracket.champion || bracket.thirdPlaceWinner) && (
        <div className="flex flex-wrap gap-2">
          {bracket.champion && <Badge variant="gold" className="gap-1 text-sm"><Trophy className="size-3.5" />Чемпион: {bracket.champion.name}</Badge>}
          {bracket.thirdPlaceWinner && <Badge variant="secondary" className="gap-1 text-sm"><Medal className="size-3.5" />3-е место: {bracket.thirdPlaceWinner.name}</Badge>}
        </div>
      )}
      <nav className="flex flex-wrap gap-2" aria-label="Переход к кругу">
        {layout.rounds.map(({ round }) => (
          <Button key={round.number} type="button" variant="outline" size="sm"
            onClick={() => {
              const target = [...(graphRef.current?.querySelectorAll<HTMLElement>("[data-round]") ?? [])]
                .find((element) => element.dataset.round === String(round.number));
              if (viewportRef.current && target) {
                viewportRef.current.scrollLeft = target.offsetLeft;
                viewportRef.current.scrollTop = target.offsetTop;
              }
            }}>
            К кругу {round.title}
          </Button>
        ))}
      </nav>
      <p className="text-xs text-muted-foreground">Прокручивайте сетку по горизонтали и вертикали; кнопки выше открывают нужный круг.</p>
      {thirdPlace && <p className="text-xs text-muted-foreground">Проигравшие полуфиналов идут в бой за 3-е место.</p>}
      <ul className="sr-only" aria-label="Связи пар">
        {descriptions.map((description, index) => <li key={layout.edges[index].key}>{description}</li>)}
      </ul>
      <div ref={viewportRef} data-testid="bracket-graph-viewport"
        className="max-h-[70vh] min-w-0 max-w-full overflow-auto rounded-lg border bg-background overscroll-contain"
        role="region" tabIndex={0} aria-label="Граф плей-офф, прокручиваемая область">
        <div ref={graphRef} className="relative" style={{ width: layout.width, height: layout.height }}>
          <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full overflow-visible"
            width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`}>
            {measured && layout.edges.map((edge) => (
              <polyline key={edge.key} data-edge-kind={edge.kind}
                points={edge.points.map((point) => `${point.x},${point.y}`).join(" ")}
                fill="none" stroke="currentColor" strokeWidth="2"
                strokeDasharray={edge.kind === "loser" ? "6 4" : undefined}
                className={edge.kind === "loser" ? "text-muted-foreground" : "text-primary"} />
            ))}
          </svg>
          {layout.rounds.map(({ round, x }) => (
            <div key={round.number} data-round={round.number}
              data-emphasis={round === final ? "final" : round === thirdPlace ? "third-place" : undefined}
              className={cn(
                "absolute flex w-[260px] flex-wrap items-center justify-center gap-1 rounded-lg px-2 py-2 text-center text-sm font-semibold",
                round === final && "border-2 border-gold/60 bg-gold/5",
                round === thirdPlace && "border-2 border-muted-foreground/30 bg-muted/40",
              )} style={{
                left: x,
                top: Math.max(0, (layout.nodes.find((node) => node.round === round)?.y ?? 120) - 120),
              }}>
              <h3>{round.title}</h3>
              {round === final && <Badge variant="gold" className="gap-1 text-[10px]"><Trophy className="size-3" />Финал</Badge>}
              {round === thirdPlace && <Badge variant="secondary" className="gap-1 text-[10px]"><Medal className="size-3" />3-е место</Badge>}
            </div>
          ))}
          {layout.rounds.flatMap(({ round, x }) => round.halves.map((half) => {
            const first = layout.nodes.find((node) => node.round === round && node.half === half);
            if (!first) return null;
            return <div key={`${round.number}:${half.half}`} data-graph-half={`${round.number}:${half.half}`}
              className="absolute flex w-[260px] flex-col gap-1 rounded-md bg-background/95 px-2 py-1 text-xs"
              style={{ left: x, top: Math.max(48, first.y - 80) }}>
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="font-medium break-words">{half.container.name}</span>
                <Badge tone={poolTone(half.container.status)}>{poolStatusLabel(half.container.status)}</Badge>
              </div>
              {half.container.arenaId && <div className="flex items-center gap-1 text-muted-foreground"><MapPin className="size-3 shrink-0" /><span className="break-words">{half.container.arenaName || "—"}</span></div>}
            </div>;
          }))}
          {layout.nodes.map((node) => (
            <div key={node.key} data-graph-card={node.key} className="absolute w-[260px]"
              style={{ left: node.x, top: node.y }}>
              <PairCard node={node} ready={ready} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
