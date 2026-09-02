import { CountUp } from "./count-up.tsx";

/**
 * Jauge horizontale : situe une mesure du jour (VFC, FC de repos) dans sa
 * plage habituelle (moyenne ± écart-type des jours précédents). La position
 * relative importe plus que la valeur absolue — c'est tout l'intérêt du
 * modèle « écart à la normale » plutôt qu'un seuil universel.
 */
export function HorizontalGauge({
  label,
  value,
  unit,
  baselineMean,
  baselineSd,
  verdict,
  verdictColor,
  countUpDelayMs = 0,
}: {
  label: string;
  value: number;
  unit: string;
  baselineMean: number;
  baselineSd: number;
  verdict: string;
  verdictColor: string;
  /** Décalage dans la cascade des chiffres héros de l'écran (accueil : 0, 60, 120 ms…). */
  countUpDelayMs?: number;
}) {
  const sd = baselineSd > 0 ? baselineSd : baselineMean * 0.1;
  const domainMin = baselineMean - 2.2 * sd;
  const domainMax = baselineMean + 2.2 * sd;
  const span = Math.max(domainMax - domainMin, 1e-6);

  const clampPct = (v: number) => Math.min(100, Math.max(0, ((v - domainMin) / span) * 100));
  const valuePct = clampPct(value);
  const bandFromPct = clampPct(baselineMean - sd);
  const bandToPct = clampPct(baselineMean + sd);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-[var(--color-muted)]">{label}</span>
        <span className="text-xs font-medium" style={{ color: verdictColor }}>
          {verdict}
        </span>
      </div>
      <div className="tabular mt-1.5 flex items-center gap-2">
        <span className="hero-numeral text-hero-md">
          <CountUp value={value} delayMs={countUpDelayMs} />
        </span>
        <span className="text-xs text-[var(--color-muted)]">{unit}</span>
      </div>
      <div className="relative mt-2 h-1.5 rounded-full bg-[var(--color-surface-2)]">
        <div
          className="absolute inset-y-0 rounded-full bg-[var(--color-border-strong)]"
          style={{ left: `${bandFromPct}%`, width: `${Math.max(0, bandToPct - bandFromPct)}%` }}
          title="Plage habituelle"
        />
        <div
          className="absolute top-1/2 h-3 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ left: `${valuePct}%`, backgroundColor: verdictColor }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-[var(--color-faint)]">
        <span>bas</span>
        <span>
          habituel : {baselineMean.toFixed(0)} {unit}
        </span>
        <span>élevé</span>
      </div>
    </div>
  );
}
