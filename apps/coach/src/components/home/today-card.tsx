import Link from "next/link";
import { Badge, Unavailable } from "@/components/ui/badge.tsx";
import { SessionDoneToggle } from "@/components/plan/session-done-toggle.tsx";
import { formatDistance, formatDuration } from "@/lib/utils.ts";
import type { TodaySession } from "@/lib/home-repository.ts";

/**
 * Bloc « Aujourd'hui » (cahier des charges §2.2) : ce que l'utilisateur
 * regarde le matin, en haut de la colonne de droite — le poste réel du jour
 * (lib/shifts/) et la ou les séances du jour, jamais la prochaine séance à
 * venir (`<NextSession>` juste en dessous montre la suivante, strictement
 * après). Trois états jamais ambigus, cf. la fonction plus bas.
 */
export function TodayCard({
  sessions,
  hasAnyPlan,
  shiftLabel,
  shiftCode,
  startTime,
  endTime,
}: {
  sessions: readonly TodaySession[];
  hasAnyPlan: boolean;
  shiftLabel: string;
  shiftCode: string | null;
  startTime: string | null;
  endTime: string | null;
}) {
  const shiftPhrase = shiftCode ? `${shiftLabel} ${startTime}–${endTime}` : "Repos";

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-4">
      <div className="flex items-center justify-between gap-2">
        <Badge tone="info">AUJOURD&apos;HUI</Badge>
        <span className="tabular text-xs text-[var(--color-muted)]">{shiftPhrase}</span>
      </div>

      {!hasAnyPlan ? (
        // Aucun plan importé du tout : jamais « repos », qui laisserait
        // croire que le repos est prescrit plutôt que simplement l'absence
        // de plan (§2.2, même principe que <NextSession /> sans plan).
        <>
          <p className="font-display mt-2 text-base text-[var(--color-text)]">Aucun plan importé</p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            <Link href="/plan" className="underline">
              Importer un plan
            </Link>{" "}
            pour voir apparaître la séance du jour ici.
          </p>
        </>
      ) : sessions.length === 0 ? (
        <p className="font-display mt-2 text-base text-[var(--color-text)]">Rien de prévu aujourd&apos;hui</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {sessions.map((session) => (
            <li key={session.id} className="flex items-start gap-3">
              {session.source === "imported" ? (
                <SessionDoneToggle
                  sessionId={session.id}
                  done={session.status === "FAIT"}
                  className="mt-0.5"
                />
              ) : (
                // Ancien plan Claude (repli d'affichage, §3.3.b) :
                // `toggleSessionStatus` ne connaît que les séances
                // importées — un bouton ici échouerait à l'appui.
                // Réservé pour garder l'alignement avec les lignes qui
                // portent le contrôle.
                <span className="mt-0.5 h-11 w-11 shrink-0" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-display text-base text-[var(--color-text)]">{session.type}</p>
                {session.objective ? (
                  <p className="mt-0.5 text-sm text-[var(--color-muted)]">{session.objective}</p>
                ) : null}
                <p className="tabular mt-1 text-xs text-[var(--color-muted)]">
                  {session.distanceM != null ? formatDistance(session.distanceM) : <Unavailable />}
                  {" · "}
                  {session.durationS != null ? formatDuration(session.durationS) : <Unavailable />}
                  {session.hrTargetMinBpm != null && session.hrTargetMaxBpm != null
                    ? ` · ${session.hrTargetMinBpm}–${session.hrTargetMaxBpm} bpm`
                    : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
