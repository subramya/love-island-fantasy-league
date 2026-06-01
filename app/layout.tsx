import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
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
      <body className="min-h-full flex flex-col bg-black text-zinc-100">
        <div className="flex-1">{children}</div>
        <footer className="border-t border-zinc-900 bg-black px-6 py-6 text-center text-sm text-zinc-500">
          Created by Ramya Subramanian
        </footer>
      </body>
    </html>
  );
}
