export const siteConfig = {
  name: "HEMA Tournament",
  description: "Платформа для проведения HEMA-турниров",
  navItems: [
    { title: "Турниры", href: "#tournaments" },
    { title: "Возможности", href: "#features" },
  ],
} as const;

export type SiteConfig = typeof siteConfig;
export type NavItem = (typeof siteConfig.navItems)[number];
