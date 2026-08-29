// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EmailChangeConfirmScreen } from "./email-change-confirm-screen";

const mutate = vi.fn(
  (_token: string, opts?: { onSuccess?: () => void; onError?: () => void }) => {
    lastOpts = opts;
  },
);
let lastOpts: { onSuccess?: () => void; onError?: () => void } | undefined;

vi.mock("@/features/profile/api/use-confirm-email-change", () => ({
  useConfirmEmailChange: () => ({ mutate }),
}));

describe("widgets/email-change-confirm/EmailChangeConfirmScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastOpts = undefined;
  });

  afterEach(() => {
    cleanup();
  });

  it("empty token: shows the unified invalid message without calling the mutation", () => {
    render(<EmailChangeConfirmScreen token="" />);

    expect(
      screen.getByText(/ссылка недействительна, устарела, или адрес уже занят/i),
    ).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("valid token: shows a pending state and calls the mutation on mount", () => {
    render(<EmailChangeConfirmScreen token="tok123" />);

    expect(screen.getByText(/подтверждаем/i)).toBeInTheDocument();
    expect(mutate).toHaveBeenCalledWith("tok123", expect.anything());
  });

  it("successful confirmation shows a success screen with a dashboard link", () => {
    render(<EmailChangeConfirmScreen token="tok123" />);

    act(() => lastOpts?.onSuccess?.());

    expect(screen.getByText("Адрес изменён")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /кабинет/i })).toBeInTheDocument();
  });

  it("failed confirmation (expired/used/taken) shows the unified message", () => {
    render(<EmailChangeConfirmScreen token="tok123" />);

    act(() => lastOpts?.onError?.());

    expect(
      screen.getByText(/ссылка недействительна, устарела, или адрес уже занят/i),
    ).toBeInTheDocument();
  });
});
