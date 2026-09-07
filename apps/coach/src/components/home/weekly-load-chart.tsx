import Link from "next/link";
import { SectionTitle } from "./section-title.tsx";
import { buildAxisTicks, type WeekLoadBar } from "@/lib/home.ts";
import { fixed } from "@/lib/utils.ts";

const BAR_STYLE: Record<WeekLoadBar["state"], string> = {
  done: "bg-[var(--color-accent)]",
  current:
    "border border-[var(--color-accent)] [background-image:repeating-linear-gradient(45deg,var(--color-accent)_0,var(--color-accent)_3px,transparent_3px,transparent_7px)] opacity-70",
  planned: "border border-dashed border-[var(--color-border-strong)] bg-transparent",
  "planned-deload":
    "border border-dashed border-[var(--color-border-strong)] [background-image:radial-gradient(var(--color-border-strong)_1px,transparent_1px)] [background-size:6px_6px]",
};

/**
 * Charge hebdomadaire — le graphique le plus important de l'accueil
 * (section 3.3). Quatre états visuellement distincts, jamais confondus :
 * réalisé (plein), en cours (hachuré), prévu (pointillé), allégée
 * (pointillé + trame). Graduations rondes via `buildAxisTicks` — jamais
 * 0,95/1,9/2,85.
 */
export function WeeklyLoadChart({ bars, hasPlan }: { bars: readonly WeekLoadBar[]; hasPlan: boolean }) {
  const maxKm = Math.max(1, ...bars.map((b) => Math.max(b.realizedKm, b.plannedKm ?? 0)));
  const ticks = buildAxisTicks(maxKm, 4).reverse();
  const axisMax = ticks[0] ?? maxKm;

  return (
    <section>
      <SectionTitle href="/analyses" destination="tout l'historique">
        Charge hebdomadaire
      </SectionTitle>

      <div className="mt-4 flex gap-3">
        <div className="tabular flex flex-col justify-between py-1 text-[10px] text-[var(--color-faint)]" style={{ height: 160 }}>
          {ticks.map((t) => (
            <span key={t}>{fixed(t, t < 10 ? 1 : 0)}</span>
          ))}
        </div>
        <div className="flex flex-1 items-stretch gap-1.5 sm:gap-2" style={{ height: 160 }}>
          {bars.map((bar) => {
            const barHeightPct = axisMax > 0 ? (Math.max(bar.realizedKm, bar.plannedKm ?? 0) / axisMax) * 100 : 0;
            const showKm = bar.state === "done" || bar.state === "current";
            return (
              <div key={bar.weekStart} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <div className="flex w-full flex-1 items-end justify-center">
                  <div
                    className={`stagger-item w-full max-w-8 rounded-t-[3px] transition-[height] ${BAR_STYLE[bar.state]}`}
                    style={{
                      height: `${Math.max(barHeightPct, bar.realizedKm > 0 || bar.plannedKm ? 3 : 0)}%`,
                      ["--stagger-index" as string]: bar.index,
                    }}
                    title={`S${bar.index} — ${fixed(bar.realizedKm, 2)} km réalisés${bar.plannedKm != null ? `, ${fixed(bar.plannedKm, 1)} km prévus` : ""}`}
                  />
                </div>
                <span className="tabular w-full truncate text-center text-[10px] text-[var(--color-faint)]">
                  {showKm && bar.realizedKm > 0 ? fixed(bar.realizedKm, 1) : ""}
                </span>
                <span className="w-full truncate text-center text-[10px] text-[var(--color-muted)]">
                  S{bar.index}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-[var(--color-muted)]">
        <li className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-[2px] ${BAR_STYLE.done}`} />
          réalisé
        </li>
        <li className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-[2px] ${BAR_STYLE.current}`} />
          en cours
        </li>
        <li className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-[2px] ${BAR_STYLE.planned}`} />
          prévu
        </li>
        <li className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-[2px] ${BAR_STYLE["planned-deload"]}`} />
          allégée
        </li>
      </ul>

      {!hasPlan ? (
        <p className="mt-2 text-xs text-[var(--color-faint)]">
          Aucun plan généré — les semaines prévues et allégées apparaîtront ici une fois un plan
          généré (<Link href="/plan" className="underline">voir /plan</Link>). En attendant, seules
          les semaines réellement courues sont affichées.
        </p>
      ) : null}
    </section>
  );
}
