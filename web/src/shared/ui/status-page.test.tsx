// @vitest-environment jsdom
import Link from "next/link";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StatusPage } from "./status-page";

// Спека 0023, T16 (AC-2/AC-3/AC-5): общая презентационная раскладка страниц
// «не найдено» / «нужны права» / «ошибка» — код, заголовок, описание и
// действия должны быть отрисованы; футноут — опциональный слот (используется
// страницей ошибки под идентификатор, T18).

describe("StatusPage", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders code, title, description and actions", () => {
    render(
      <StatusPage
        code="404"
        title="Площадка не найдена"
        description="Такой площадки нет — возможно, её удалили или ссылка устарела."
        actions={<Link href="/admin/arenas">Все площадки</Link>}
      />,
    );

    expect(screen.getByText("404")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Площадка не найдена" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Такой площадки нет/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Все площадки" }),
    ).toHaveAttribute("href", "/admin/arenas");
  });

  it("renders the footnote slot only when provided", () => {
    const { rerender } = render(
      <StatusPage code="500" title="Ошибка" description="Что-то пошло не так." />,
    );
    expect(screen.queryByText(/ID:/)).not.toBeInTheDocument();

    rerender(
      <StatusPage
        code="500"
        title="Ошибка"
        description="Что-то пошло не так."
        footnote="ID: abc-123"
      />,
    );
    expect(screen.getByText("ID: abc-123")).toBeInTheDocument();
  });
});
