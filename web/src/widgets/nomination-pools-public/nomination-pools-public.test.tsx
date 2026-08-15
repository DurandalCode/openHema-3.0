// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NominationPoolsPublic } from "./nomination-pools-public";
import type { NominationLiveSnapshotDto } from "@/entities/nomination-live/lib/types";
import type { Bracket } from "@/entities/bracket/lib/types";
import { emptyNominationResults } from "@/entities/nomination-results/lib/types";
import type { NominationResults } from "@/entities/nomination-results/lib/types";

// useNominationLive открывает EventSource/делает fetch на клиенте — здесь
// проверяем чистый рендер по снапшоту, поэтому мокаем хук возвращающим ровно
// переданный initialSnapshot (без сети/EventSource).
vi.mock("@/features/nomination-live/api/use-nomination-live", () => ({
  useNominationLive: (_id: string, initialSnapshot: NominationLiveSnapshotDto) => initialSnapshot,
}));

const snapshot: NominationLiveSnapshotDto = {
  nominationId: "n1",
  pools: [
    {
      pool: {
        id: "pool-1",
        nominationId: "n1",
        nominationName: "Longsword",
        number: 1,
        name: "Пул 1",
        members: [{ fighterId: "f1", name: "Fighter One", club: "Sokol" }],
        status: "POOL_STATUS_ACTIVE",
        arenaId: "arena-1",
        arenaName: "Ристалище 1",
        standings: [
          {
            fighter: { fighterId: "f1", name: "Fighter One", club: "Sokol" },
            wins: 1,
            draws: 0,
            losses: 0,
            pointsScored: 5,
            pointsConceded: 3,
            place: 1,
          },
        ],
      },
      bouts: [
        {
          id: "bout-1",
          roundNumber: 1,
          sequenceNumber: 1,
          fighterA: { fighterId: "f1", name: "Fighter One", club: "Sokol" },
          fighterB: { fighterId: "f2", name: "Fighter Two", club: "Berkut" },
          state: "BOUT_STATE_FINISHED",
          scoreA: 5,
          scoreB: 3,
        },
        {
          id: "bout-2",
          roundNumber: 1,
          sequenceNumber: 2,
          fighterA: { fighterId: "f3", name: "Fighter Three", club: "" },
          fighterB: { fighterId: "f4", name: "Fighter Four", club: "" },
          state: "BOUT_STATE_IN_PROGRESS",
          scoreA: 1,
          scoreB: 0,
        },
      ],
      currentBoutId: "bout-2",
    },
  ],
  stages: [
    {
      id: "stage-1",
      nominationId: "n1",
      position: 0,
      title: "Групповой этап",
      type: "STAGE_TYPE_GROUPS",
      status: "POOL_LAYOUT_STATUS_READY",
      bracket: null,
      groups: null,
      rule: null,
      executionStatus: "STAGE_STATUS_UNSPECIFIED",
    },
  ],
  brackets: [],
  results: emptyNominationResults("n1"),
};

// Спека 0018, AC-12: сетка живёт в отдельном этапе номинации, показывается
// на публичном экране рядом с группами, а не вместо них. Полуфинал на одну
// пару достаточен, чтобы проверить и подпись этапа, и содержимое пары/боя.
const bracket: Bracket = {
  stage: {
    id: "stage-2",
    nominationId: "n1",
    position: 1,
    title: "Плейофф",
    type: "STAGE_TYPE_BRACKET",
    status: "POOL_LAYOUT_STATUS_READY",
    bracket: { size: 4, thirdPlace: false },
    groups: null,
    rule: null,
    executionStatus: "STAGE_STATUS_UNSPECIFIED",
  },
  rounds: [
    {
      number: 1,
      title: "Полуфинал",
      thirdPlace: false,
      halves: [
        {
          half: 1,
          title: "",
          container: {
            id: "pool-sf",
            nominationId: "n1",
            nominationName: "Longsword",
            number: 1,
            name: "Полуфинал",
            members: [],
            status: "POOL_STATUS_ACTIVE",
            arenaId: "",
            arenaName: "",
            standings: [],
          },
          currentBoutId: "bout-sf",
          pairs: [
            {
              index: 1,
              slotA: {
                slot: 1,
                state: "BRACKET_SLOT_STATE_FILLED",
                fighter: { fighterId: "f5", name: "Fighter Five", club: "" },
                sourceLabel: "",
              },
              slotB: {
                slot: 2,
                state: "BRACKET_SLOT_STATE_FILLED",
                fighter: { fighterId: "f6", name: "Fighter Six", club: "" },
                sourceLabel: "",
              },
              bout: {
                id: "bout-sf",
                roundNumber: 1,
                sequenceNumber: 1,
                fighterA: { fighterId: "f5", name: "Fighter Five", club: "" },
                fighterB: { fighterId: "f6", name: "Fighter Six", club: "" },
                state: "BOUT_STATE_IN_PROGRESS",
                scoreA: 2,
                scoreB: 1,
              },
              resolved: false,
            },
          ],
        },
      ],
    },
  ],
  unassigned: [],
  canUndo: false,
  champion: null,
  thirdPlaceWinner: null,
};

const snapshotWithBracket: NominationLiveSnapshotDto = {
  ...snapshot,
  stages: [...snapshot.stages, bracket.stage],
  brackets: [bracket],
};

describe("NominationPoolsPublic", () => {
  it("renders pool executive status, bout state badges, score and outcome of a finished bout", () => {
    render(<NominationPoolsPublic nominationId="n1" initialSnapshot={snapshot} />);

    // Исполнительный статус пула (спека 0013) + бейдж состояния идущего боя
    // — оба «идёт» (разные бейджи в разных местах разметки).
    expect(screen.getAllByText("идёт")).toHaveLength(2);
    // Площадка.
    expect(screen.getByText("Ристалище 1")).toBeInTheDocument();
    // Состояния боёв.
    expect(screen.getByText("завершён")).toBeInTheDocument();
    // Счёт.
    expect(screen.getByText("5:3")).toBeInTheDocument();
    expect(screen.getByText("1:0")).toBeInTheDocument();
    // Исход завершённого боя (FR-3): победитель по счёту — Fighter One.
    expect(screen.getByText("Исход: Fighter One")).toBeInTheDocument();
  });

  it("highlights the pool's current bout", () => {
    const { container } = render(
      <NominationPoolsPublic nominationId="n1" initialSnapshot={snapshot} />,
    );

    const currentBoutRow = container.querySelector('[data-current="true"]');
    expect(currentBoutRow).not.toBeNull();
    expect(currentBoutRow?.textContent).toContain("Fighter Three");

    const rows = container.querySelectorAll("[data-slot='col'].rounded-md");
    expect(rows).toHaveLength(2);
    const notCurrentRow = Array.from(rows).find((r) => !r.hasAttribute("data-current"));
    expect(notCurrentRow?.textContent).toContain("Fighter One");
  });

  it("renders the pool standings table (спека 0016)", () => {
    const { container } = render(
      <NominationPoolsPublic nominationId="n1" initialSnapshot={snapshot} />,
    );

    const table = container.querySelector("table");
    expect(table).not.toBeNull();
    expect(table?.textContent).toContain("Fighter One");
    expect(table?.textContent).toContain("Sokol");
  });

  it("shows the draft placeholder when there are no pools yet", () => {
    render(
      <NominationPoolsPublic
        nominationId="n1"
        initialSnapshot={{
          nominationId: "n1",
          pools: [],
          stages: [],
          brackets: [],
          results: emptyNominationResults("n1"),
        }}
      />,
    );
    expect(screen.getByText(/раскладка по группам ещё формируется/i)).toBeInTheDocument();
  });

  // Спека 0017, FR-11/AC-3: состав по группам подписан названием этапа,
  // которому он принадлежит. Запрос через container (а не screen) — файл не
  // делает cleanup() между тестами (см. соседние тесты), а этот текст
  // повторится в каждом рендере с filled snapshot.
  it("renders the stage title above the pool grid", () => {
    const { container } = render(
      <NominationPoolsPublic nominationId="n1" initialSnapshot={snapshot} />,
    );

    expect(container).toHaveTextContent("Групповой этап");
  });

  // AC-12: guest открывает публичный экран номинации с групповым этапом и
  // сеткой — видит и группы, и сетку с парами/счётом/состояниями одновременно.
  it("renders both a groups stage and a bracket stage simultaneously (AC-12)", () => {
    const { container } = render(
      <NominationPoolsPublic nominationId="n1" initialSnapshot={snapshotWithBracket} />,
    );

    // Группы (спека 0017) продолжают отображаться как раньше.
    expect(container).toHaveTextContent("Групповой этап");
    expect(container).toHaveTextContent("Пул 1");
    // Сетка (спека 0018, FR-19) рендерится рядом, под подписью своего этапа.
    expect(container).toHaveTextContent("Плейофф");
    expect(container).toHaveTextContent("Fighter Five");
    expect(container).toHaveTextContent("Fighter Six");
    expect(container).toHaveTextContent("2:1");
  });

  // Спека 0019, FR-26/AC-17: гость видит схему номинации целиком — уровни и
  // параллельные ветки (двойной плейофф) с подсказкой источника ветки.
  it("shows the nomination schema with parallel branches and their source (0019, AC-17)", () => {
    const strongBracket = {
      id: "stage-3",
      nominationId: "n1",
      position: 1,
      title: "Сетка А",
      type: "STAGE_TYPE_BRACKET" as const,
      status: "POOL_LAYOUT_STATUS_DRAFT" as const,
      bracket: { size: 4, thirdPlace: false },
      groups: null,
      rule: {
        sourceKind: "STAGE_SOURCE_KIND_STAGE" as const,
        sourceStageId: "stage-1",
        selector: "STAGE_SELECTOR_KIND_GROUP_PLACES" as const,
        placeFrom: 1,
        placeTo: 2,
        method: "STAGE_LAYOUT_METHOD_SEEDED" as const,
      },
      executionStatus: "STAGE_STATUS_UNSPECIFIED" as const,
    };
    const weakBracket = {
      ...strongBracket,
      id: "stage-4",
      title: "Сетка Б",
      rule: { ...strongBracket.rule, placeFrom: 3, placeTo: 0 },
    };
    const { container } = render(
      <NominationPoolsPublic
        nominationId="n1"
        initialSnapshot={{ ...snapshot, stages: [snapshot.stages[0], strongBracket, weakBracket] }}
      />,
    );

    expect(container).toHaveTextContent("Схема номинации");
    expect(container).toHaveTextContent("Сетка А");
    expect(container).toHaveTextContent("Сетка Б");
    expect(container.querySelectorAll('[data-testid="schema-level"]')).toHaveLength(2);
    expect(container).toHaveTextContent("из: Групповой этап");
  });

  // Спека 0021, FR-17/FR-18: итоги номинации приходят тем же живым каналом,
  // что пулы/сетки, и рендерятся внутри клиентского дерева
  // `NominationPoolsPublic` (не отдельным серверным блоком) — иначе не
  // обновились бы без перезагрузки. Публика не видит недоигранные секции
  // (showUnfinished не передаётся).
  it("renders the results block above the pools when the nomination has finished sections (FR-17)", () => {
    const results: NominationResults = {
      nominationId: "n1",
      nominationFinished: true,
      sections: [
        {
          stageId: "stage-2",
          stageTitle: "Плейофф",
          stageType: "STAGE_TYPE_BRACKET",
          finished: true,
          placesFromOverallOrder: false,
          entries: [
            {
              placeFrom: 1,
              placeTo: 1,
              fighter: { fighterId: "f1", name: "Champion Fighter", club: "Sokol" },
              originLabel: "Чемпион",
            },
          ],
        },
      ],
    };
    const { container } = render(
      <NominationPoolsPublic
        nominationId="n1"
        initialSnapshot={{ ...snapshot, results }}
      />,
    );

    expect(container).toHaveTextContent("Champion Fighter");
    expect(container).toHaveTextContent("Плейофф");
  });
});
