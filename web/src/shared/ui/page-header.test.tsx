// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PageHeader } from "./page-header";

// Спека 0024 (FR-19): header-строка раздела вынесена из `AppShell` в
// самостоятельный `PageHeader` — та же разметка/классы, `meta` расширен до
// `React.ReactNode` (см. `page-header.tsx`).

describe("PageHeader", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders all slots when provided", () => {
    render(
      <PageHeader
        crumb="ПОЛЬЗОВАТЕЛИ · КЛИНОК СЕВЕРА 2026"
        title="Пользователи"
        status={<span>online</span>}
        meta={<span>167 учётных записей</span>}
        secondary={<button type="button">Экспорт</button>}
        action={<button type="button">+ Создать админа</button>}
      />,
    );

    expect(
      screen.getByText("ПОЛЬЗОВАТЕЛИ · КЛИНОК СЕВЕРА 2026"),
    ).toBeInTheDocument();
    expect(screen.getByText("Пользователи")).toBeInTheDocument();
    expect(screen.getByText("online")).toBeInTheDocument();
    expect(screen.getByText("167 учётных записей")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Экспорт" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "+ Создать админа" }),
    ).toBeInTheDocument();
  });

  it("accepts a React node for meta, not just a string", () => {
    render(<PageHeader meta={<span data-testid="meta-node">167</span>} />);

    expect(screen.getByTestId("meta-node")).toBeInTheDocument();
  });

  it("does not render the header row when all slots are empty", () => {
    const { container } = render(<PageHeader />);

    expect(container.querySelector('[data-slot="page-header"]')).toBeNull();
  });
});
