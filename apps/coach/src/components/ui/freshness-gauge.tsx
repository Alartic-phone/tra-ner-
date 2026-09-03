/**
 * Jauge horizontale de 5 px : plage habituelle (moyenne ± écart-type) en
 * fond plus clair, valeur du jour en repère. Pas un des sept composants
 * signature, mais suit les mêmes règles (pas de couleur seule porteuse de
 * sens — la valeur et l'écart sont toujours écrits en toutes lettres à côté).
 */
export function FreshnessGauge({
  label,
  value,
  unit,
  baselineMean,
  baselineSd,
  decimals = 0,
}: {
  label: string;
  value: number;
  unit: string;
  baselineMean: number;
  baselineSd: number;
  decimals?: number;
}) {
  const sd = baselineSd > 0 ? baselineSd : Math.max(1, baselineMean * 0.05);
  const min = Math.max(0, baselineMean - 3 * sd);
  const max = baselineMean + 3 * sd;
  const span = Math.max(max - min, 1e-6);
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - min) / span) * 100));

  const bandFrom = pct(baselineMean - sd);
  const bandTo = pct(baselineMean + sd);
  const marker = pct(value);
  const delta = value - baselineMean;

  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-[var(--color-muted)]">{label}</span>
        <span className="tabular text-[var(--color-text)]">
          {value.toFixed(decimals)} {unit}
          <span className="ml-1 text-[var(--color-faint)]">
            ({delta >= 0 ? "+" : ""}
            {delta.toFixed(decimals)} vs habituel)
          </span>
        </span>
      </div>
      <div className="relative mt-1.5 h-[5px] rounded-[var(--radius-pill)] bg-[var(--color-surface-2)]">
        <div
          className="absolute h-full rounded-[var(--radius-pill)] bg-[var(--color-border-strong)]"
          style={{ left: `${bandFrom}%`, width: `${Math.max(0, bandTo - bandFrom)}%` }}
        />
        <div
          className="absolute top-1/2 h-2.5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--color-text)]"
          style={{ left: `${marker}%` }}
        />
      </div>
    </div>
  );
}
