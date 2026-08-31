// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const open = vi.fn();

vi.mock("@/features/auth/model/auth-dialog-store", () => ({
  useAuthDialogStore: { getState: () => ({ open }) },
}));

import { PreprodGateScreen } from "./preprod-gate-screen";

describe("PreprodGateScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("opens the login auth dialog on mount and shows an invitation to sign in", () => {
    render(<PreprodGateScreen />);

    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith("login");
    expect(screen.getByText(/войд/i)).toBeInTheDocument();
  });
});
