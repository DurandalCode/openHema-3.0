import type { PoolLayoutStatus } from "@/entities/pool/lib/types";
import type {
  SchemaIssue,
  Stage,
  StageSelectorKind,
  StageSourceKind,
} from "@/entities/stage/lib/types";
import { apiFetch } from "@/shared/api/api-fetch";

/**
 * requests — фетчеры фичи `stage-management` (спека 0018, FR-1/FR-2/FR-3;
 * 0019, FR-1..FR-9a): список/создание/удаление этапов номинации, правило
 * отбора этапа. По образцу `features/nomination-pools/api/requests.ts` —
 * result-объекты `{ok:true,...}|{ok:false,error}`, сеть/4xx маппятся
 * единообразно.
 */

export type StagesResult = { ok: true; stages: Stage[] } | { ok: false; error: string };

/**
 * ListStagesResult — как `StagesResult`, но с диагностикой схемы (спека
 * 0020, FR-8): `ListStages` — единственный ответ, где она есть
 * (`DeleteStageResponse` её не несёт), отдельный тип точнее общего
 * `StagesResult`.
 */
export type ListStagesResult =
  | { ok: true; stages: Stage[]; issues: SchemaIssue[] }
  | { ok: false; error: string };

export type CreateStageResult =
  | { ok: true; stage: Stage; stages: Stage[] }
  | { ok: false; error: string };

export type SetStageRuleResult = { ok: true; stage: Stage } | { ok: false; error: string };

/**
 * SetStageStatusResult — итог фиксации/расфиксации состава этапа (спека
 * 0031, FR-22). Только `status` — инспектор не нуждается в полной
 * `PoolLayout`, статус самого этапа берётся из инвалидации списка этапов
 * номинации (`stageManagementKeys.list`).
 */
export type SetStageStatusResult =
  | { ok: true; status: PoolLayoutStatus }
  | { ok: false; error: string };

/**
 * UpdateStageInput — правка уже созданного этапа (спека 0020, FR-2): название
 * — всегда; конфиг (`bracket` у сетки, `groups` у группового этапа) —
 * ровно то поле, что соответствует типу этапа (сервер отклоняет несоответствие
 * `ErrInvalidInput`, `service/schema.go`). Тип этапа не передаётся — он не
 * редактируется вовсе (AC-3).
 */
export type UpdateStageInput = {
  title: string;
  bracket?: { size: number; thirdPlace: boolean };
  groups?: { groupCount: number };
};

export type UpdateStageResult = { ok: true; stage: Stage } | { ok: false; error: string };

/**
 * SeedingRuleInput — правило отбора, как его собирает клиент (0019, FR-1..
 * FR-3): без `method` — метод раскладки выводит сервер из типа целевого
 * этапа (FR-4), организатору не предлагается.
 */
export type SeedingRuleInput = {
  sourceKind: StageSourceKind;
  sourceStageId: string;
  selector: StageSelectorKind;
  placeFrom: number;
  placeTo: number; // 0 — открытая граница
};

export type CreateStageInput =
  | {
      type: "bracket";
      title: string;
      bracketSize: number;
      thirdPlace: boolean;
      rule?: SeedingRuleInput;
    }
  | {
      type: "groups";
      title: string;
      groupCount: number;
      rule?: SeedingRuleInput;
    };

/** listStagesRequest — GET /api/nominations/[id]/stages (список этапов номинации). */
export async function listStagesRequest(nominationId: string): Promise<ListStagesResult> {
  const res = await apiFetch<{ stages?: Stage[]; issues?: SchemaIssue[] }>(
    `/api/nominations/${encodeURIComponent(nominationId)}/stages`,
    { method: "GET" },
  );
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, stages: res.data.stages ?? [], issues: res.data.issues ?? [] };
}

/**
 * createStageRequest — POST /api/nominations/[id]/stages: добавляет этап —
 * сетку (FR-1/FR-2, спека 0018) либо группы (0019, FR-7), с опциональным
 * правилом отбора (0019, FR-1/FR-6). BFF-ответ несёт proto-поле `created`.
 */
export async function createStageRequest(
  nominationId: string,
  input: CreateStageInput,
): Promise<CreateStageResult> {
  const body =
    input.type === "bracket"
      ? {
          type: "bracket" as const,
          title: input.title,
          bracketSize: input.bracketSize,
          thirdPlace: input.thirdPlace,
          ...(input.rule ? { rule: input.rule } : {}),
        }
      : {
          type: "groups" as const,
          title: input.title,
          groupCount: input.groupCount,
          ...(input.rule ? { rule: input.rule } : {}),
        };
  const res = await apiFetch<{ created?: Stage; stages?: Stage[] }>(
    `/api/nominations/${encodeURIComponent(nominationId)}/stages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, stage: res.data.created as Stage, stages: res.data.stages ?? [] };
}

/** deleteStageRequest — DELETE /api/stages/[stageId] (только сетка без начатых боёв, AC-14). */
export async function deleteStageRequest(stageId: string): Promise<StagesResult> {
  const res = await apiFetch<{ stages?: Stage[] }>(`/api/stages/${encodeURIComponent(stageId)}`, {
    method: "DELETE",
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, stages: res.data.stages ?? [] };
}

/**
 * updateStageRequest — PATCH /api/stages/[stageId]: правит название и/или
 * конфиг этапа (спека 0020, FR-2). Конфиг реально меняется только пока
 * состав пуст и этап в черновике (`ErrStageLocked`) — сервер отклоняет
 * попытку иначе (AC-2), клиент показывает его ошибку.
 */
export async function updateStageRequest(
  stageId: string,
  input: UpdateStageInput,
): Promise<UpdateStageResult> {
  const res = await apiFetch<{ stage?: Stage }>(`/api/stages/${encodeURIComponent(stageId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, stage: res.data.stage as Stage };
}

/**
 * setStageRuleRequest — PUT /api/stages/[stageId]/rule: задаёт или снимает
 * (`rule = null`) правило отбора этапа (0019, FR-6). Разрешено, пока состав
 * этапа пуст — сервер отклоняет иначе (AC-16), клиент показывает его ошибку.
 */
export async function setStageRuleRequest(
  stageId: string,
  rule: SeedingRuleInput | null,
): Promise<SetStageRuleResult> {
  const res = await apiFetch<{ stage?: Stage }>(`/api/stages/${encodeURIComponent(stageId)}/rule`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rule }),
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, stage: res.data.stage as Stage };
}

/**
 * setStageStatusRequest — POST /api/stages/[stageId]/status: фиксация
 * состава этапа draft↔ready (спека 0031, FR-22). Тот же BFF-маршрут, что
 * используют `nomination-pools`/`bracket-seeding` (0030) — фетчер здесь
 * намеренный дубль их тонких фетчеров (правило 6 `web/AGENTS.md` запрещает
 * `features` импортировать друг друга, см. `plan.md` риск «вторая точка
 * входа»). Ответ маршрута несёт `{ layout }` (общая форма с `nomination-pools`
 * — единственный статус-эндпоинт на все типы этапов), клиенту нужен только
 * итоговый `status`.
 */
export async function setStageStatusRequest(
  stageId: string,
  status: "draft" | "ready",
): Promise<SetStageStatusResult> {
  const res = await apiFetch<{ layout?: { status?: PoolLayoutStatus } }>(
    `/api/stages/${encodeURIComponent(stageId)}/status`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    },
  );
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, status: res.data.layout?.status ?? "POOL_LAYOUT_STATUS_UNSPECIFIED" };
}
