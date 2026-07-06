"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthDialogStore } from "@/features/auth/model/auth-dialog-store";

/**
 * LoginPage — deep-link для входа.
 * Открывает AuthDialog в режиме "login" и заменяет URL на "/", чтобы
 * пользователь остался на главной с открытой модалкой.
 */
export default function LoginPage() {
  const router = useRouter();
  const open = useAuthDialogStore((s) => s.open);

  useEffect(() => {
    open("login");
    router.replace("/");
  }, [open, router]);

  return null;
}
