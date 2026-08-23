// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { EditProfileDialog } from "./edit-profile-dialog";
import type { CurrentUser } from "@/entities/user/lib/types";

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

const updateProfileRequestMock = vi.fn();
vi.mock("@/features/profile/api/requests", () => ({
  updateProfileRequest: (...args: unknown[]) => updateProfileRequestMock(...args),
}));

const user: CurrentUser = {
  id: "u1",
  email: "ivan@example.com",
  displayName: "Иван",
  role: "ROLE_USER",
  createdAt: "2026-01-14T00:00:00.000Z",
  club: "",
};

function renderDialog(props: Partial<Parameters<typeof EditProfileDialog>[0]> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpenChange = vi.fn();
  const utils = render(
    <QueryClientProvider client={qc}>
      <EditProfileDialog user={user} open onOpenChange={onOpenChange} {...props} />
    </QueryClientProvider>,
  );
  return { ...utils, onOpenChange };
}

describe("features/profile/ui/EditProfileDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("prefills the current name and club", () => {
    renderDialog();

    expect(screen.getByLabelText("Имя")).toHaveValue("Иван");
    expect(screen.getByLabelText(/клуб/i)).toHaveValue("");
  });

  it("rejects an empty name without calling the mutation (AC-13)", () => {
    renderDialog();

    fireEvent.change(screen.getByLabelText("Имя"), { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(screen.getByText("Имя не может быть пустым")).toBeInTheDocument();
    expect(updateProfileRequestMock).not.toHaveBeenCalled();
  });

  it("on success toasts, closes, and refreshes so the navbar picks up the new name (AC-11)", async () => {
    updateProfileRequestMock.mockResolvedValue({
      ok: true,
      user: { ...user, displayName: "Иван Кравцов", club: "Северный клинок" },
    });

    const { onOpenChange } = renderDialog();

    fireEvent.change(screen.getByLabelText("Имя"), { target: { value: "Иван Кравцов" } });
    fireEvent.change(screen.getByLabelText(/клуб/i), { target: { value: "Северный клинок" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(toastSuccess).toHaveBeenCalled();
    expect(routerRefresh).toHaveBeenCalled();
  });

  it("discards unsaved edits when the dialog is dismissed without saving (Escape)", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <QueryClientProvider client={qc}>
        <EditProfileDialog user={user} open onOpenChange={() => {}} />
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByLabelText("Имя"), { target: { value: "Незафиксированное имя" } });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(updateProfileRequestMock).not.toHaveBeenCalled();

    // Тот же экземпляр компонента: родитель отражает закрытие через open=false,
    // затем пользователь открывает диалог снова — поле должно вернуться к
    // сохранённому значению, а не остаться с недосохранённым черновиком.
    rerender(
      <QueryClientProvider client={qc}>
        <EditProfileDialog user={user} open={false} onOpenChange={() => {}} />
      </QueryClientProvider>,
    );
    rerender(
      <QueryClientProvider client={qc}>
        <EditProfileDialog user={user} open onOpenChange={() => {}} />
      </QueryClientProvider>,
    );

    expect(screen.getByLabelText("Имя")).toHaveValue("Иван");
  });

  it("shows the server error inline when the name is rejected server-side", async () => {
    updateProfileRequestMock.mockResolvedValue({ ok: false, error: "display name is required" });

    renderDialog();

    fireEvent.change(screen.getByLabelText("Имя"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(await screen.findByText("display name is required")).toBeInTheDocument();
  });
});
