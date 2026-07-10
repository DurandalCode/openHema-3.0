export const siteConfig = {
  name: "openHEMA",
  description: "Платформа для проведения HEMA-турниров",
  navItems: [
    { title: "Турнир", href: "#tournament" },
    { title: "Номинации", href: "#nominations" },
    { title: "О платформе", href: "/about" },
  ],
} as const;

export type SiteConfig = typeof siteConfig;
export type NavItem = (typeof siteConfig.navItems)[number];
