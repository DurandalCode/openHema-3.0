"use client";

import { LogOutIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLogout } from "@/features/auth/api/use-logout";
import { Button } from "@/shared/ui/button";

export function LogoutButton() {
  const router = useRouter();
  const logout = useLogout(() => {
    router.push("/");
    router.refresh();
  });

  return (
    <Button
      variant="outline"
      onClick={() => logout.mutate()}
      loading={logout.isPending}
      className="mt-6 gap-2"
    >
      {!logout.isPending && <LogOutIcon />}
      Выйти
    </Button>
  );
}
