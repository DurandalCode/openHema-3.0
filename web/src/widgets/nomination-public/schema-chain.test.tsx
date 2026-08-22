// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SchemaChain } from "./schema-chain";
import type { SchemaChainItem } from "@/entities/stage/lib/schema-chain";

afterEach(() => {
  cleanup();
});

describe("SchemaChain", () => {
  it("ничего не рендерит при пустой цепочке (AC-5)", () => {
    const { container } = render(<SchemaChain chain={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("показывает завершённый и идущий этап (AC-3)", () => {
    const chain: SchemaChainItem[] = [
      { stages: [{ id: "s1", title: "Групповой этап", configLabel: "4 гр.", state: "finished", waitingHint: "" }] },
      { stages: [{ id: "s2", title: "Плейофф", configLabel: "8", state: "running", waitingHint: "" }] },
    ];
    render(<SchemaChain chain={chain} />);
    expect(screen.getByText("Групповой этап")).toBeInTheDocument();
    expect(screen.getByText("Плейофф")).toBeInTheDocument();
    expect(screen.getByText("4 гр.")).toBeInTheDocument();
  });

  it("показывает пунктирный этап с подписью ожидания (AC-4)", () => {
    const chain: SchemaChainItem[] = [
      {
        stages: [
          {
            id: "s2",
            title: "Плейофф",
            configLabel: "8",
            state: "pending",
            waitingHint: "ждёт результаты «Групповой этап»",
          },
        ],
      },
    ];
    render(<SchemaChain chain={chain} />);
    expect(screen.getByText("ждёт результаты «Групповой этап»")).toBeInTheDocument();
  });

  it("показывает подпись-фолбэк, если waitingHint пуст у pending-этапа (AC-4)", () => {
    const chain: SchemaChainItem[] = [
      { stages: [{ id: "s2", title: "Плейофф", configLabel: "8", state: "pending", waitingHint: "" }] },
    ];
    render(<SchemaChain chain={chain} />);
    expect(screen.getByText(/ждёт результаты предыдущего этапа/i)).toBeInTheDocument();
  });

  it("рендерит параллельные этапы одного уровня рядом (FR-9)", () => {
    const chain: SchemaChainItem[] = [
      {
        stages: [
          { id: "s2", title: "Полуфинал A", configLabel: "4", state: "running", waitingHint: "" },
          { id: "s3", title: "Полуфинал B", configLabel: "4", state: "pending", waitingHint: "" },
        ],
      },
    ];
    render(<SchemaChain chain={chain} />);
    expect(screen.getByText("Полуфинал A")).toBeInTheDocument();
    expect(screen.getByText("Полуфинал B")).toBeInTheDocument();
  });

  it("оборачивает цепочку в прокручиваемый контейнер (NFR-3)", () => {
    const chain: SchemaChainItem[] = [
      { stages: [{ id: "s1", title: "Групповой этап", configLabel: "4 гр.", state: "finished", waitingHint: "" }] },
    ];
    const { container } = render(<SchemaChain chain={chain} />);
    expect(container.querySelector(".overflow-x-auto")).not.toBeNull();
  });
});
