import { SectionTitle } from "./section-title.tsx";
import { ZONE_RAMP, formatZoneBpmRange, type HeartRateZone } from "@/lib/metrics/zones.ts";
import { formatPace } from "@/lib/utils.ts";
import { Unavailable } from "@/components/ui/badge.tsx";

/** Couleur de texte lisible posée sur l'aplat de chaque zone (calculée une
 * fois, cf. rapport de session — jamais de texte sur fond de zone en-deçà de
 * 3:1, seuil WCAG du texte large utilisé ici). */
const ZONE_INK: Record<number, string> = {
  1: "#ffffff",
  2: "#0b0f0d",
  3: "#0b0f0d",
  4: "#0b0f0d",
  5: "#ffffff",
  6: "#ffffff",
};

export type ZoneInstrumentData = {
  zones: readonly HeartRateZone[];
  thresholdHr: number;
  hrMax: number | null;
  hrRest: number | null;
  /** Allure au seuil MESURÉE (meilleur effort 20 min réel), pas un modèle. */
  measuredThresholdPaceSPerKm: number | null;
};

/**
 * « Instrument de pilotage » (section 3.2) : six blocs pleins, une ligne de
 * repères mesurés en dessous. Aucune constante en dur — tout vient du
 * profil et des mesures réelles ; la cadence cible au tapis n'a pas de
 * source dans l'app (aucun champ ne la porte) et n'apparaît donc pas ici,
 * plutôt que d'inventer une valeur.
 */
export function ZoneInstrument({ data }: { data: ZoneInstrumentData }) {
  const z2 = data.zones.find((z) => z.index === 2);

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <SectionTitle href="/reglages/profil" destination="Réglages du profil">
          Zones de fréquence cardiaque
        </SectionTitle>
      </div>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        {data.thresholdHr} bpm · FC max {data.hrMax ?? "—"} bpm — mesurés et validés. Toute
        séance se lit à la FC, jamais à l&apos;allure seule.
      </p>

      <div className="relative mt-4 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {z2 ? (
          <div
            className="pointer-events-none absolute -top-5 text-[11px] text-[var(--color-muted)]"
            style={{ left: `calc(${(1.5 / 6) * 100}% - 4.5rem)`, width: "9rem", textAlign: "center" }}
          >
            80 % du volume visé ici ↓
          </div>
        ) : null}
        {data.zones.map((zone, i) => (
          <div
            key={zone.index}
            className="stagger-item flex flex-col items-center justify-center rounded-[var(--radius-card)] px-2 py-4 text-center"
            style={{ backgroundColor: ZONE_RAMP[i], color: ZONE_INK[zone.index], ["--stagger-index" as string]: i }}
          >
            <span className="text-xs font-medium opacity-80">Z{zone.index}</span>
            <span className="tabular mt-1 text-sm font-semibold sm:text-base">
              {formatZoneBpmRange(zone)}
            </span>
            <span className="mt-1 text-[10px] leading-tight opacity-85">{zone.name}</span>
          </div>
        ))}
      </div>

      <dl className="tabular mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-[var(--color-muted)]">
        <div className="flex items-baseline gap-1.5">
          <dt>FC repos</dt>
          <dd className="text-[var(--color-text)]">
            {data.hrRest != null ? `${data.hrRest} bpm` : <Unavailable reason="Non renseignée au profil" />}
          </dd>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt>Allure seuil mesurée</dt>
          <dd className="text-[var(--color-text)]">
            {data.measuredThresholdPaceSPerKm != null ? (
              formatPace(data.measuredThresholdPaceSPerKm)
            ) : (
              <Unavailable reason="Aucun effort de 20 minutes mesuré" />
            )}
          </dd>
        </div>
        {z2 ? (
          <div className="flex items-baseline gap-1.5">
            <dt>Footing cible</dt>
            <dd className="text-[var(--color-text)]">{formatZoneBpmRange(z2)} bpm</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
