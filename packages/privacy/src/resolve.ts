import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

/** Sucht `node_modules/.pnpm/<name>@<version>/node_modules/<name>` vom Arbeitsverzeichnis aufwärts (Vercel-Bundle ohne Symlinks). */
function fromPnpmStore(name: string): string | null {
  const prefix = `${name.replace("/", "+")}@`;
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const store = path.join(dir, "node_modules", ".pnpm");
    if (existsSync(store)) {
      const hit = readdirSync(store).find((e) => e.startsWith(prefix));
      if (hit) {
        const candidate = path.join(store, hit, "node_modules", name);
        if (existsSync(candidate)) return candidate;
      }
    }
    const direct = path.join(dir, "node_modules", name);
    if (existsSync(path.join(direct, "package.json"))) return direct;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Verzeichnis eines installierten Pakets zur Laufzeit. Der Paketname wird bewusst dynamisch
 * zusammengesetzt, damit Bundler (Next.js/Turbopack) den Aufruf nicht durch eine Modul-ID ersetzen.
 * Reihenfolge: Node-Auflösung vom Arbeitsverzeichnis und von diesem Modul aus, dann pnpm-Speicher.
 */
export function packageDir(name: string): string {
  const spec = [name, "package.json"].join("/");
  const bases = [path.join(process.cwd(), "index.js"), import.meta.url];
  for (const base of bases) {
    try {
      const req = createRequire(base);
      const resolved: unknown = req.resolve(spec);
      if (typeof resolved === "string") return path.dirname(resolved);
    } catch {
      // nächste Basis probieren
    }
  }
  const stored = fromPnpmStore(name);
  if (stored) return stored;
  throw new Error(`Paket ${name} nicht gefunden`);
}
