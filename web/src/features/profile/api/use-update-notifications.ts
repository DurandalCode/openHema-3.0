"use client";

import { useMutation } from "@tanstack/react-query";
import { updateNotificationSettingsRequest } from "./requests";
import type { NotificationSettings } from "@/entities/user/lib/types";

/**
 * useUpdateNotifications — мутация правки личных переключателей
 * уведомлений (спека 0042, FR-20). Включение при неподтверждённом адресе
 * отклоняется сервером (409, FR-21) — `mutation.error.message` несёт
 * объяснение.
 */
export function useUpdateNotifications() {
  return useMutation({
    mutationFn: async (settings: NotificationSettings) => {
      const result = await updateNotificationSettingsRequest(settings);
      if (!result.ok) throw new Error(result.error);
      return result.user;
    },
  });
}
