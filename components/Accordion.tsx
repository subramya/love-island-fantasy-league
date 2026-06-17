"use client";

import { useState } from "react";

type AccordionProps = {
  title: string;
  label?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
};

export function Accordion({
  title,
  label,
  defaultOpen = false,
  children,
}: AccordionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950/90 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
      <button
        type="button"
        onClick={() => setIsOpen((currentValue) => !currentValue)}
        className="flex min-h-12 w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <div>
          {label ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              {label}
            </p>
          ) : null}
          <h3 className="mt-1 text-lg font-semibold text-zinc-100">{title}</h3>
        </div>
        <span className="text-2xl leading-none text-zinc-400">{isOpen ? "−" : "+"}</span>
      </button>
      {isOpen ? <div className="border-t border-zinc-800 px-5 py-4">{children}</div> : null}
    </section>
  );
}
