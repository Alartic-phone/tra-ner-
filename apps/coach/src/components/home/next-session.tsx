import Link from "next/link";
import { Badge } from "@/components/ui/badge.tsx";
import { formatDayLong } from "@/lib/time.ts";
import { formatDistance, formatPace, formatTimeRange } from "@/lib/utils.ts";
import type { NextSession as NextSessionData } from "@/lib/home-repository.ts";

/** "dimanche 6 septembre" -> "Dimanche 6/09" (jour + mois, capitalisé). */
function shortLabel(day: string): string {
  const long = formatDayLong(day); // "dimanche 6 septembre 2026"
  const [weekday, dayNum] = long.split(" ");
  const month = String(Number(day.slice(5, 7))).padStart(2, "0");
  const dayCap = weekday![0]!.toUpperCase() + weekday!.slice(1);
  return `${dayCap} ${dayNum}/${month}`;
}

/**
 * Prochaine séance (section 3.4). Sans plan, le bloc ne ment pas : il dit
 * « Aucun plan généré », jamais « Repos » — qui laisserait croire que le
 * repos est prescrit plutôt que simplement l'absence de plan.
 */
export function NextSession({ session }: { session: NextSessionData | null }) {
  if (!session) {
    return (
      <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border-strong)] p-4">
        <Badge tone="warn">PROCHAINE SÉANCE</Badge>
        <p className="font-display mt-2 text-base text-[var(--color-text)]">Aucun plan généré</p>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          <Link href="/plan" className="underline">
            Importer un plan
          </Link>{" "}
          pour voir apparaître les prochaines séances ici.
        </p>
      </div>
    );
  }

  const paceRange = formatTimeRange(session.targetPaceMinSPerKm, session.targetPaceMaxSPerKm, (s) =>
    s == null ? "—" : formatPace(s),
  );
  // Le CSV importé donne une fourchette FC, pas d'allure — jamais les deux
  // à la fois pour une même séance dans ce modèle, donc pas de risque
  // d'afficher l'une à la place de l'autre par erreur.
  const hrRange =
    session.hrTargetMinBpm != null && session.hrTargetMaxBpm != null
      ? `${session.hrTargetMinBpm}–${session.hrTargetMaxBpm} bpm`
      : null;

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-4">
      <Badge tone="ok">PROCHAINE SÉANCE</Badge>
      <p className="font-display mt-2 text-base text-[var(--color-text)]">
        {shortLabel(session.day)} — {session.title}
      </p>
      {session.description ? (
        <p className="mt-1 text-sm text-[var(--color-muted)]">{session.description}</p>
      ) : null}
      <p className="mt-2 text-xs text-[var(--color-muted)]">
        <Link href="/plan" className="underline">
          Voir le plan complet
        </Link>
      </p>
      {/* Pas de colonne "sur route" : aucun champ de PlannedWorkout ne porte
          cette information (indoor/outdoor) — l'afficher inventerait une
          donnée plutôt que de la lire. */}
      <dl className="tabular mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <div>
          <dt className="text-[var(--color-faint)]">Distance</dt>
          <dd className="mt-0.5">
            {session.targetDistanceM != null ? (
              formatDistance(session.targetDistanceM)
            ) : (
              <span className="text-[var(--color-faint)]">—</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--color-faint)]">{paceRange ? "Allure indicative" : "Fourchette FC"}</dt>
          <dd className="mt-0.5">
            {paceRange ?? hrRange ?? <span className="text-[var(--color-faint)]">—</span>}
          </dd>
        </div>
      </dl>
    </div>
  );
}
