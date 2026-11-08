import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const here = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.join(here, "../..");

// Lokale OCR, Bildbearbeitung, PDF-Verarbeitung und Chromium laufen als externe Node-Pakete.
const serverExternalPackages = ["tesseract.js", "tesseract.js-core", "sharp", "pdfjs-dist", "@napi-rs/canvas", "@sparticuz/chromium", "playwright-core"];

const ocrFiles = [
  "../../node_modules/.pnpm/@tesseract.js-data+deu@*/node_modules/@tesseract.js-data/deu/4.0.0_best_int/**",
  // OCR-Worker läuft in einem eigenen Thread; seine Abhängigkeiten erkennt das Tracing nicht selbst
  "../../node_modules/.pnpm/tesseract.js@*/node_modules/**/*",
  "../../node_modules/.pnpm/tesseract.js-core@*/node_modules/**/*",
  "../../node_modules/.pnpm/zlibjs@*/node_modules/**/*",
  "../../node_modules/.pnpm/bmp-js@*/node_modules/**/*",
  "../../node_modules/.pnpm/wasm-feature-detect@*/node_modules/**/*",
  "../../node_modules/.pnpm/is-url@*/node_modules/**/*",
  "../../node_modules/.pnpm/regenerator-runtime@*/node_modules/**/*",
  "../../node_modules/.pnpm/node-fetch@2*/node_modules/**/*",
  "../../node_modules/.pnpm/whatwg-url@5*/node_modules/**/*",
  "../../node_modules/.pnpm/tr46@0*/node_modules/**/*",
  "../../node_modules/.pnpm/webidl-conversions@3*/node_modules/**/*",
  "../../node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/legacy/build/**",
  "../../node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/standard_fonts/**",
  "../../node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/cmaps/**",
  "../../node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/wasm/**",
  "../../node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/iccs/**",
];

const nextConfig: NextConfig = {
  outputFileTracingRoot: monorepoRoot,
  transpilePackages: ["@klarwert/calc", "@klarwert/extraction", "@klarwert/legal-config", "@klarwert/privacy"],
  serverExternalPackages,
  outputFileTracingIncludes: {
    "/api/documents/*/process": ocrFiles,
    "/api/documents/*/redact": ocrFiles,
    "/api/cases/*/extract": ocrFiles,
    "/api/library/register": ocrFiles,
    "/api/library/search": ocrFiles,
    "/api/diagnose": ocrFiles,
    "/api/research/candidates/*/documents": ocrFiles,
    // PDF-Erzeugung: playwright-core lädt Module dynamisch, Chromium-Binärdateien liegen in bin/
    "/api/cases/*/report": [
      "../../node_modules/.pnpm/@sparticuz+chromium@*/node_modules/**/*",
      "../../node_modules/.pnpm/playwright-core@*/node_modules/playwright-core/**/*",
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: "25mb" },
  },
  poweredByHeader: false,
};

export default nextConfig;
