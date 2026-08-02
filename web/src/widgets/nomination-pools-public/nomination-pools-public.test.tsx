// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NominationPoolsPublic } from "./nomination-pools-public";
import type { NominationLiveSnapshotDto } from "@/entities/nomination-live/lib/types";

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
    { id: "stage-1", nominationId: "n1", position: 0, title: "Групповой этап", type: "STAGE_TYPE_GROUPS" },
  ],
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
        initialSnapshot={{ nominationId: "n1", pools: [], stages: [] }}
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
});
