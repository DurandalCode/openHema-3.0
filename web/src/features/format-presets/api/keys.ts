/**
 * formatPresetsKeys — query/mutation keys для фичи `format-presets` (спека
 * 0020, FR-11/FR-12). Библиотека глобальна — не привязана к номинации или
 * турниру (ADR 0014, §9), поэтому ключ без параметров (см. ADR 0006, по
 * образцу `features/stage-management/api/keys.ts`).
 */
export const formatPresetsKeys = {
  list: () => ["format-presets", "list"] as const,
};
