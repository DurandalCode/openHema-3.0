import type { Bracket, BracketHalf, BracketPair, BracketRound } from "./types";

export const GRAPH_CARD_WIDTH = 260;
const COLUMN_GAP = 108;
const MIN_CARD_HEIGHT = 122;
const ROW_GAP = 88;
const TOP_SPACE = 90;

export type GraphNode = {
  key: string;
  round: BracketRound;
  half: BracketHalf;
  pair: BracketPair;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type GraphPoint = { x: number; y: number };

export type GraphEdge = {
  key: string;
  from: string;
  to: string;
  kind: "winner" | "loser";
  side: "A" | "B";
  points: GraphPoint[];
};

export type GraphLayout = {
  rounds: { round: BracketRound; x: number }[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
  cardHeight: number;
};

export function pairNodeKey(stageId: string, round: BracketRound, pairIndex: number): string {
  return `${stageId}:${round.number}:${round.thirdPlace ? "bronze" : "main"}:${pairIndex}`;
}

/** Layout depends on bracket positions, never on the presence or result of a bout. */
export function buildGraphLayout(bracket: Bracket, measuredHeights: Record<string, number> = {}): GraphLayout {
  const rounds = [...bracket.rounds].sort((a, b) => a.number - b.number);
  const mainRounds = rounds.filter((round) => !round.thirdPlace);
  const bronzeRound = rounds.find((round) => round.thirdPlace);
  const cardHeight = Math.max(MIN_CARD_HEIGHT, ...Object.values(measuredHeights).filter(Number.isFinite));
  const rowStep = cardHeight + ROW_GAP;
  const placedRounds = rounds.map((round, index) => ({
    round,
    x: (round.thirdPlace ? mainRounds.length - 1 : index) * (GRAPH_CARD_WIDTH + COLUMN_GAP),
  }));
  const nodes: GraphNode[] = [];

  for (const { round, x } of placedRounds) {
    const depth = mainRounds.findIndex((candidate) => candidate.number === round.number);
    const pairs = round.halves
      .flatMap((half) => half.pairs.map((pair) => ({ half, pair })))
      .sort((a, b) => a.pair.index - b.pair.index);
    for (const { half, pair } of pairs) {
      const center = round.thirdPlace
        ? TOP_SPACE + (Math.pow(2, Math.max(0, mainRounds.length - 2)) * rowStep) + cardHeight + 160
        : TOP_SPACE + (pair.index - 0.5) * Math.pow(2, depth) * rowStep;
      nodes.push({
        key: pairNodeKey(bracket.stage.id, round, pair.index),
        round,
        half,
        pair,
        x,
        y: center - cardHeight / 2,
        width: GRAPH_CARD_WIDTH,
        height: cardHeight,
      });
    }
  }

  const byKey = new Map(nodes.map((node) => [node.key, node]));
  const edges: GraphEdge[] = [];
  function connect(from: GraphNode, to: GraphNode, kind: GraphEdge["kind"], side: GraphEdge["side"]) {
    const targetY = to.y + (side === "A" ? cardHeight / 3 : 2 * cardHeight / 3);
    const sourceY = from.y + cardHeight / 2 + (kind === "loser" ? 10 : 0);
    const laneX = to.x - (kind === "loser" ? 78 : 38);
    edges.push({
      key: `${from.key}:${kind}:${to.key}:${side}`,
      from: from.key,
      to: to.key,
      kind,
      side,
      points: [
        { x: from.x + from.width, y: sourceY },
        { x: laneX, y: sourceY },
        { x: laneX, y: targetY },
        { x: to.x, y: targetY },
      ],
    });
  }

  for (let index = 0; index < mainRounds.length - 1; index++) {
    const source = mainRounds[index];
    const target = mainRounds[index + 1];
    for (const from of nodes.filter((node) => node.round === source)) {
      const side = from.pair.index % 2 === 1 ? "A" : "B";
      const targetKey = pairNodeKey(bracket.stage.id, target, Math.ceil(from.pair.index / 2));
      const to = byKey.get(targetKey);
      if (to) connect(from, to, "winner", side);
    }
  }
  if (bronzeRound && mainRounds.length >= 2) {
    const bronze = byKey.get(pairNodeKey(bracket.stage.id, bronzeRound, 1));
    const semifinal = mainRounds[mainRounds.length - 2];
    if (bronze) {
      for (const from of nodes.filter((node) => node.round === semifinal)) {
        connect(from, bronze, "loser", from.pair.index % 2 === 1 ? "A" : "B");
      }
    }
  }

  return {
    rounds: placedRounds,
    nodes,
    edges,
    width: Math.max(0, mainRounds.length * (GRAPH_CARD_WIDTH + COLUMN_GAP) - COLUMN_GAP),
    height: Math.max(0, ...nodes.map((node) => node.y + node.height + 56)),
    cardHeight,
  };
}
