import Link from "next/link";
import { SectionTitle } from "./section-title.tsx";
import { TraceThumb } from "@/components/ui/trace-thumb.tsx";
import { normalizeActivityName } from "@/lib/activity-names.ts";
import { buildGenericZoneVerdict } from "@/lib/activity-verdict.ts";
import { toLocalHour } from "@/lib/time.ts";
import { formatClock, formatDistanceOrDuration } from "@/lib/utils.ts";
import { ZONE_RAMP, type HeartRateZone } from "@/lib/metrics/zones.ts";
import type { RecentActivity } from "@/lib/home-repository.ts";

/** "2026-09-01" -> deux lignes ["01/09", "MAR"] pour la date sur deux lignes du carnet. */
function twoLineDate(startDay: string): [string, string] {
  const date = new Date(`${startDay}T00:00:00.000Z`);
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const weekday = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", weekday: "short" })
    .format(date)
    .replace(".", "")
    .toUpperCase();
  return [`${dd}/${mm}`, weekday];
}

function dominantZoneIndex(secondsByZone: readonly number[] | null): number | null {
  if (!secondsByZone || secondsByZone.every((s) => s === 0)) return null;
  let best = 0;
  for (let i = 1; i < secondsByZone.length; i++) {
    if (secondsByZone[i]! > secondsByZone[best]!) best = i;
  }
  return best;
}

/**
 * Carnet de bord — cinq dernières séances (section 3.6). Le contexte vient
 * des notes libres de l'activité si elles existent, sinon d'un verdict
 * construit par le code (jamais un modèle de langage, cf. lib/activity-verdict.ts).
 */
export function TrainingLog({
  activities,
  zones,
}: {
  activities: readonly RecentActivity[];
  zones: readonly HeartRateZone[];
}) {
  return (
    <section>
      <SectionTitle href="/activites" destination="tout l'historique">
        Carnet de bord
      </SectionTitle>

      {activities.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--color-muted)]">Aucune activité enregistrée.</p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--color-border)]">
          {activities.map((a) => {
            const [dd, weekday] = twoLineDate(a.startDay);
            const context =
              a.notes ??
              buildGenericZoneVerdict(
                a.secondsByZone,
                zones.map((z) => z.name),
              );
            const dominant = dominantZoneIndex(a.secondsByZone);

            return (
              <li key={a.id} className="py-3">
                <Link href={`/activites/${a.id}`} className="flex items-start gap-3">
                  <div className="tabular flex w-9 shrink-0 flex-col items-center text-[10px] leading-tight text-[var(--color-faint)]">
                    <span>{dd}</span>
                    <span>{weekday}</span>
                  </div>
                  <TraceThumb tracePath={a.tracePath} type={a.type} size={48} />
                  <div className="min-w-0 flex-1">
                    <p className="font-display truncate text-sm text-[var(--color-text)]">
                      {normalizeActivityName(a.name, a.type, toLocalHour(a.startedAt))}
                    </p>
                    {context ? (
                      <p className="mt-0.5 line-clamp-2 text-xs text-[var(--color-muted)]">{context}</p>
                    ) : null}
                  </div>
                  <div className="tabular flex shrink-0 flex-col items-end gap-1 text-xs text-[var(--color-muted)]">
                    <span>{formatDistanceOrDuration(a.distanceM, a.movingTimeS)}</span>
                    <span>{formatClock(a.movingTimeS)}</span>
                    {a.avgHr != null && dominant != null ? (
                      <span className="flex items-center gap-1">
                        {a.avgHr} bpm
                        <span
                          aria-hidden
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: ZONE_RAMP[dominant] }}
                        />
                      </span>
                    ) : a.avgHr != null ? (
                      <span>{a.avgHr} bpm</span>
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
