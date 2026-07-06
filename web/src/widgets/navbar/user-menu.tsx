"use client";

import { LogOutIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { useLogout } from "@/features/auth/api/use-logout";
import type { CurrentUser } from "@/entities/user/lib/types";

/** initials — 1–2 буквы из displayName или email для аватара. */
function initials(user: CurrentUser): string {
  const src = user.displayName || user.email;
  return src
    .split(/[\s@]+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

/** UserMenu — меню залогиненного пользователя: аватар + email + выход. */
export function UserMenu({ user }: { user: CurrentUser }) {
  const router = useRouter();
  const logout = useLogout(() => {
    router.push("/");
    router.refresh();
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Avatar size="sm">
            <AvatarFallback>{initials(user)}</AvatarFallback>
          </Avatar>
          <span className="hidden max-w-32 truncate sm:inline">
            {user.displayName || user.email}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">
          {user.displayName || "Профиль"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => logout.mutate()}
          variant="destructive"
        >
          <LogOutIcon />
          Выйти
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
