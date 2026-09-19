import type { NextConfig } from "next";
import path from "path";

// Phase 22: real findings from a live OWASP ZAP scan against this exact
// frontend (2026-09-14) — CSP Header Not Set and Missing Anti-clickjacking
// Header, both Medium, plus X-Content-Type-Options Missing and the
// X-Powered-By information leak, both Low. helmet() already covers
// apps/api; Next.js needs its own headers() config since helmet doesn't
// touch this process. `style-src 'unsafe-inline'` is required, not
// optional — this app renders every component via inline `style={{}}`
// props (confirmed by grep across apps/web/src), and a stricter
// nonce-based CSP would need a much larger refactor than this pass scopes.
const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://*.supabase.co",
      "font-src 'self' data:",
      "connect-src 'self' http://localhost:4000 ws://localhost:4000 https://*.supabase.co wss://*.supabase.co",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Explicitly set workspace root to silence the lockfile detection warning
  // when running inside the pnpm monorepo. Next.js 16 moved this out of
  // `experimental.turbo` to a top-level `turbopack` option (the old key is
  // now silently ignored, which let Turbopack mis-detect a stray
  // ~/package-lock.json as the project root and filesystem-cache the
  // entire home directory on every request — multi-minute compiles).
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
  // Compiler options
  compiler: {
    // Remove console.log in production (keep warn/error)
    removeConsole:
      process.env.NODE_ENV === "production" ? { exclude: ["warn", "error"] } : false,
  },
  // Image optimization domains (add external domains here as needed)
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
    ],
  },
};

export default nextConfig;
