export const siteConfig = {
  name: "openHEMA",
  description: "Платформа для проведения HEMA-турниров",
  navItems: [
    // Секции главной (`id="tournament"`/`id="nominations"`, см.
    // widgets/tournament-hero, widgets/nominations-list). Абсолютный путь с
    // якорем (`/#id`), а не голый `#id` — иначе переход с другой страницы
    // (например, `/about` или `/dashboard`) ищет якорь на ТЕКУЩЕЙ странице
    // вместо перехода на главную (баг: клик по «Турнир» с /about никуда не
    // вёл).
    { title: "Турнир", href: "/#tournament" },
    { title: "Номинации", href: "/#nominations" },
    { title: "О платформе", href: "/about" },
  ],
} as const;

export type SiteConfig = typeof siteConfig;
export type NavItem = (typeof siteConfig.navItems)[number];
