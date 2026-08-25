// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { UnsavedGuardDialog } from "./unsaved-guard-dialog";
import { useUnsavedGuardStore } from "@/shared/lib/unsaved-guard-store";

const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
});

function clickAnchor(anchor: Element, init: MouseEventInit = {}) {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init });
  const preventDefaultSpy = vi.spyOn(event, "preventDefault");
  // Диспатчим настоящий DOM-клик напрямую (не React-синтетический,
  // fireEvent.click здесь не подходит — нужен контроль над preventDefault
  // до React), поэтому оборачиваем в act(): наш обработчик пишет в zustand
  // вне React-событийной системы, и без act() тест не дождётся ререндера.
  act(() => {
    anchor.dispatchEvent(event);
  });
  return preventDefaultSpy;
}

describe("UnsavedGuardDialog (spec 0039, T20)", () => {
  beforeEach(() => {
    routerPush.mockClear();
    useUnsavedGuardStore.setState({ dirtyReason: null, pendingHref: null });
  });

  afterEach(() => {
    cleanup();
    useUnsavedGuardStore.setState({ dirtyReason: null, pendingHref: null });
  });

  it("intercepts an internal link click while dirty and does not navigate immediately (AC-9)", () => {
    useUnsavedGuardStore.setState({ dirtyReason: "профиль турнира", pendingHref: null });
    render(
      <>
        <UnsavedGuardDialog />
        <a href="/about">About</a>
      </>,
    );

    const spy = clickAnchor(screen.getByRole("link", { name: "About" }));

    expect(spy).toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Несохранённые изменения" })).toBeInTheDocument();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("'Уйти без сохранения' navigates to the pending href and clears the dirty flag", () => {
    useUnsavedGuardStore.setState({ dirtyReason: "профиль турнира", pendingHref: null });
    render(
      <>
        <UnsavedGuardDialog />
        <a href="/about">About</a>
      </>,
    );
    clickAnchor(screen.getByRole("link", { name: "About" }));

    fireEvent.click(screen.getByRole("button", { name: "Уйти без сохранения" }));

    expect(routerPush).toHaveBeenCalledWith("/about");
    expect(useUnsavedGuardStore.getState().dirtyReason).toBeNull();
    expect(useUnsavedGuardStore.getState().pendingHref).toBeNull();
  });

  it("'Остаться' keeps the dirty flag, clears the pending href, and does not navigate", () => {
    useUnsavedGuardStore.setState({ dirtyReason: "профиль турнира", pendingHref: null });
    render(
      <>
        <UnsavedGuardDialog />
        <a href="/about">About</a>
      </>,
    );
    clickAnchor(screen.getByRole("link", { name: "About" }));

    fireEvent.click(screen.getByRole("button", { name: "Остаться" }));

    expect(routerPush).not.toHaveBeenCalled();
    expect(useUnsavedGuardStore.getState().dirtyReason).toBe("профиль турнира");
    expect(useUnsavedGuardStore.getState().pendingHref).toBeNull();
  });

  it("lets navigation through as usual when the screen is clean (AC-10)", () => {
    render(
      <>
        <UnsavedGuardDialog />
        <a href="/about">About</a>
      </>,
    );

    const spy = clickAnchor(screen.getByRole("link", { name: "About" }));

    expect(spy).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("heading", { name: "Несохранённые изменения" }),
    ).not.toBeInTheDocument();
  });

  it("does not intercept a link to an external domain", () => {
    useUnsavedGuardStore.setState({ dirtyReason: "профиль турнира", pendingHref: null });
    render(
      <>
        <UnsavedGuardDialog />
        <a href="https://example.com">External</a>
      </>,
    );

    const spy = clickAnchor(screen.getByRole("link", { name: "External" }));

    expect(spy).not.toHaveBeenCalled();
  });

  it("does not intercept a target=_blank link", () => {
    useUnsavedGuardStore.setState({ dirtyReason: "профиль турнира", pendingHref: null });
    render(
      <>
        <UnsavedGuardDialog />
        <a href="/regulations.pdf" target="_blank">
          Regulations
        </a>
      </>,
    );

    const spy = clickAnchor(screen.getByRole("link", { name: "Regulations" }));

    expect(spy).not.toHaveBeenCalled();
  });

  it("does not intercept a modified click (e.g. ctrl+click opening a new tab)", () => {
    useUnsavedGuardStore.setState({ dirtyReason: "профиль турнира", pendingHref: null });
    render(
      <>
        <UnsavedGuardDialog />
        <a href="/about">About</a>
      </>,
    );

    const spy = clickAnchor(screen.getByRole("link", { name: "About" }), { ctrlKey: true });

    expect(spy).not.toHaveBeenCalled();
  });

  it("does not intercept a link explicitly opted out via data-unsaved-guard=\"ignore\"", () => {
    useUnsavedGuardStore.setState({ dirtyReason: "профиль турнира", pendingHref: null });
    render(
      <>
        <UnsavedGuardDialog />
        <a href="/about" data-unsaved-guard="ignore">
          About
        </a>
      </>,
    );

    const spy = clickAnchor(screen.getByRole("link", { name: "About" }));

    expect(spy).not.toHaveBeenCalled();
  });
});
