// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ApplyApplicationForm } from "./apply-application-form";
import { ApplicationRequestError } from "../api/mutation-error";
import { UnauthorizedError } from "@/shared/api/unauthorized";
import { loadDraft } from "../model/apply-draft";

beforeAll(() => {
  if (!("ResizeObserver" in window)) {
    // @ts-expect-error - минимальный polyfill для jsdom (Checkbox использует radix use-size)
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

afterEach(() => {
  cleanup();
});

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("@/shared/lib/toast", () => ({
  toastSuccess: (...args: unknown[]) => toastSuccess(...args),
  toastError: (...args: unknown[]) => toastError(...args),
}));

type MutateOpts = {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
};

const submitMutate = vi.fn();
let submitPending = false;
vi.mock("../api/use-submit-application", () => ({
  useSubmitApplication: () => ({
    mutate: (vars: unknown, opts?: MutateOpts) => submitMutate(vars, opts),
    isPending: submitPending,
  }),
}));

describe("features/my-applications/ui ApplyApplicationForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    submitPending = false;
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("renders an explicitly optional club field, an equipment checkbox and a submit button (FR-3)", () => {
    render(<ApplyApplicationForm nominationId="n1" />);

    expect(screen.getByLabelText(/клуб.*опционально/i)).toBeInTheDocument();
    expect(screen.getByText(/нужна экипировка/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Подать заявку" })).toBeInTheDocument();
  });

  it("keeps club and equipment fields controlled", () => {
    render(<ApplyApplicationForm nominationId="n1" />);

    const club = screen.getByLabelText(/клуб.*опционально/i) as HTMLInputElement;
    fireEvent.change(club, { target: { value: "Стальной град" } });
    expect(club.value).toBe("Стальной град");

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toHaveAttribute("data-state", "unchecked");
    fireEvent.click(checkbox);
    expect(checkbox).toHaveAttribute("data-state", "checked");
  });

  it("submits nominationId + club + needsEquipment and on success toasts and navigates to /applications (AC-3)", () => {
    submitMutate.mockImplementation((_vars, opts?: MutateOpts) => {
      opts?.onSuccess?.();
    });

    render(<ApplyApplicationForm nominationId="n1" />);

    fireEvent.change(screen.getByLabelText(/клуб.*опционально/i), {
      target: { value: "Стальной град" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Подать заявку" }));

    expect(submitMutate).toHaveBeenCalledWith(
      { nominationId: "n1", club: "Стальной град", needsEquipment: true },
      expect.any(Object),
    );
    expect(toastSuccess).toHaveBeenCalledWith("Заявка подана");
    expect(push).toHaveBeenCalledWith("/applications");
  });

  it("on failure toasts a human-readable message and keeps field values (AC-6)", () => {
    submitMutate.mockImplementation((_vars, opts?: MutateOpts) => {
      opts?.onError?.(
        new ApplicationRequestError("Вы уже подали заявку в эту номинацию", 409),
      );
    });

    render(<ApplyApplicationForm nominationId="n1" />);

    const club = screen.getByLabelText(/клуб.*опционально/i) as HTMLInputElement;
    fireEvent.change(club, { target: { value: "Стальной град" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Подать заявку" }));

    expect(toastError).toHaveBeenCalledWith("Вы уже подали заявку в эту номинацию");
    expect(push).not.toHaveBeenCalled();
    expect(club.value).toBe("Стальной град");
    expect(screen.getByRole("checkbox")).toHaveAttribute("data-state", "checked");
  });

  it("translates a generic transport error via applicationErrorMessage rather than showing raw text", () => {
    submitMutate.mockImplementation((_vars, opts?: MutateOpts) => {
      opts?.onError?.(new ApplicationRequestError("network boom", undefined));
    });

    render(<ApplyApplicationForm nominationId="n1" />);
    fireEvent.click(screen.getByRole("button", { name: "Подать заявку" }));

    expect(toastError).toHaveBeenCalledWith("Не удалось выполнить действие, попробуйте ещё раз");
  });

  it("does not toast on UnauthorizedError — the session-expired dialog already explains it (spec 0038, FR-18/AC-10)", () => {
    submitMutate.mockImplementation((_vars, opts?: MutateOpts) => {
      opts?.onError?.(new UnauthorizedError());
    });

    render(<ApplyApplicationForm nominationId="n1" />);
    fireEvent.click(screen.getByRole("button", { name: "Подать заявку" }));

    expect(toastError).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("restores a locally saved draft into the fields on mount (FR-19)", () => {
    const { unmount } = render(<ApplyApplicationForm nominationId="n1" />);

    fireEvent.change(screen.getByLabelText(/клуб.*опционально/i), {
      target: { value: "Стальной град" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    unmount();

    render(<ApplyApplicationForm nominationId="n1" />);

    expect((screen.getByLabelText(/клуб.*опционально/i) as HTMLInputElement).value).toBe(
      "Стальной град",
    );
    expect(screen.getByRole("checkbox")).toHaveAttribute("data-state", "checked");
  });

  it("does not leak a draft from one nomination into another (FR-21)", () => {
    const { unmount } = render(<ApplyApplicationForm nominationId="n1" />);

    fireEvent.change(screen.getByLabelText(/клуб.*опционально/i), {
      target: { value: "Стальной град" },
    });
    unmount();

    render(<ApplyApplicationForm nominationId="n2" />);

    expect((screen.getByLabelText(/клуб.*опционально/i) as HTMLInputElement).value).toBe("");
  });

  it("clears the draft after a successful submit (FR-21)", () => {
    submitMutate.mockImplementation((_vars, opts?: MutateOpts) => {
      opts?.onSuccess?.();
    });

    const { unmount } = render(<ApplyApplicationForm nominationId="n1" />);

    fireEvent.change(screen.getByLabelText(/клуб.*опционально/i), {
      target: { value: "Стальной град" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Подать заявку" }));
    unmount();

    expect(loadDraft("n1")).toBeNull();

    render(<ApplyApplicationForm nominationId="n1" />);
    expect((screen.getByLabelText(/клуб.*опционально/i) as HTMLInputElement).value).toBe("");
  });
});
