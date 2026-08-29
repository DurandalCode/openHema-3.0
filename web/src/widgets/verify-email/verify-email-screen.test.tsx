// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VerifyEmailScreen } from "./verify-email-screen";

const mutate = vi.fn(
  (_token: string, opts?: { onSuccess?: () => void; onError?: () => void }) => {
    lastOpts = opts;
  },
);
let lastOpts: { onSuccess?: () => void; onError?: () => void } | undefined;

vi.mock("@/features/profile/api/use-verify-email", () => ({
  useVerifyEmail: () => ({ mutate }),
}));

describe("widgets/verify-email/VerifyEmailScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastOpts = undefined;
  });

  afterEach(() => {
    cleanup();
  });

  it("empty token: shows the unified invalid-link message without calling the mutation", () => {
    render(<VerifyEmailScreen token="" />);

    expect(screen.getByText(/ссылка недействительна или устарела/i)).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("valid token: shows a pending state and calls the mutation on mount", () => {
    render(<VerifyEmailScreen token="tok123" />);

    expect(screen.getByText(/подтверждаем/i)).toBeInTheDocument();
    expect(mutate).toHaveBeenCalledWith("tok123", expect.anything());
  });

  it("successful verification shows a success screen with a dashboard link", () => {
    render(<VerifyEmailScreen token="tok123" />);

    act(() => lastOpts?.onSuccess?.());

    expect(screen.getByText("Адрес подтверждён")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /кабинет/i })).toBeInTheDocument();
  });

  it("failed verification shows the unified invalid-link message", () => {
    render(<VerifyEmailScreen token="tok123" />);

    act(() => lastOpts?.onError?.());

    expect(screen.getByText(/ссылка недействительна или устарела/i)).toBeInTheDocument();
  });
});
