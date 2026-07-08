import type { Metadata } from "next";
import type { ReactNode } from "react";
import { siteConfig } from "@/shared/config/site-config";
import { ThemeProvider } from "@/shared/lib/theme-provider";
import { QueryProvider } from "@/shared/lib/query-provider";
import { AuthDialog } from "@/features/auth/ui/auth-dialog";
import { Navbar } from "@/widgets/navbar/navbar";
import { Col } from "@/shared/ui/stack";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className="min-h-svh bg-background font-sans text-foreground antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            <Col className="relative min-h-svh">
              <Navbar />
              <main className="flex-1">{children}</main>
            </Col>
            <AuthDialog />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
