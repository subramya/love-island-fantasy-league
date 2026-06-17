"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";

type MobileNavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  match?: string;
  hash?: string;
};

const navItems: MobileNavItem[] = [
  {
    href: "/",
    label: "Home",
    match: "/",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5.5 9.5V21h13V9.5" />
      </svg>
    ),
  },
  {
    href: "/predict",
    label: "Prediction",
    match: "/predict",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 6h16" />
        <path d="M4 12h16" />
        <path d="M4 18h10" />
      </svg>
    ),
  },
  {
    href: "/leaderboard",
    label: "Leaderboard",
    match: "/leaderboard",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M6 20V10" />
        <path d="M12 20V4" />
        <path d="M18 20v-7" />
      </svg>
    ),
  },
  {
    href: "/chat",
    label: "Feed",
    match: "/chat",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 5h16v10H8l-4 4V5Z" />
      </svg>
    ),
  },
  {
    href: "/profile",
    label: "Profile",
    match: "/profile",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
        <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
      </svg>
    ),
  },
];

const adminNavItems: MobileNavItem[] = [
  {
    href: "/admin/alerts",
    label: "Alerts",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 3a5 5 0 0 0-5 5v2.5c0 .7-.2 1.4-.6 2L5 15h14l-1.4-2.5c-.4-.6-.6-1.3-.6-2V8a5 5 0 0 0-5-5Z" />
        <path d="M10 18a2 2 0 0 0 4 0" />
      </svg>
    ),
  },
  {
    href: "/admin/rounds",
    label: "New Round",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </svg>
    ),
  },
  {
    href: "/admin/islanders",
    label: "Islanders",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        <path d="M15.5 13a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
        <path d="M4 19a5 5 0 0 1 10 0" />
        <path d="M13 19a4 4 0 0 1 7 0" />
      </svg>
    ),
  },
  {
    href: "/admin/tracker",
    label: "Tracker",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 6h16" />
        <path d="M4 12h10" />
        <path d="M4 18h7" />
        <path d="M17 11l2 2 3-4" />
      </svg>
    ),
  },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const isAdminPage = pathname.startsWith("/admin");
  const activeNavItems = isAdminPage ? adminNavItems : navItems;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-zinc-800/80 bg-black/95 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur md:hidden">
      <div className={`mx-auto grid max-w-xl gap-2 ${isAdminPage ? "grid-cols-4" : "grid-cols-5"}`}>
        {activeNavItems.map((item) => {
          const isActive = isAdminPage
            ? pathname === item.href
            : item.href === "/"
              ? pathname === "/"
              : item.href === "/profile"
                ? pathname.startsWith("/profile")
                : pathname.startsWith(item.match ?? item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-center text-[10px] font-semibold transition ${
                isActive
                  ? "bg-pink-500 text-black"
                  : "border border-zinc-800 bg-zinc-950 text-zinc-300"
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
