"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Info, Radio, Trophy, User } from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "@/shared/lib/cn";
import { isActiveNavItem } from "@/shared/lib/is-active-nav-item";
import { isAdminRoute } from "@/shared/lib/is-admin-route";
import type { NavItem } from "@/shared/config/site-config";

/**
 * Иконка на пункт — подобрана по смыслу (не критично для тестов, FR-10):
 * секции афиши/итогов, номинации, справка, личный кабинет/заявки.
 */
const ICONS_BY_TITLE: Record<string, ComponentType<{ className?: string }>> = {
  Турнир: Trophy,
  Сейчас: Radio,
  Итоги: Trophy,
  Номинации: Info,
  "О турнире": Info,
  "Мои заявки": FileText,
  Кабинет: User,
};

function iconFor(title: string): ComponentType<{ className?: string }> {
  return ICONS_BY_TITLE[title] ?? Info;
}

/**
 * MobileNav — нижняя навигационная панель для узкого экрана (спека 0039,
 * FR-10, FR-11, AC-7): те же пункты, что и у широкого `NavLinks`
 * (`publicNavItems`, единый источник состава), в виде иконка+подпись на
 * весь тач-таргет.
 *
 * `md:hidden` только прячет панель по CSS на широком экране — сам React-
 * компонент рендерится всегда, кроме `/admin/**`, где он не рендерится
 * вовсе (ранний `return null`, AC-8): у админ-зоны своя навигация
 * (`AdminShell`), и публичная нижняя панель поверх неё была бы лишней
 * — тот же приём, что `NavLinks`/`NavbarVisibilityGate`.
 */
export function MobileNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  if (isAdminRoute(pathname)) return null;

  return (
    <nav
      aria-label="Основная навигация"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur-sm md:hidden"
    >
      <ul className="mx-auto flex h-16 max-w-6xl items-stretch justify-around">
        {items.map((item) => {
          const active = isActiveNavItem(pathname, item.href);
          const Icon = iconFor(item.title);

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground",
                  active && "font-medium text-foreground",
                )}
              >
                <Icon className="size-5" />
                {item.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
