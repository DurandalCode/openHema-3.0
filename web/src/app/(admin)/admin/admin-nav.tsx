"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/lib/cn";
import { isActiveNavItem } from "@/shared/lib/is-active-nav-item";
import { Row } from "@/shared/ui/stack";

const ADMIN_NAV_ITEMS = [
  { title: "Пользователи", href: "/admin" },
  { title: "Турнир", href: "/admin/tournament" },
  { title: "Номинации", href: "/admin/nominations" },
  { title: "Площадки", href: "/admin/arenas" },
  { title: "Заявки", href: "/admin/applications" },
  { title: "Бойцы", href: "/admin/fighters" },
  { title: "+ Создать админа", href: "/admin/create" },
] as const;

/**
 * AdminNav — под-навигация админ-зоны: единственный вход во все разделы
 * /admin/**, видимый только внутри неё. Активный раздел подсвечен (FR-3/FR-4).
 */
export function AdminNav() {
  const pathname = usePathname();

  return (
    <Row
      as="nav"
      align="center"
      gap={4}
      wrap
      className="border-b border-border/60 py-3 text-sm"
    >
      {ADMIN_NAV_ITEMS.map((item) => {
        const active = isActiveNavItem(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "text-muted-foreground transition-colors hover:text-foreground",
              active && "font-medium text-foreground"
            )}
          >
            {item.title}
          </Link>
        );
      })}
    </Row>
  );
}
