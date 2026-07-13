"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/lib/cn";
import { isActiveNavItem } from "@/shared/lib/is-active-nav-item";
import { siteConfig } from "@/shared/config/site-config";
import { Row } from "@/shared/ui/stack";

// authedNavItem — «Мои заявки» видна только аутентифицированным пользователям,
// поэтому не часть публичного siteConfig.navItems (тот список не знает о
// сессии и проверяется отдельным тестом на публичные роуты/якоря).
const authedNavItem = { title: "Мои заявки", href: "/applications" };

/**
 * NavLinks — пункты навигации верхнего уровня с подсветкой активного роута.
 * Якорные пункты (`/#id`) ведут на секции главной, роуты — на отдельные
 * страницы; оба вида — через `next/link` (абсолютный путь с якорем работает
 * и как переход на другую страницу, и как прокрутка к секции, если уже на
 * главной — раньше был баг: голый `#id` без ведущего `/` на не-главной
 * странице искал якорь на текущей странице вместо перехода). Клиентский
 * компонент: нужен usePathname.
 *
 * isAuthenticated — добавляет «Мои заявки» в конец списка (страница требует
 * сессии); сам флаг приходит от серверного Navbar (getCurrentUser), токен в
 * клиент не утекает.
 *
 * Скрывается в админ-зоне: у неё своя под-навигация (AdminNav), а публичные
 * якоря («Турнир», «Номинации») там означали бы другой, конфликтующий адрес.
 */
export function NavLinks({ isAuthenticated }: { isAuthenticated: boolean }) {
  const pathname = usePathname();

  if (pathname.startsWith("/admin")) return null;

  const items = isAuthenticated ? [...siteConfig.navItems, authedNavItem] : siteConfig.navItems;

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
