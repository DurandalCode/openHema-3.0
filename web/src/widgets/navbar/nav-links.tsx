"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/lib/cn";
import { isActiveNavItem } from "@/shared/lib/is-active-nav-item";
import { isAdminRoute } from "@/shared/lib/is-admin-route";
import type { NavItem } from "@/shared/config/site-config";
import { Row } from "@/shared/ui/stack";

/**
 * NavLinks — пункты навигации верхнего уровня с подсветкой активного роута.
 * Якорные пункты (`/#id`) ведут на секции главной, роуты — на отдельные
 * страницы; оба вида — через `next/link` (абсолютный путь с якорем работает
 * и как переход на другую страницу, и как прокрутка к секции, если уже на
 * главной — раньше был баг: голый `#id` без ведущего `/` на не-главной
 * странице искал якорь на текущей странице вместо перехода). Клиентский
 * компонент: нужен usePathname.
 *
 * `items` — готовый список пунктов (спека 0039, T16): состав по фазе
 * турнира и авторизации уже решён вызывающим кодом (`publicNavItems`,
 * `widgets/navbar/navbar.tsx`) — компонент больше не читает `siteConfig` и
 * не знает о сессии сам, только рендерит и подсвечивает.
 *
 * Скрывается в админ-зоне: у неё своя под-навигация (AdminNav), а публичные
 * якоря («Турнир», «Номинации») там означали бы другой, конфликтующий адрес.
 */
export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  if (isAdminRoute(pathname)) return null;

  return (
    <Row as="nav" align="center" gap={6} className="hidden text-sm md:flex">
      {items.map((item) => {
        const active = isActiveNavItem(pathname, item.href);
        const className = cn(
          "text-muted-foreground transition-colors hover:text-foreground",
          active && "font-medium text-foreground"
        );

        return (
          <Link
            key={item.href}
            href={item.href}
            className={className}
            aria-current={active ? "page" : undefined}
          >
            {item.title}
          </Link>
        );
      })}
    </Row>
  );
}
