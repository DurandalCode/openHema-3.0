// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StagePromise } from "./stage-promise";

afterEach(() => {
  cleanup();
});

describe("StagePromise", () => {
  it("показывает название, конфигурацию и подпись ожидания (AC-4)", () => {
    render(<StagePromise title="Плейофф" configLabel="8" waitingHint="ждёт результаты «Групповой этап»" />);
    expect(screen.getByText("Плейофф")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText(/Сформируется по результатам/)).toBeInTheDocument();
    expect(screen.getByText(/ждёт результаты «Групповой этап»/)).toBeInTheDocument();
  });

  it("не рендерит configLabel, если он пуст", () => {
    const { container } = render(<StagePromise title="Плейофф" configLabel="" waitingHint="" />);
    expect(container).toHaveTextContent("Плейофф");
  });

  it("показывает общую фразу, когда waitingHint пуст", () => {
    render(<StagePromise title="Плейофф" configLabel="8" waitingHint="" />);
    expect(screen.getByText(/Сформируется по результатам предыдущего этапа/i)).toBeInTheDocument();
  });
});
