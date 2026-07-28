// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TimerDisplay, formatTimerCs } from "./TimerDisplay";

describe("formatTimerCs", () => {
  it("formats seconds and hundredths without minutes as SS.hh", () => {
    expect(formatTimerCs(530)).toBe("05.30"); // 5.30s
  });

  it("formats with minutes as M:SS.hh", () => {
    expect(formatTimerCs(7247)).toBe("1:12.47"); // 72.47s = 1:12.47
  });

  it("clamps negative input to 00.00", () => {
    expect(formatTimerCs(-50)).toBe("00.00");
  });
});

describe("TimerDisplay", () => {
  it("renders the formatted time and exposes status via data attribute", () => {
    render(<TimerDisplay status="RUNNING" remainingCs={7247} />);
    expect(screen.getByText("1:12.47")).toBeInTheDocument();
    expect(screen.getByText("1:12.47")).toHaveAttribute("data-timer-status", "RUNNING");
  });

  it("marks low-time (<5.00s) via data attribute when not expired", () => {
    render(<TimerDisplay status="RUNNING" remainingCs={480} />);
    const el = screen.getByText("04.80");
    expect(el).toHaveAttribute("data-low-time", "true");
  });

  it("does not mark low-time when status is EXPIRED even at 0", () => {
    render(<TimerDisplay status="EXPIRED" remainingCs={0} />);
    const el = screen.getByText("00.00");
    expect(el).not.toHaveAttribute("data-low-time");
    expect(el).toHaveAttribute("data-timer-status", "EXPIRED");
  });

  it("does not mark low-time at/above the 5.00s threshold", () => {
    render(<TimerDisplay status="RUNNING" remainingCs={500} />);
    const el = screen.getByText("05.00");
    expect(el).not.toHaveAttribute("data-low-time");
  });
});
