"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/lib/cn";
import { isActiveNavItem } from "@/shared/lib/is-active-nav-item";

export const ADMIN_NAV_ITEMS = [
  { title: "Пульт", href: "/admin/console" },
  { title: "Пользователи", href: "/admin" },
  { title: "Турнир", href: "/admin/tournament" },
  { title: "Номинации", href: "/admin/nominations" },
  { title: "Форматы", href: "/admin/formats" },
  { title: "Площадки", href: "/admin/arenas" },
  { title: "Заявки", href: "/admin/applications" },
  { title: "Бойцы", href: "/admin/fighters" },
] as const;

/**
 * AdminNavLinks — пункты навигации topbar'а админ-зоны с подсветкой
 * активного раздела по pathname (AC-4). Список — реальные разделы
 * приложения (перенесено из архивного `admin-nav.tsx`).
 *
 * «Пульт» — первый пункт (спека 0043): экран `/admin/console`, на котором
 * оператор проводит турнир, — до 0043 этот пункт был фантомом дефолта
 * исходного дизайна (наследие архивного Tournament Console, ADR 0015 п.3),
 * ведущим в никуда, и намеренно не рендерился (см. историю этого файла);
 * ADR 0017 п.5 снял это ограничение отдельной спекой, экран спроектирован
 * от домена, архивный макет не портирован.
 *
 * Вынесен в отдельный клиентский компонент: `usePathname` — client-only хук,
 * недоступен в серверном `widgets/admin-shell/admin-shell.tsx` (по образцу
 * `widgets/navbar/nav-links.tsx`).
 *
 * `hidden md:flex` (спека 0044, FR-6) — ниже `md:` навигация не помещается в
 * один ряд (восемь пунктов), её заменяет `AdminNavDrawer`.
 */
export function AdminNavLinks() {
  const pathname = usePathname();

  return (
    <nav className="hidden h-full items-center gap-5 text-sm md:flex">
      {ADMIN_NAV_ITEMS.map((item) => {
        const active = isActiveNavItem(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-full items-center text-muted-foreground transition-colors hover:text-foreground",
              active &&
                "font-medium text-foreground shadow-[inset_0_-2px_0_0_var(--primary)]",
            )}
          >
            {item.title}
          </Link>
        );
      })}
    </nav>
  );
}
