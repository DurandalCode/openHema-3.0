export const siteConfig = {
  name: "openHEMA",
  description: "Платформа для проведения HEMA-турниров",
  repoUrl: "https://github.com/DurandalCode/openHema-3.0",
  navItems: [
    // Секции главной (`id="tournament"`/`id="nominations"`, см.
    // widgets/tournament-hero, widgets/nominations-list). Абсолютный путь с
    // якорем (`/#id`), а не голый `#id` — иначе переход с другой страницы
    // (например, `/about` или `/dashboard`) ищет якорь на ТЕКУЩЕЙ странице
    // вместо перехода на главную (баг: клик по «Турнир» с /about никуда не
    // вёл).
    { title: "Турнир", href: "/#tournament" },
    { title: "Номинации", href: "/#nominations" },
    { title: "О турнире", href: "/about" },
  ],
} as const;

export type SiteConfig = typeof siteConfig;

/**
 * NavItem — плоский тип пункта навигации, не привязанный к литеральным
 * значениям `siteConfig.navItems` (спека 0039, T13): `publicNavItems`
 * строит и другие фазы поверх этого же типа, а не только фазу «до старта».
 */
export type NavItem = { title: string; href: string };
