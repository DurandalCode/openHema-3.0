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

/**
 * Высота строки на узком экране (spec 0044, FR-1): найдено ручной проверкой
 * в браузере на 360px (T14) — с длинной крошкой (`ПОЛЬЗОВАТЕЛИ · <название
 * турнира>`) текст переносился на несколько строк внутри фиксированной
 * `h-[var(--header-h)]`, вылезал за её пределы и накладывался на контент
 * ниже. От `md:` строка остаётся однострочной фиксированной высоты — там
 * ширины обычно хватает.
 */
describe("PageHeader mobile height (spec 0044, FR-1)", () => {
  afterEach(() => {
    cleanup();
  });

  it("grows to fit wrapped content on narrow screens instead of a fixed height", () => {
    const { container } = render(
      <PageHeader
        crumb="ПОЛЬЗОВАТЕЛИ · ДЛИННОЕ НАЗВАНИЕ ТУРНИРА, КОТОРОЕ ПЕРЕНОСИТСЯ"
        title="Пользователи"
        meta={<span>1 учётная запись</span>}
        action={<button type="button">+ Создать админа</button>}
      />,
    );
    const header = container.querySelector('[data-slot="page-header"]');

    expect(header?.className).not.toMatch(/(?:^|\s)h-\[var\(--header-h\)\](?:\s|$)/);
    expect(header?.className).toMatch(/(?:^|\s)h-auto(?:\s|$)/);
    expect(header?.className).toMatch(/(?:^|\s)md:h-\[var\(--header-h\)\](?:\s|$)/);
  });
});
