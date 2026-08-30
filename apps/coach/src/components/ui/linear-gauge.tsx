/**
 * Jauge horizontale : une valeur du jour située dans sa plage habituelle
 * (moyenne ± écart-type des jours précédents), pas dans une échelle absolue.
 * Complète `ProgressRing` (anneau, valeur vs cible) pour le cas « où est-ce
 * que je me situe par rapport à MOI-même » — pas de cible fixe ici, donc pas
 * d'anneau. La bande centrale est la plage habituelle, le repère est la
 * valeur du jour.
 */

const TONE_COLORS = {
  ok: "var(--color-ok)",
  warn: "var(--color-warn)",
  danger: "var(--color-danger)",
} as const;

export function LinearGauge({
  label,
  value,
  unit,
  mean,
  sd,
  tone,
  formatValue = (v: number) => v.toFixed(0),
}: {
  label: string;
  value: number;
  unit: string;
  mean: number;
  sd: number;
  tone: keyof typeof TONE_COLORS;
  formatValue?: (v: number) => string;
}) {
  // Écart-type plancher pour ne pas réduire la plage habituelle à un point
  // quand les mesures précédentes sont anormalement stables.
  const spread = Math.max(sd, mean * 0.03);
  const trackMin = mean - 2.5 * spread;
  const trackMax = mean + 2.5 * spread;
  const pct = (v: number) => Math.min(100, Math.max(0, ((v - trackMin) / (trackMax - trackMin)) * 100));

  const bandStart = pct(mean - spread);
  const bandEnd = pct(mean + spread);
  const markerPos = pct(value);
  const color = TONE_COLORS[tone];

  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline justify-between gap-2 text-xs text-[var(--color-muted)]">
        <span>{label}</span>
        <span className="tabular text-[var(--color-text)]">
          {formatValue(value)}
          <span className="ml-0.5 text-[var(--color-faint)]">{unit}</span>
        </span>
      </div>
      <div className="relative mt-1.5 h-1.5 rounded-[var(--radius-pill)] bg-[var(--color-surface-2)]">
        <div
          className="absolute inset-y-0 rounded-[var(--radius-pill)] bg-[var(--color-border-strong)]"
          style={{ left: `${bandStart}%`, width: `${Math.max(0, bandEnd - bandStart)}%` }}
          title="Plage habituelle"
        />
        <div
          className="absolute top-1/2 h-3 w-1 -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-pill)]"
          style={{ left: `${markerPos}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
