import { describe, expect, it } from "vitest";
import type { Bracket, BracketPair, BracketRound } from "./types";
import { buildGraphLayout, pairNodeKey } from "./graph-layout";

const fighter = { fighterId: "", name: "", club: "" };
const slot = (number: number) => ({
  slot: number,
  state: "BRACKET_SLOT_STATE_PENDING" as const,
  fighter,
  sourceLabel: "Ожидание результата",
});

function pair(index: number): BracketPair {
  return { index, slotA: slot(index * 2 - 1), slotB: slot(index * 2), bout: null, resolved: false };
}

function fixture(size: 4 | 8 | 16 | 32, bronze = false): Bracket {
  const rounds: BracketRound[] = [];
  let count = size / 2;
  let number = 1;
  while (count >= 1) {
    const halves = count > 1 ? [1, 2] : [1];
    rounds.push({
      number,
      title: `Круг ${number}`,
      thirdPlace: false,
      halves: halves.map((half) => ({
        half,
        title: `Половина ${half}`,
        container: {
          id: `pool-${number}-${half}`,
          nominationId: "nomination-1",
          nominationName: "Шпага",
          number: half,
          name: `Круг ${number}, половина ${half}`,
          members: [],
          status: "POOL_STATUS_NOT_READY",
          arenaId: "",
          arenaName: "",
          standings: [],
        },
        currentBoutId: "",
        pairs: Array.from({ length: count }, (_, i) => pair(i + 1)).filter((p) =>
          count === 1 ? true : half === 1 ? p.index <= count / 2 : p.index > count / 2,
        ),
      })),
    });
    count /= 2;
    number += 1;
  }
  if (bronze) {
    rounds.push({
      number,
      title: "Бой за 3-е место",
      thirdPlace: true,
      halves: [{
        half: 1,
        title: "",
        container: { ...rounds.at(-1)!.halves[0].container, id: "bronze", name: "Бой за 3-е место" },
        currentBoutId: "",
        pairs: [pair(1)],
      }],
    });
  }
  return {
    stage: {
      id: "stage-1",
      nominationId: "nomination-1",
      position: 1,
      title: "Плейофф",
      type: "STAGE_TYPE_BRACKET",
      status: "POOL_LAYOUT_STATUS_READY",
      bracket: { size, thirdPlace: bronze },
      groups: null,
      rule: null,
      executionStatus: "STAGE_STATUS_UNSPECIFIED",
    },
    rounds,
    unassigned: [],
    canUndo: false,
    champion: null,
    thirdPlaceWinner: null,
  };
}

describe("buildGraphLayout", () => {
  for (const size of [4, 8, 16, 32] as const) {
    it(`connects every ${size}-slot source to the correct next pair and side`, () => {
      const graph = buildGraphLayout(fixture(size));
      const regular = graph.edges.filter((edge) => edge.kind === "winner");
      expect(regular).toHaveLength(size - 2);
      for (const edge of regular) {
        const from = graph.nodes.find((node) => node.key === edge.from)!;
        const to = graph.nodes.find((node) => node.key === edge.to)!;
        expect(to.round.number).toBe(from.round.number + 1);
        expect(to.pair.index).toBe(Math.ceil(from.pair.index / 2));
        expect(edge.side).toBe(from.pair.index % 2 ? "A" : "B");
        expect(edge.points.at(-1)!.y).toBe(to.y + (edge.side === "A" ? graph.cardHeight / 3 : 2 * graph.cardHeight / 3));
      }
      for (const a of graph.nodes) {
        for (const b of graph.nodes) {
          if (a === b || a.round.number !== b.round.number) continue;
          expect(Math.abs(a.y - b.y)).toBeGreaterThanOrEqual(graph.cardHeight);
        }
      }
    });
  }

  it("sorts halves and pairs by numeric position, independent of response ordering", () => {
    const bracket = fixture(8);
    bracket.rounds[0].halves.reverse();
    bracket.rounds[0].halves[0].pairs.reverse();
    const graph = buildGraphLayout(bracket);
    expect(graph.nodes.filter((n) => n.round.number === 1).map((n) => n.pair.index)).toEqual([1, 2, 3, 4]);
  });

  it("uses stable stage/round/pair keys when a bout appears", () => {
    const bracket = fixture(4);
    const before = pairNodeKey(bracket.stage.id, bracket.rounds[0], 1);
    bracket.rounds[0].halves[0].pairs[0].bout = {
      id: "new-bout", roundNumber: 1, sequenceNumber: 1,
      fighterA: fighter, fighterB: fighter,
      state: "BOUT_STATE_NOT_STARTED", scoreA: 0, scoreB: 0,
    };
    expect(buildGraphLayout(bracket).nodes[0].key).toBe(before);
  });

  it("branches semifinal winners to final and losers to bronze, with separate routes", () => {
    const graph = buildGraphLayout(fixture(8, true));
    const semi = graph.nodes.filter((n) => n.round.number === 2);
    const final = graph.nodes.find((n) => n.round.number === 3)!;
    const bronze = graph.nodes.find((n) => n.round.thirdPlace)!;
    for (const source of semi) {
      expect(graph.edges).toEqual(expect.arrayContaining([
        expect.objectContaining({ from: source.key, to: final.key, kind: "winner" }),
        expect.objectContaining({ from: source.key, to: bronze.key, kind: "loser" }),
      ]));
    }
    expect(graph.edges.filter((e) => e.kind === "loser")).toHaveLength(2);
    expect(graph.nodes.find((n) => n.key === bronze.key)!.x).toBe(final.x);
    expect(bronze.y - final.y).toBeGreaterThanOrEqual(graph.cardHeight + 160);
    expect(graph.edges.filter((e) => e.kind === "loser").every((e) => e.points[1].x < final.x)).toBe(true);
  });

  it("places edges even when source and target bouts do not exist yet", () => {
    const graph = buildGraphLayout(fixture(8));
    expect(graph.edges).toHaveLength(6);
    expect(graph.nodes.every((n) => n.pair.bout === null)).toBe(true);
  });

  it("leaves enough vertical room when a long card grows", () => {
    const bracket = fixture(8);
    const tall = pairNodeKey("stage-1", bracket.rounds[0], 1);
    const graph = buildGraphLayout(bracket, { [tall]: 280 });
    expect(graph.cardHeight).toBe(280);
    const first = graph.nodes[0];
    const second = graph.nodes[1];
    expect(second.y - first.y).toBeGreaterThanOrEqual(280);
  });
});
