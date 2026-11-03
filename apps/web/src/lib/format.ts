const eur0 = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const eur2 = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num2 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function euro(v: number | null | undefined, cents = false): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  return (cents ? eur2 : eur0).format(v);
}

export function pct(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  return `${v.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`;
}

export function pp(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  return `${v.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits })} %-Pkt.`;
}

export function num(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  return num2.format(v);
}

export function dateDe(iso: string | null | undefined): string {
  if (!iso) return "–";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

export function formatValue(v: unknown, unit?: string | null): string {
  if (v === null || v === undefined || v === "") return "–";
  if (typeof v === "boolean") return v ? "ja" : "nein";
  if (typeof v === "number") return `${v.toLocaleString("de-DE", { maximumFractionDigits: 4 })}${unit ? ` ${unit}` : ""}`;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return dateDe(v);
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}
