// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EmptyLayout } from "./empty-layout";

afterEach(() => cleanup());

describe("EmptyLayout", () => {
  it("показывает оформленное сообщение о формировании раскладки (FR-23/AC-6)", () => {
    render(<EmptyLayout />);
    expect(screen.getByText(/раскладка/i)).toBeInTheDocument();
    expect(screen.getByText(/формиру/i)).toBeInTheDocument();
  });

  it("не показывает индикатор загрузки/спиннер (NFR-4)", () => {
    render(<EmptyLayout />);
    expect(screen.queryByText(/загрузка/i)).not.toBeInTheDocument();
  });
});
