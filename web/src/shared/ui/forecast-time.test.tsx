// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ForecastTime } from "./forecast-time";

describe("ForecastTime (спека 0043, ADR 0020)", () => {
  afterEach(() => {
    cleanup();
  });

  it("прочерк/ничего не рендерит при отсутствии прогноза (FR-24)", () => {
    const { container } = render(
      <ForecastTime forecast={{ expectedStartAt: null, boutsAhead: 0, provisional: false, imminent: false }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("«ориентировочно HH:MM · через ~N минут» без пометки, когда оценка не предварительна", () => {
    const now = new Date(2026, 7, 29, 11, 0, 0);
    render(
      <ForecastTime
        forecast={{
          expectedStartAt: new Date(2026, 7, 29, 11, 14, 0).toISOString(),
          boutsAhead: 1,
          provisional: false,
          imminent: false,
        }}
        now={now}
      />,
    );
    expect(screen.getByText("ориентировочно 11:14 · через ~14 минут")).toBeInTheDocument();
    expect(screen.queryByText("предварительно")).not.toBeInTheDocument();
  });

  it("«вот-вот» при imminent=true, без часов и без счётчика", () => {
    const now = new Date(2026, 7, 29, 11, 0, 0);
    render(
      <ForecastTime
        forecast={{
          expectedStartAt: new Date(2026, 7, 29, 10, 55, 0).toISOString(),
          boutsAhead: 0,
          provisional: false,
          imminent: true,
        }}
        now={now}
      />,
    );
    expect(screen.getByText("вот-вот")).toBeInTheDocument();
  });

  it("показывает пометку «предварительно», когда оценка идёт по резерву", () => {
    const now = new Date(2026, 7, 29, 11, 0, 0);
    render(
      <ForecastTime
        forecast={{
          expectedStartAt: new Date(2026, 7, 29, 11, 5, 0).toISOString(),
          boutsAhead: 0,
          provisional: true,
          imminent: false,
        }}
        now={now}
      />,
    );
    expect(screen.getByText("предварительно")).toBeInTheDocument();
  });
});
