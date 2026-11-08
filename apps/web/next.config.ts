import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const here = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.join(here, "../..");

// Lokale OCR, Bildbearbeitung, PDF-Verarbeitung und Chromium laufen als externe Node-Pakete.
const serverExternalPackages = ["tesseract.js", "tesseract.js-core", "sharp", "pdfjs-dist", "@napi-rs/canvas", "@sparticuz/chromium", "playwright-core"];

const ocrFiles = [
  "../../node_modules/.pnpm/@tesseract.js-data+deu@*/node_modules/@tesseract.js-data/deu/4.0.0_best_int/**",
  "../../node_modules/.pnpm/tesseract.js@*/node_modules/tesseract.js/src/**",
  "../../node_modules/.pnpm/tesseract.js-core@*/node_modules/tesseract.js-core/*.wasm*",
  "../../node_modules/.pnpm/tesseract.js-core@*/node_modules/tesseract.js-core/*.js",
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
    "/api/cases/*/report": ["../../node_modules/.pnpm/@sparticuz+chromium@*/node_modules/@sparticuz/chromium/bin/**"],
  },
  experimental: {
    serverActions: { bodySizeLimit: "25mb" },
  },
  poweredByHeader: false,
};

export default nextConfig;
