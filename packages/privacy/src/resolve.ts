import { createRequire } from "node:module";
import path from "node:path";

/**
 * Verzeichnis eines installierten Pakets zur Laufzeit. Der Paketname wird bewusst dynamisch
 * zusammengesetzt, damit Bundler (Next.js/Turbopack) den Aufruf nicht durch eine Modul-ID ersetzen.
 * Zuerst vom Arbeitsverzeichnis der App aus (apps/web), dann relativ zu diesem Modul.
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
  throw new Error(`Paket ${name} nicht gefunden`);
}
