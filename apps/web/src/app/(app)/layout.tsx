import Link from "next/link";
import type { ReactNode } from "react";
import { requireTeamMember } from "@/lib/auth";
import { branding } from "@/lib/branding";

const NAV = [
  { href: "/", label: "Fälle" },
  { href: "/tarifauswahl", label: "Tarifauswahl" },
  { href: "/vergleich", label: "Vergleich" },
  { href: "/bibliothek", label: "Tarifkatalog & Bibliothek" },
  { href: "/grundlagen", label: "Gesetzliche Grundlagen" },
];

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user } = await requireTeamMember();
  return (
    <div className="min-h-screen">
      <header className="no-print border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
          <Link href="/" className="flex items-center gap-3">
            <span className="rounded bg-brand px-2 py-1 text-sm font-bold tracking-wide text-white">Klarwert</span>
            <span className="hidden text-xs text-muted md:inline">{branding.companyName}</span>
          </Link>
          <nav className="flex gap-1 text-sm">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="rounded px-3 py-1.5 text-ink hover:bg-brand-soft">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-xs text-muted">
            <span>{user.email}</span>
            <form action="/auth/abmelden" method="post">
              <button className="rounded px-2 py-1 hover:bg-brand-soft">Abmelden</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
      <footer className="no-print mx-auto max-w-7xl px-6 pb-8 text-xs text-muted">
        Entscheidungsgrundlage, keine Empfehlung. Darstellung je nach Tarif und Bedingungswerk; keine Rechts- oder Steuerberatung.
      </footer>
    </div>
  );
}
