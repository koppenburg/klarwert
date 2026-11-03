import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Klarwert", template: "%s · Klarwert" },
  description: "Effektivkosten-Analyse für Altersvorsorgeverträge – internes Werkzeug der Koppenburg GmbH",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
