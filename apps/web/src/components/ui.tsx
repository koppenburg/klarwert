import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

export function cx(...c: Array<string | false | null | undefined>): string {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-white hover:opacity-90 disabled:opacity-50",
  secondary: "bg-white text-ink border border-line hover:bg-brand-soft disabled:opacity-50",
  ghost: "text-brand hover:bg-brand-soft disabled:opacity-50",
  danger: "bg-white text-bad border border-bad/40 hover:bg-red-50 disabled:opacity-50",
};

export function Button({ variant = "primary", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button {...props} className={cx("inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition", VARIANTS[variant], className)} />;
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-lg border border-line bg-surface", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-3">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

type Tone = "neutral" | "ok" | "warn" | "bad" | "brand";
const TONES: Record<Tone, string> = {
  neutral: "bg-gray-100 text-gray-700",
  ok: "bg-green-50 text-ok",
  warn: "bg-amber-50 text-warn",
  bad: "bg-red-50 text-bad",
  brand: "bg-brand-soft text-brand",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center rounded px-2 py-0.5 text-xs font-medium", TONES[tone], className)}>{children}</span>;
}

export function Notice({ tone = "warn", title, children }: { tone?: Tone; title?: string; children: ReactNode }) {
  return (
    <div className={cx("rounded-md border px-4 py-3 text-sm", tone === "bad" ? "border-bad/30 bg-red-50" : tone === "ok" ? "border-ok/30 bg-green-50" : tone === "brand" ? "border-brand/20 bg-brand-soft" : "border-warn/30 bg-amber-50")}>
      {title && <p className="mb-1 font-semibold">{title}</p>}
      <div>{children}</div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass = "w-full rounded-md border border-line bg-white px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";

export function Table({ children, className, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table {...rest} className={cx("w-full border-collapse text-sm [&_td]:border-b [&_td]:border-line [&_td]:px-3 [&_td]:py-2 [&_th]:border-b [&_th]:border-line [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted", className)}>
        {children}
      </table>
    </div>
  );
}

/** Kennzeichnung für Annahmen in UI und Report */
export function AssumptionTag({ children = "Annahme" }: { children?: ReactNode }) {
  return <span className="ml-1 rounded border border-accent/60 px-1 text-[10px] font-semibold uppercase tracking-wide text-[#7a5d16]">{children}</span>;
}
