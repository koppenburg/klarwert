/**
 * Branding-Platzhalter. Der Auftraggeber ersetzt Logo, Farben und Kontaktdaten hier
 * (Logo-Datei unter public/branding/logo.svg). Farben werden zusätzlich als CSS-Variablen in globals.css gesetzt.
 */
export const branding = {
  companyName: "Koppenburg GmbH",
  claim: "Was passt, bleibt. Was nicht passt, wird optimiert.",
  logoPath: "/branding/logo.svg",
  contact: {
    line1: "[Straße Hausnummer]",
    line2: "[PLZ] Merzig / Losheim am See",
    phone: "[Telefon]",
    email: "[E-Mail]",
    web: "[Website]",
  },
  register: "[Vermittlerregister-Nr. / IHK-Angaben]",
  colors: { primary: "#1f4e79", accent: "#c8a24a" },
} as const;
