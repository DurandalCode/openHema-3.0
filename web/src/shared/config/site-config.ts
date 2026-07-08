export const siteConfig = {
  name: "HEMA Tournament",
  description: "Платформа для проведения HEMA-турниров",
  navItems: [{ title: "Турнир", href: "#tournament" }],
} as const;

export type SiteConfig = typeof siteConfig;
export type NavItem = (typeof siteConfig.navItems)[number];
