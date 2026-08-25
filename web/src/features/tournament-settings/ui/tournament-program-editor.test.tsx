// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TournamentProgramEditor } from "./tournament-program-editor";
import type { ProgramDayDraft } from "@/entities/tournament/lib/draft";

afterEach(cleanup);

describe("TournamentProgramEditor (spec 0040, FR-14)", () => {
  it("shows a placeholder when there are no days yet", () => {
    render(<TournamentProgramEditor value={[]} onChange={vi.fn()} />);
    expect(screen.getByText("Программа ещё не задана.")).toBeInTheDocument();
  });

  it("adds a new empty day", () => {
    const onChange = vi.fn();
    render(<TournamentProgramEditor value={[]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /добавить день/i }));

    expect(onChange).toHaveBeenCalledWith([{ date: "", items: [] }]);
  });

  it("removes a day", () => {
    const onChange = vi.fn();
    const value: ProgramDayDraft[] = [
      { date: "2026-12-01", items: [] },
      { date: "2026-12-02", items: [] },
    ];
    render(<TournamentProgramEditor value={value} onChange={onChange} />);

    fireEvent.click(screen.getAllByRole("button", { name: /удалить день/i })[0]);

    expect(onChange).toHaveBeenCalledWith([{ date: "2026-12-02", items: [] }]);
  });

  it("updates a day's date", () => {
    const onChange = vi.fn();
    const value: ProgramDayDraft[] = [{ date: "", items: [] }];
    render(<TournamentProgramEditor value={value} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Дата дня 1"), {
      target: { value: "2026-12-01" },
    });

    expect(onChange).toHaveBeenCalledWith([{ date: "2026-12-01", items: [] }]);
  });

  it("adds an item to a day", () => {
    const onChange = vi.fn();
    const value: ProgramDayDraft[] = [{ date: "2026-12-01", items: [] }];
    render(<TournamentProgramEditor value={value} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /добавить пункт/i }));

    expect(onChange).toHaveBeenCalledWith([
      { date: "2026-12-01", items: [{ timeLabel: "", text: "" }] },
    ]);
  });

  it("updates an item's time label and text", () => {
    const onChange = vi.fn();
    const value: ProgramDayDraft[] = [
      { date: "2026-12-01", items: [{ timeLabel: "", text: "" }] },
    ];
    const { rerender } = render(<TournamentProgramEditor value={value} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Время пункта 1 дня 1"), {
      target: { value: "9:00" },
    });
    expect(onChange).toHaveBeenCalledWith([
      { date: "2026-12-01", items: [{ timeLabel: "9:00", text: "" }] },
    ]);

    rerender(
      <TournamentProgramEditor
        value={[{ date: "2026-12-01", items: [{ timeLabel: "9:00", text: "" }] }]}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("Текст пункта 1 дня 1"), {
      target: { value: "Сбор участников" },
    });
    expect(onChange).toHaveBeenCalledWith([
      { date: "2026-12-01", items: [{ timeLabel: "9:00", text: "Сбор участников" }] },
    ]);
  });

  it("removes an item", () => {
    const onChange = vi.fn();
    const value: ProgramDayDraft[] = [
      {
        date: "2026-12-01",
        items: [
          { timeLabel: "9:00", text: "Сбор" },
          { timeLabel: "10:00", text: "Начало" },
        ],
      },
    ];
    render(<TournamentProgramEditor value={value} onChange={onChange} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Удалить" })[0]);

    expect(onChange).toHaveBeenCalledWith([
      { date: "2026-12-01", items: [{ timeLabel: "10:00", text: "Начало" }] },
    ]);
  });

  it("moves a day down, then up", () => {
    const onChange = vi.fn();
    const value: ProgramDayDraft[] = [
      { date: "2026-12-01", items: [] },
      { date: "2026-12-02", items: [] },
    ];
    render(<TournamentProgramEditor value={value} onChange={onChange} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Переместить день вниз" })[0]);
    expect(onChange).toHaveBeenCalledWith([
      { date: "2026-12-02", items: [] },
      { date: "2026-12-01", items: [] },
    ]);
  });

  it("moves an item up within a day", () => {
    const onChange = vi.fn();
    const value: ProgramDayDraft[] = [
      {
        date: "2026-12-01",
        items: [
          { timeLabel: "9:00", text: "Сбор" },
          { timeLabel: "10:00", text: "Начало" },
        ],
      },
    ];
    render(<TournamentProgramEditor value={value} onChange={onChange} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Переместить пункт вверх" })[1]);
    expect(onChange).toHaveBeenCalledWith([
      {
        date: "2026-12-01",
        items: [
          { timeLabel: "10:00", text: "Начало" },
          { timeLabel: "9:00", text: "Сбор" },
        ],
      },
    ]);
  });

  it("disables the up-arrow on the first day and the down-arrow on the last day", () => {
    const value: ProgramDayDraft[] = [
      { date: "2026-12-01", items: [] },
      { date: "2026-12-02", items: [] },
    ];
    render(<TournamentProgramEditor value={value} onChange={vi.fn()} />);

    const ups = screen.getAllByRole("button", { name: "Переместить день вверх" });
    const downs = screen.getAllByRole("button", { name: "Переместить день вниз" });
    expect(ups[0]).toBeDisabled();
    expect(downs[downs.length - 1]).toBeDisabled();
  });
});
