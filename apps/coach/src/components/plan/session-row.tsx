"use client";

import type { ReactNode } from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ImportedPlanSession } from "@prisma/client";
import { deleteSession } from "@/app/(app)/plan/session-actions.ts";
import { Badge, Unavailable } from "@/components/ui/badge.tsx";
import { formatDayShort } from "@/lib/time.ts";
import { formatDistance, formatDuration } from "@/lib/utils.ts";
import { weekdayLabel } from "@/lib/shifts/day.ts";
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
 */
export function SessionRow({ session }: { session: ImportedPlanSession }) {
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

  const doDelete = () => {
    startDelete(async () => {
      await deleteSession(session.id);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap items-start gap-2 px-4 py-2.5 text-xs">
      <span className="w-20 shrink-0 pt-0.5 text-[var(--color-faint)]">
        {weekdayLabel(session.day)} {formatDayShort(session.day)}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{session.type}</Badge>
          <Badge tone={session.status === "FAIT" ? "ok" : "neutral"}>
            {session.status === "FAIT" ? "fait" : "à faire"}
          </Badge>
          <span className="text-[var(--color-muted)]">
            {session.distanceM != null ? formatDistance(session.distanceM) : <Unavailable />}
            {" · "}
            {session.durationS != null ? formatDuration(session.durationS) : <Unavailable />}
            {" · "}
            {hrRange(session)}
          </span>
        </div>
        {session.objective ? <p className="text-[var(--color-text)]">{session.objective}</p> : null}
        {muscu.length > 0 ? (
          <ul className="list-inside list-disc text-[var(--color-muted)]">
            {muscu.map((entry, i) => (
              <li key={i}>{entry}</li>
            ))}
          </ul>
        ) : null}
        {fractionne.length > 0 ? (
          <ul className="list-inside list-disc text-[var(--color-muted)]">
            {fractionne.map((entry, i) => (
              <li key={i}>{entry}</li>
            ))}
          </ul>
        ) : null}
        {session.notes ? <p className="text-[11px] text-[var(--color-faint)]">{session.notes}</p> : null}
      </div>
      <div className="ml-auto flex shrink-0 gap-2 pt-0.5 text-[var(--color-faint)]">
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
  );
}
