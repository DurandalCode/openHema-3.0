import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Archivo, JetBrains_Mono } from "next/font/google";
import { siteConfig } from "@/shared/config/site-config";
import { ThemeProvider } from "@/shared/lib/theme-provider";
import { QueryProvider } from "@/shared/lib/query-provider";
import { AuthDialog } from "@/features/auth/ui/auth-dialog";
import { SessionExpiredDialog } from "@/widgets/session-expired/session-expired-dialog";
import { Navbar } from "@/widgets/navbar/navbar";
import { NavbarVisibilityGate } from "@/widgets/navbar/navbar-visibility-gate";
import { Col } from "@/shared/ui/stack";
import { Toaster } from "@/shared/ui/sonner";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-archivo",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="ru"
      suppressHydrationWarning
      className={`${archivo.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-svh bg-background font-sans text-foreground antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            <Col className="relative min-h-svh">
              <NavbarVisibilityGate>
                <Navbar />
              </NavbarVisibilityGate>
              <main className="flex-1">{children}</main>
            </Col>
            <AuthDialog />
            <SessionExpiredDialog />
            <Toaster />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
