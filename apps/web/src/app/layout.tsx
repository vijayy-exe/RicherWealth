import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: {
    default: "RicherWealth — Your AI Wealth Operating System",
    template: "%s | RicherWealth",
  },
  description:
    "RicherWealth answers 'what should I do next to maximize my wealth?' — AI-powered personal and family wealth management across every asset class.",
  keywords: [
    "wealth management",
    "portfolio tracker",
    "AI finance",
    "net worth",
    "investments",
    "personal finance",
  ],
  openGraph: {
    title: "RicherWealth — AI Wealth OS",
    description: "Track, analyze, and grow your wealth with AI-powered insights.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
