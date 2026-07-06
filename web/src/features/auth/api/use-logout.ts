"use client";

import { useMutation } from "@tanstack/react-query";
import { logoutRequest } from "./requests";

/**
 * useLogout — мутация выхода. `onSuccess` пробрасывается вызывающим
 * (router.push + router.refresh). Логика единая для UserMenu и LogoutButton.
 */
export function useLogout(onSuccess: () => void) {
  return useMutation({
    mutationFn: () => logoutRequest(),
    onSuccess,
  });
}
