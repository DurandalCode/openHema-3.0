// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NominationPools } from "./nomination-pools";
import type { PoolLayout } from "@/entities/pool/lib/types";

const layout: PoolLayout = {
  nominationId: "n1",
  status: "POOL_LAYOUT_STATUS_DRAFT",
  unassigned: [],
  pools: [],
  canUndo: false,
  stage: {
    id: "stage-1",
    nominationId: "n1",
    position: 0,
    title: "Групповой этап",
    type: "STAGE_TYPE_GROUPS",
    status: "POOL_LAYOUT_STATUS_DRAFT",
    bracket: null,
    groups: null,
    rule: null,
  },
};

/** mutationStub — заглушка результата useMutation (TanStack Query), минимум полей, которые читает компонент. */
function mutationStub() {
  return { mutate: vi.fn(), isPending: false, error: null };
}

// NominationPools зовёт девять хуков напрямую (useLayout/useBouts — useQuery,
// остальные — useMutation). Здесь проверяется чистый рендер по данным
// раскладки, поэтому все хуки мокаются заглушками без сети/QueryClient — по
// образцу useNominationLive в nomination-pools-public.test.tsx.
vi.mock("../api/use-layout", () => ({
  useLayout: () => ({ data: layout, isLoading: false, error: null }),
}));
vi.mock("../api/use-create-pool", () => ({ useCreatePool: () => mutationStub() }));
vi.mock("../api/use-delete-pool", () => ({ useDeletePool: () => mutationStub() }));
vi.mock("../api/use-reset-layout", () => ({ useResetLayout: () => mutationStub() }));
vi.mock("../api/use-assign-fighter", () => ({ useAssignFighter: () => mutationStub() }));
vi.mock("../api/use-unassign-fighter", () => ({ useUnassignFighter: () => mutationStub() }));
vi.mock("../api/use-auto-distribute", () => ({ useAutoDistribute: () => mutationStub() }));
vi.mock("../api/use-undo", () => ({ useUndo: () => mutationStub() }));
vi.mock("../api/use-set-layout-status", () => ({ useSetLayoutStatus: () => mutationStub() }));
vi.mock("../api/use-bouts", () => ({ useBouts: () => ({ data: [] }) }));

describe("NominationPools", () => {
  // Спека 0017, FR-11/AC-3: на экране раскладки номинации состав по группам
  // подписан названием этапа, которому он принадлежит.
  it("renders the stage title above the pool grid", () => {
    const { container } = render(<NominationPools stageId="stage-1" />);

    expect(container).toHaveTextContent("Групповой этап");
  });
});
