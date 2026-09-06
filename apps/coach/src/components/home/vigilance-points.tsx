import type { VigilanceEntry } from "@/lib/home.ts";

const LEVEL_COLOR: Record<VigilanceEntry["level"], string> = {
  bloquant: "var(--color-danger)",
  "a-surveiller": "var(--color-warn)",
  stable: "var(--color-ok)",
};

/**
 * Pense-bête, pas système d'alerte automatique (section 3.7) : chaque
 * entrée vient d'une règle déterministe (lib/home.ts, `detectVigilancePoints`),
 * jamais d'un jugement de modèle. Aucune entrée sur la natation ni le
 * triathlon par construction.
 */
export function VigilancePoints({ entries }: { entries: readonly VigilanceEntry[] }) {
  return (
    <section>
      <h2 className="font-display text-lg text-[var(--color-text)] sm:text-xl">Points de vigilance</h2>

      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--color-muted)]">Rien à signaler cette semaine.</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {entries.map((e, i) => (
            <li key={i} className="flex gap-2.5 text-sm">
              <span
                aria-hidden
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: LEVEL_COLOR[e.level] }}
              />
              <div>
                <p className="font-medium text-[var(--color-text)]">{e.title}</p>
                <p className="mt-0.5 text-xs text-[var(--color-muted)]">{e.action}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
