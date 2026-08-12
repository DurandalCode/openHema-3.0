// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ErrorPage from "./error";

// Спека 0023, T18 (AC-5, NFR-4): страница необработанной ошибки рендера.
// Обязательные элементы — кнопка повтора (`reset`) и копируемый
// идентификатор ошибки (`error.digest`). Критично: текст НЕ должен обещать,
// что повтор безопасен или что операция применится ровно один раз — журнал
// боёв event-sourced с конфликтом версии потока (ADR 0011), идемпотентность
// произвольного действия ничем не обеспечена.

describe("app/error.tsx", () => {
  afterEach(() => {
    cleanup();
  });

  it("calls reset when the retry button is clicked", () => {
    const reset = vi.fn();
    const error = Object.assign(new Error("boom"), { digest: "err-abc-123" });
    render(<ErrorPage error={error} reset={reset} />);

    fireEvent.click(screen.getByRole("button", { name: /повторить/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("shows the error identifier", () => {
    const reset = vi.fn();
    const error = Object.assign(new Error("boom"), { digest: "err-abc-123" });
    render(<ErrorPage error={error} reset={reset} />);

    expect(screen.getByText(/err-abc-123/)).toBeInTheDocument();
  });

  it("shows a fallback identifier when the error has no digest", () => {
    const reset = vi.fn();
    render(<ErrorPage error={new Error("boom")} reset={reset} />);

    // Не падает и не оставляет плейсхолдер пустым — какой-то текст-заглушка
    // всё равно отображается рядом с меткой идентификатора.
    expect(screen.getByText(/ID ошибки/i)).toBeInTheDocument();
  });

  it("does NOT promise that retrying is safe or that the action applies exactly once (AC-5, NFR-4)", () => {
    const reset = vi.fn();
    const error = Object.assign(new Error("boom"), { digest: "err-abc-123" });
    render(<ErrorPage error={error} reset={reset} />);

    const body = document.body.textContent ?? "";
    expect(body).not.toMatch(/повтор(ить)?\s+безопасен/i);
    expect(body).not.toMatch(/безопасно повтор/i);
    expect(body).not.toMatch(/применит(ся|ь)\s+(ровно\s+)?один раз/i);
    expect(body).not.toMatch(/можно смело повтор/i);
  });
});
