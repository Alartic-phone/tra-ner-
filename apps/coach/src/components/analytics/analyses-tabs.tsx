import Link from "next/link";

export function AnalysesTabs({ active }: { active: "charge" | "export" }) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-[var(--color-border-strong)] text-xs">
      <Link
        href="/analyses"
        className={`px-3 py-1.5 ${active === "charge" ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : "text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"}`}
      >
        Charge
      </Link>
      <Link
        href="/analyses/export"
        className={`px-3 py-1.5 ${active === "export" ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : "text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"}`}
      >
        Export
      </Link>
    </div>
  );
}
