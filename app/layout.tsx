import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { PwaBoot } from "@/components/PwaBoot";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Love Island Fantasy League",
  description: "Fantasy prediction league for tracking Love Island couples.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Love Island FL",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetBrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full overflow-x-hidden flex flex-col bg-black text-zinc-100">
        <PwaBoot />
        <div className="flex-1 pb-24 md:pb-28">{children}</div>
        <MobileBottomNav />
        <footer className="border-t border-zinc-900 bg-black px-6 py-6 text-center">
          <p className="text-sm text-zinc-500">Created by Ramya Subramanian</p>
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.2em] text-zinc-600">
            Version 1.10
          </p>
          <p className="mx-auto mt-3 max-w-5xl text-xs leading-6 text-zinc-600">
            Love Island Fantasy League is an independent fan-created project and is not affiliated
            with, endorsed by, sponsored by, or associated with Love Island, Peacock,
            NBCUniversal, ITV Studios, or any of their affiliates. All trademarks, logos, show
            names, contestant names, and related intellectual property belong to their respective
            owners and are used for informational and fan engagement purposes only. This website is
            provided for entertainment purposes and does not claim ownership of any Love Island
            intellectual property.
          </p>
        </footer>
      </body>
    </html>
  );
}
