"use client";

import { useQuery } from "@tanstack/react-query";
import { listFormatPresetsRequest } from "./requests";
import { formatPresetsKeys } from "./keys";

/** usePresets — библиотека пресетов формата целиком (спека 0020, FR-12). */
export function usePresets() {
  return useQuery({
    queryKey: formatPresetsKeys.list(),
    queryFn: async () => {
      const res = await listFormatPresetsRequest();
      if (!res.ok) throw new Error(res.error);
      return res.presets;
    },
  });
}
