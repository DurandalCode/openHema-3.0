// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ChangeEmailDialog } from "./change-email-dialog";

beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
});

const routerRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh }),
}));

const toastSuccess = vi.fn();
vi.mock("@/shared/lib/toast", () => ({
  toastSuccess: (...args: unknown[]) => toastSuccess(...args),
}));

const requestEmailChangeRequestMock = vi.fn();
vi.mock("@/features/profile/api/requests", () => ({
  requestEmailChangeRequest: (...args: unknown[]) => requestEmailChangeRequestMock(...args),
}));

function renderDialog(props: Partial<Parameters<typeof ChangeEmailDialog>[0]> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpenChange = vi.fn();
  const utils = render(
    <QueryClientProvider client={qc}>
      <ChangeEmailDialog open onOpenChange={onOpenChange} {...props} />
    </QueryClientProvider>,
  );
  return { ...utils, onOpenChange };
}

describe("features/profile/ui/ChangeEmailDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("submits new email + current password to the mutation", async () => {
    requestEmailChangeRequestMock.mockResolvedValue({
      ok: true,
      user: { id: "u1", pendingEmail: "new@example.com" },
    });

    const { onOpenChange } = renderDialog();

    fireEvent.change(screen.getByLabelText("Новый адрес"), {
      target: { value: "new@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Текущий пароль"), {
      target: { value: "current-pw" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Отправить письмо" }));

    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(requestEmailChangeRequestMock).toHaveBeenCalledWith("new@example.com", "current-pw");
    expect(toastSuccess).toHaveBeenCalled();
    expect(routerRefresh).toHaveBeenCalled();
  });

  it("shows the server error inline on a wrong password or taken address", async () => {
    requestEmailChangeRequestMock.mockResolvedValue({ ok: false, error: "email taken" });

    renderDialog();

    fireEvent.change(screen.getByLabelText("Новый адрес"), {
      target: { value: "taken@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Текущий пароль"), {
      target: { value: "pw" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Отправить письмо" }));

    expect(await screen.findByText("email taken")).toBeInTheDocument();
  });
});
