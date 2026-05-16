import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: string | number;
  tone?: "gold" | "mint" | "rose" | "neutral";
};

const tones = {
  gold: "border-amber-300/20 bg-amber-300/10 text-amber-100",
  mint: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
  rose: "border-rose-300/20 bg-rose-300/10 text-rose-100",
  neutral: "border-white/10 bg-white/[0.04] text-zinc-100",
};

export function StatCard({ label, value, tone = "neutral" }: StatCardProps) {
  return (
    <div className={cn("rounded-2xl border p-3", tones[tone])}>
      <div className="text-xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">{label}</div>
    </div>
  );
}
