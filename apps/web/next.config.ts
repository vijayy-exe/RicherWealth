import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Explicitly set workspace root to silence the lockfile detection warning
  // when running inside the pnpm monorepo
  experimental: {
    // @ts-expect-error turbo might not be typed in this Next.js version's ExperimentalConfig
    turbo: {
      root: path.resolve(__dirname, "../.."),
    } as unknown as Parameters<typeof Object>[0],
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
