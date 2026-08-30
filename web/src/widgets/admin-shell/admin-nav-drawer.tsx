"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog";
import { cn } from "@/shared/lib/cn";
import { isActiveNavItem } from "@/shared/lib/is-active-nav-item";
import { ADMIN_NAV_ITEMS } from "./admin-nav-links";

/**
 * AdminNavDrawer — мобильная навигация админ-зоны (spec 0044, FR-6/AC-4):
 * те же пункты, что у широкого `AdminNavLinks` (`ADMIN_NAV_ITEMS`, единый
 * источник), через явно открывающуюся полноэкранную панель — не через
 * горизонтальный скролл вкладок. Собран поверх уже используемого в проекте
 * `Dialog` (`shared/ui/dialog.tsx`, full-screen на мобильном с 0044 T2) —
 * отдельный Sheet-примитив ради одного потребителя не заводим (план,
 * «Риски»). Триггер скрыт от `md:` (широкий вид — `AdminNavLinks`).
 */
export function AdminNavDrawer() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Открыть меню"
          className="md:hidden"
        >
          <MenuIcon className="size-5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Навигация</DialogTitle>
        <nav
          aria-label="Навигация админ-зоны"
          className="flex flex-col gap-1"
        >
          {ADMIN_NAV_ITEMS.map((item) => {
            const active = isActiveNavItem(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex h-12 items-center rounded-md px-3 text-base text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  active && "bg-accent font-medium text-foreground",
                )}
              >
                {item.title}
              </Link>
            );
          })}
        </nav>
      </DialogContent>
    </Dialog>
  );
}
