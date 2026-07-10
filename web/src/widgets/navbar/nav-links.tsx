"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/lib/cn";
import { isActiveNavItem } from "@/shared/lib/is-active-nav-item";
import { siteConfig } from "@/shared/config/site-config";
import { Row } from "@/shared/ui/stack";

/**
 * NavLinks — публичные пункты навигации с подсветкой активного роута.
 * Якорные пункты (`#...`) ведут на секции главной, роуты — на отдельные
 * страницы (`next/link`). Клиентский компонент: нужен usePathname.
 *
 * Скрывается в админ-зоне: у неё своя под-навигация (AdminNav), а публичные
 * якоря («Турнир», «Номинации») там означали бы другой, конфликтующий адрес.
 */
export function NavLinks() {
  const pathname = usePathname();

  if (pathname.startsWith("/admin")) return null;

  return (
    <Row as="nav" align="center" gap={6} className="hidden text-sm md:flex">
      {siteConfig.navItems.map((item) => {
        const active = isActiveNavItem(pathname, item.href);
        const className = cn(
          "text-muted-foreground transition-colors hover:text-foreground",
          active && "font-medium text-foreground"
        );

        if (item.href.startsWith("#")) {
          return (
            <a key={item.href} href={item.href} className={className}>
              {item.title}
            </a>
          );
        }

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
