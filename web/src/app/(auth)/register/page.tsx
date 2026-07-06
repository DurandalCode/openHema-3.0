"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthDialogStore } from "@/features/auth/model/auth-dialog-store";

/**
 * RegisterPage — deep-link для регистрации.
 * Открывает AuthDialog в режиме "register" и заменяет URL на "/", чтобы
 * пользователь остался на главной с открытой модалкой.
 */
export default function RegisterPage() {
  const router = useRouter();
  const open = useAuthDialogStore((s) => s.open);

  useEffect(() => {
    open("register");
    router.replace("/");
  }, [open, router]);

  return null;
}
