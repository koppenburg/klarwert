import type { Metadata } from "next";
import { branding } from "@/lib/branding";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Anmeldung" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; fehler?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-8 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={branding.logoPath} alt={branding.companyName} className="mb-6 h-10" />
        <h1 className="text-xl font-semibold">Klarwert</h1>
        <p className="mb-6 text-sm text-muted">Effektivkosten-Analyse für Altersvorsorgeverträge</p>
        <LoginForm next={sp.next ?? "/"} notice={sp.fehler === "kein-teammitglied" ? "Dieses Konto ist nicht für Klarwert freigeschaltet." : undefined} />
        <p className="mt-6 text-xs text-muted">Internes Werkzeug der {branding.companyName}. Zugänge vergibt der Inhaber.</p>
      </div>
    </main>
  );
}
