import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/shell/app-shell";
import { runMigrations } from "@/db/migrate";
import { dashboardStats } from "@/lib/queries";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Alfred", template: "%s · Alfred" },
  description:
    "Track job applications and turn each one into concrete interview prep.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f9f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0e" },
  ],
};

// The schema is applied on first render so a fresh clone works with no setup step.
runMigrations();

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const stats = dashboardStats();

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>
          <AppShell
            badges={{
              "/inbox": stats.pendingMail,
              "/prep": stats.dueSoon,
            }}
          >
            {children}
          </AppShell>
        </Providers>
      </body>
    </html>
  );
}
