import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
  },
}));

import { toast } from "sonner";

import { toastError, toastPending, toastSuccess, toastUndo } from "./toast";

describe("toast wrapper (FR-5, FR-6)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("toastSuccess вызывает toast.success", () => {
    toastSuccess("Сохранено");

    expect(toast.success).toHaveBeenCalledWith("Сохранено");
  });

  it("toastError без retry вызывает toast.error без действия", () => {
    toastError("Не удалось сохранить");

    expect(toast.error).toHaveBeenCalledTimes(1);
    const [message, options] = vi.mocked(toast.error).mock.calls[0]!;
    expect(message).toBe("Не удалось сохранить");
    expect(options?.action).toBeUndefined();
  });

  it("toastError с retry передаёт действие «Повторить»", () => {
    const retry = vi.fn();
    toastError("Не удалось сохранить", { retry });

    expect(toast.error).toHaveBeenCalledTimes(1);
    const [, options] = vi.mocked(toast.error).mock.calls[0]!;
    const action = options?.action as
      | { label: string; onClick: () => void }
      | undefined;
    expect(action?.label).toBe("Повторить");

    action?.onClick();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("toastUndo передаёт действие «Отменить»", () => {
    const onUndo = vi.fn();
    toastUndo("Пул снят с арены", { onUndo });

    expect(toast.success).toHaveBeenCalledTimes(1);
    const [message, options] = vi.mocked(toast.success).mock.calls[0]!;
    expect(message).toBe("Пул снят с арены");
    const action = options?.action as
      | { label: string; onClick: () => void }
      | undefined;
    expect(action?.label).toBe("Отменить");

    action?.onClick();
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("toastPending вызывает toast.loading", () => {
    toastPending("Пересчёт мест…");

    expect(toast.loading).toHaveBeenCalledWith("Пересчёт мест…");
  });
});
