import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/shell/app-shell";
import { runMigrations } from "@/db/migrate";
import { currentUser } from "@/lib/auth";
import { countNewJobHits, dashboardStats } from "@/lib/queries";
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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The sign-in and setup screens render inside this layout too, so the shell
  // is conditional: no nav, no counts, nothing that implies an account.
  const user = await currentUser();
  const stats = user ? dashboardStats(user.id) : null;
  // New discovered postings, so the badge is visible without opening Jobs.
  const newJobHits = user ? countNewJobHits(user.id) : 0;

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>
          {user && stats ? (
            <AppShell
              user={{ name: user.name, email: user.email, role: user.role }}
              badges={{
                "/inbox": stats.pendingMail,
                "/jobs": newJobHits,
                "/prep": stats.dueSoon,
              }}
            >
              {children}
            </AppShell>
          ) : (
            // Signed out: the auth screens bring their own layout.
            children
          )}
        </Providers>
      </body>
    </html>
  );
}
