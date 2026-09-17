// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { useResetBracket } from "./use-reset-bracket";
import { useUndoBracket } from "./use-undo-bracket";
import { useSetBracketStatus } from "./use-set-bracket-status";
import { bracketErrorMessage } from "./errors";
import { bracketSeedingKeys } from "./keys";

const resetBracketRequestMock = vi.fn();
const undoBracketRequestMock = vi.fn();
const setStatusRequestMock = vi.fn();

vi.mock("./requests", () => ({
  resetBracketRequest: (...args: unknown[]) => resetBracketRequestMock(...args),
  undoBracketRequest: (...args: unknown[]) => undoBracketRequestMock(...args),
  setStatusRequest: (...args: unknown[]) => setStatusRequestMock(...args),
}));

function spyOnInvalidate(client: QueryClient) {
  return vi.spyOn(client, "invalidateQueries");
}

let qc: QueryClient;
let invalidateSpy: ReturnType<typeof spyOnInvalidate>;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

/** Ключи, с которыми мутация звала invalidateQueries, как плоские строки. */
function invalidatedKeys(): string[] {
  return invalidateSpy.mock.calls.map((call) => JSON.stringify(call[0]?.queryKey));
}

beforeEach(() => {
  vi.clearAllMocks();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  invalidateSpy = spyOnInvalidate(qc);
});

/**
 * Сброс/undo/фиксация посева меняют не только сетку, но и сам этап: состав,
 * статус раскладки, исполнительный статус. Шапка страницы этапа и карточка
 * на схеме читают это из `useStages` с общим `staleTime: 60s`, поэтому без
 * инвалидации списка этапов они до минуты показывают состояние, которого
 * уже нет (тело экрана при этом уже перерисовано по свежей сетке).
 *
 * `nominationId` этим хукам недоступен (FSD запрещает импорт чужой фичи, а
 * вызывающие стороны знают только stageId), поэтому инвалидация идёт по
 * префиксу ключа — тот же приём, что в `use-set-layout-status.ts` для боёв.
 */
describe("features/bracket-seeding/api — инвалидация после мутаций посева", () => {
  it("useResetBracket invalidates both the bracket and the stage list", async () => {
    resetBracketRequestMock.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useResetBracket("s1"), { wrapper });

    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidatedKeys()).toEqual([
      JSON.stringify(bracketSeedingKeys.bracket("s1")),
      JSON.stringify(["stage-management", "list"]),
    ]);
  });

  it("useUndoBracket invalidates both the bracket and the stage list", async () => {
    undoBracketRequestMock.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useUndoBracket("s1"), { wrapper });

    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidatedKeys()).toEqual([
      JSON.stringify(bracketSeedingKeys.bracket("s1")),
      JSON.stringify(["stage-management", "list"]),
    ]);
  });

  it("useSetBracketStatus also invalidates bouts — locking a bracket materializes them", async () => {
    setStatusRequestMock.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useSetBracketStatus("s1"), { wrapper });

    result.current.mutate("ready");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidatedKeys()).toEqual([
      JSON.stringify(bracketSeedingKeys.bracket("s1")),
      JSON.stringify(["stage-management", "list"]),
      JSON.stringify(["nomination-pools", "bouts"]),
    ]);
  });
});

/**
 * Перевод отказа живёт в `mutationFn`: только там ещё есть HTTP-статус, по
 * которому `bracketErrorMessage` и различает случаи. Вызывающая сторона
 * показывает готовый `err.message` — см. `bracket-seeding.tsx`.
 */
describe("features/bracket-seeding/api — перевод отказа по HTTP-статусу", () => {
  it("translates a 409 into the specific message, not the generic one", async () => {
    resetBracketRequestMock.mockResolvedValue({ ok: false, error: "layout is ready", status: 409 });
    const { result } = renderHook(() => useResetBracket("s1"), { wrapper });

    result.current.mutate();
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe(bracketErrorMessage("layout is ready", 409));
    expect(result.current.error?.message).not.toBe(bracketErrorMessage("layout is ready"));
  });

  it("translates a 404 — the shape a bracket without containers used to answer", async () => {
    setStatusRequestMock.mockResolvedValue({ ok: false, error: "pool: not found", status: 404 });
    const { result } = renderHook(() => useSetBracketStatus("s1"), { wrapper });

    result.current.mutate("ready");
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe(bracketErrorMessage("pool: not found", 404));
  });

  it("never leaks the raw Go-domain error string", async () => {
    undoBracketRequestMock.mockResolvedValue({ ok: false, error: "nothing to undo", status: 409 });
    const { result } = renderHook(() => useUndoBracket("s1"), { wrapper });

    result.current.mutate();
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).not.toMatch(/nothing to undo/);
  });
});
