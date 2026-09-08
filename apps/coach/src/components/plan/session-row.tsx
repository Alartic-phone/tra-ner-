"use client";

import type { ReactNode } from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ImportedPlanSession } from "@prisma/client";
import { Check } from "lucide-react";
import { deleteSession } from "@/app/(app)/plan/session-actions.ts";
import { Badge, Unavailable } from "@/components/ui/badge.tsx";
import { SessionDoneToggle } from "@/components/plan/session-done-toggle.tsx";
import { formatDayShort } from "@/lib/time.ts";
import { formatDistance, formatDuration } from "@/lib/utils.ts";
import { weekdayLabel } from "@/lib/shifts/day.ts";
import { cn } from "@/lib/utils.ts";
import { SessionForm } from "@/components/plan/session-form.tsx";

function hrRange(session: ImportedPlanSession): ReactNode {
  const { hrTargetMinBpm: min, hrTargetMaxBpm: max } = session;
  if (min == null && max == null) return <Unavailable reason="Aucune fourchette FC dans le fichier importé" />;
  if (min != null && max != null) return `${min}–${max} bpm`;
  return `${min ?? max} bpm`;
}

function detailsList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split("|")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Une séance importée, avec modification et suppression manuelles — pour
 * corriger un jour sans repasser par le fichier CSV. La suppression
 * demande une confirmation en deux clics plutôt qu'un `confirm()` natif,
 * pour rester cohérent avec le reste de l'interface (aucun autre endroit
 * de l'appli n'utilise de popin de confirmation).
 *
 * Rendu mobile-first (cahier des charges §2.5), hiérarchie du plus important
 * au moins important : jour + poste réel + type, objectif, chiffres clés
 * (tabular), détail muscu/fractionné (une entrée par ligne), notes en
 * dernier. `zoneLabel` s'affiche explicitement comme un libellé du plan, pas
 * une zone calculée (seule autorité : lib/metrics/zones.ts). FAIT vs
 * A_FAIRE se distingue par le texte du badge et l'opacité de la carte,
 * jamais la couleur seule.
 */
export function SessionRow({
  session,
  isToday = false,
  shiftLabel,
}: {
  session: ImportedPlanSession;
  isToday?: boolean;
  shiftLabel?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, startDelete] = useTransition();

  if (editing) {
    return (
      <div className="px-4 py-3">
        <SessionForm
          mode="edit"
          session={session}
          onDone={() => {
            setEditing(false);
            router.refresh();
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  const muscu = detailsList(session.muscuDetails);
  const fractionne = detailsList(session.fractionneDetails);
  const done = session.status === "FAIT";

  const doDelete = () => {
    startDelete(async () => {
      await deleteSession(session.id);
      router.refresh();
    });
  };

  return (
    <div
      className={cn(
        "flex gap-3 p-4 text-sm",
        isToday && "bg-[var(--color-accent-soft)]/40",
        done && "opacity-70",
      )}
    >
      <SessionDoneToggle sessionId={session.id} done={done} className="mt-0.5" />

      <div className="min-w-0 flex-1">
        {/* 1. Jour + poste réel + type */}
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span
            className={cn(
              "tabular text-xs",
              isToday ? "font-semibold text-[var(--color-accent)]" : "text-[var(--color-faint)]",
            )}
          >
            {weekdayLabel(session.day)} {formatDayShort(session.day)}
            {isToday ? " · aujourd'hui" : ""}
          </span>
          {shiftLabel ? <span className="text-xs text-[var(--color-muted)]">{shiftLabel}</span> : null}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          <p className={cn("font-display text-base text-[var(--color-text)]", done && "line-through")}>
            {session.type}
          </p>
          <Badge tone={done ? "ok" : "neutral"} className="gap-1">
            {done ? <Check size={11} aria-hidden /> : null}
            {done ? "Fait" : "À faire"}
          </Badge>
        </div>

        {/* 2. Objectif */}
        {session.objective ? <p className="mt-1.5 text-[var(--color-text)]">{session.objective}</p> : null}

        {/* 3. Chiffres clés */}
        <div className="tabular mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-muted)]">
          <span>{session.distanceM != null ? formatDistance(session.distanceM) : <Unavailable />}</span>
          <span>{session.durationS != null ? formatDuration(session.durationS) : <Unavailable />}</span>
          <span>{hrRange(session)}</span>
        </div>

        {/* Libellé du plan, sans autorité (R5) — jamais confondu avec une
            zone calculée par lib/metrics/zones.ts. */}
        {session.zoneLabel ? (
          <p className="mt-1 text-xs text-[var(--color-faint)]">
            Zone indiquée par le plan : <span className="text-[var(--color-muted)]">{session.zoneLabel}</span>
          </p>
        ) : null}

        {/* 4. Détail muscu / fractionné : une entrée par ligne. */}
        {muscu.length > 0 ? (
          <div className="mt-3">
            <p className="text-xs font-medium text-[var(--color-muted)]">Renforcement</p>
            <ul className="mt-1 space-y-1 text-[var(--color-text)]">
              {muscu.map((entry, i) => (
                <li key={i}>{entry}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {fractionne.length > 0 ? (
          <div className="mt-3">
            <p className="text-xs font-medium text-[var(--color-muted)]">Fractionné</p>
            <ul className="mt-1 space-y-1 text-[var(--color-text)]">
              {fractionne.map((entry, i) => (
                <li key={i}>{entry}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* 5. Notes, en dernier. */}
        {session.notes ? <p className="mt-3 text-xs text-[var(--color-faint)]">{session.notes}</p> : null}

        <div className="mt-3 flex gap-3 text-xs text-[var(--color-faint)]">
          <button type="button" onClick={() => setEditing(true)} className="hover:underline">
            modifier
          </button>
          {confirmingDelete ? (
            <>
              <button
                type="button"
                onClick={doDelete}
                disabled={deleting}
                className="text-[var(--color-danger)] hover:underline"
              >
                {deleting ? "suppression…" : "confirmer"}
              </button>
              <button type="button" onClick={() => setConfirmingDelete(false)} className="hover:underline">
                annuler
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirmingDelete(true)} className="hover:underline">
              supprimer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
