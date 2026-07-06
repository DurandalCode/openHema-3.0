import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "HEMA Tournament",
  description: "HEMA tournament management",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          margin: 0,
          background: "#0f1115",
          color: "#e6e6e6",
        }}
      >
        {children}
      </body>
    </html>
  );
}
