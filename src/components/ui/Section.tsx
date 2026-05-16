import type { ReactNode } from "react";

type SectionProps = {
  title: string;
  action?: ReactNode;
  children: ReactNode;
};

export function Section({ title, action, children }: SectionProps) {
  return (
    <section className="rounded-3xl border border-white/10 bg-zinc-950/70 p-4 shadow-2xl shadow-black/20">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-400">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
