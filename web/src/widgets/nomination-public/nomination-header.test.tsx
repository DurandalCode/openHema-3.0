// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NominationHeader } from "./nomination-header";
import type { Nomination } from "@/entities/nomination/lib/types";

afterEach(() => {
  cleanup();
});

function nomination(partial: Partial<Nomination>): Nomination {
  return {
    id: "n1",
    tournamentId: "t1",
    title: "Лонгсворд",
    description: "Одноручный меч, лёгкий контакт",
    fighterCapacity: null,
    metadata: { rulesUrl: "" },
    position: 0,
    status: "NOMINATION_STATUS_OPEN",
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

describe("NominationHeader", () => {
  it("показывает название, описание и ссылку на главную (AC-1)", () => {
    render(<NominationHeader nomination={nomination({})} position={{ phase: "upcoming", stageTitle: "" }} />);
    expect(screen.getByRole("heading", { name: "Лонгсворд" })).toBeInTheDocument();
    expect(screen.getByText("Одноручный меч, лёгкий контакт")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /на главную/i })).toHaveAttribute("href", "/");
  });

  it("не рендерит пустой абзац при пустом описании", () => {
    const { container } = render(
      <NominationHeader nomination={nomination({ description: "" })} position={{ phase: "upcoming", stageTitle: "" }} />,
    );
    expect(container.querySelector("p")).toBeNull();
  });

  it("показывает плашку закрытого приёма заявок (AC-1)", () => {
    render(
      <NominationHeader
        nomination={nomination({ status: "NOMINATION_STATUS_CLOSED" })}
        position={{ phase: "upcoming", stageTitle: "" }}
      />,
    );
    expect(screen.getByText("приём заявок завершён")).toBeInTheDocument();
  });

  it("не показывает плашку статуса приёма, когда приём открыт", () => {
    render(<NominationHeader nomination={nomination({})} position={{ phase: "upcoming", stageTitle: "" }} />);
    expect(screen.queryByText(/приём заявок/)).toBeNull();
  });

  it("показывает отметку текущего положения с подписью этапа (AC-2)", () => {
    render(
      <NominationHeader
        nomination={nomination({})}
        position={{ phase: "running", stageTitle: "Групповой этап" }}
      />,
    );
    expect(screen.getByText(/Групповой этап/)).toBeInTheDocument();
  });

  it("показывает отметку завершённой номинации", () => {
    render(<NominationHeader nomination={nomination({})} position={{ phase: "finished", stageTitle: "" }} />);
    expect(screen.getByText("завершена")).toBeInTheDocument();
  });

  it("не показывает никакой отметки положения для upcoming", () => {
    render(<NominationHeader nomination={nomination({})} position={{ phase: "upcoming", stageTitle: "" }} />);
    expect(screen.queryByText("завершена")).toBeNull();
    expect(screen.queryByText(/идёт/)).toBeNull();
  });
});
