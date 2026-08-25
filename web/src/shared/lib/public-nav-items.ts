import type { TournamentPhase } from "@/entities/tournament-live/lib/phase";
import type { NavItem } from "@/shared/config/site-config";

/**
 * publicNavItems — единственный источник состава публичного меню (спека
 * 0039, FR-6..FR-9). Чистая функция от фазы турнира и авторизации — оба
 * представления меню (широкое `NavLinks`, узкое `MobileNav`) зовут её же,
 * чтобы не разойтись в оценке того, что сейчас реально отрисовано на
 * главной (FR-7 иначе нарушался бы через раз).
 *
 * Состав пунктов выведен из того, что `widgets/home/home-screen.tsx`
 * реально рендерит в каждой фазе (спека 0034), а не из макета:
 * - `before` — секции `#tournament`/`#nominations` существуют только здесь;
 * - `running` — секции переключаются на `#arenas-now`/`#nominations-rail`
 *   (`#tournament`/`#nominations` в этой фазе не рендерятся — AC-4); «Мои
 *   заявки» уступает место «Кабинету» (там и следующий бой, и превью
 *   заявок — 0038 поверх ADR 0016);
 * - `finished` — площадки уже не актуальны (0034, FR-23), живой пункт ведёт
 *   на ленту боёв (`#bout-feed`), «Мои заявки» возвращается.
 */
export function publicNavItems({
  phase,
  isAuthenticated,
}: {
  phase: TournamentPhase;
  isAuthenticated: boolean;
}): NavItem[] {
  const items: NavItem[] = (() => {
    switch (phase) {
      case "before":
        return [
          { title: "Турнир", href: "/#tournament" },
          { title: "Номинации", href: "/#nominations" },
          { title: "О турнире", href: "/about" },
        ];
      case "running":
        return [
          { title: "Сейчас", href: "/#arenas-now" },
          { title: "Номинации", href: "/#nominations-rail" },
          { title: "О турнире", href: "/about" },
        ];
      case "finished":
        return [
          { title: "Итоги", href: "/#bout-feed" },
          { title: "Номинации", href: "/#nominations-rail" },
          { title: "О турнире", href: "/about" },
        ];
    }
  })();

  if (!isAuthenticated) return items;

  const authedItem: NavItem =
    phase === "running" ? { title: "Кабинет", href: "/dashboard" } : { title: "Мои заявки", href: "/applications" };

  return [...items, authedItem];
}
