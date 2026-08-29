// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ConsoleQueueList } from "./console-queue-list";
import type { ConsoleQueueItem } from "@/entities/tournament-console/lib/types";

describe("ConsoleQueueList (спека 0043, FR-13)", () => {
  afterEach(() => {
    cleanup();
  });

  it("показывает заглушку для пустой очереди", () => {
    render(<ConsoleQueueList items={[]} />);
    expect(screen.getByText("Очередь пуста.")).toBeInTheDocument();
  });

  it("показывает пулы очереди с числом боёв и оценкой времени", () => {
    const items: ConsoleQueueItem[] = [
      {
        poolId: "p1",
        nominationId: "n1",
        nominationName: "Сабля",
        stageTitle: "Группа B",
        poolName: "Пул B",
        boutCount: 6,
        estimatedSeconds: 420,
      },
    ];
    render(<ConsoleQueueList items={items} />);
    expect(screen.getByText(/Сабля · Пул B · Группа B/)).toBeInTheDocument();
    expect(screen.getByText("6 боёв · ~7 минут")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/admin/arenas");
  });
});
