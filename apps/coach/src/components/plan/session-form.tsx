"use client";

import { useState, useTransition } from "react";
import type { ImportedPlanSession } from "@prisma/client";
import {
  createSessionManually,
  updateSessionManually,
  type SessionFormInput,
} from "@/app/(app)/plan/session-actions.ts";
import { Button } from "@/components/ui/button.tsx";
import { ErrorText, Hint, Input, Label, Select, Textarea } from "@/components/ui/field.tsx";

function toInput(session?: ImportedPlanSession): SessionFormInput {
  return {
    date: session?.day ?? "",
    type: session?.type ?? "",
    statut: session?.status ?? "A_FAIRE",
    distanceKm: session?.distanceM != null ? String(session.distanceM / 1000) : "",
    dureeMin: session?.durationS != null ? String(session.durationS / 60) : "",
    fcMin: session?.hrTargetMinBpm != null ? String(session.hrTargetMinBpm) : "",
    fcMax: session?.hrTargetMaxBpm != null ? String(session.hrTargetMaxBpm) : "",
    zone: session?.zoneLabel ?? "",
    objectif: session?.objective ?? "",
    muscu: session?.muscuDetails ?? "",
    fractionne: session?.fractionneDetails ?? "",
    notes: session?.notes ?? "",
  };
}

/**
 * Ajout/modification manuelle d'une séance unique — pour corriger un jour
 * sans repasser par le fichier CSV. Passe par la même validation qu'une
 * ligne importée (côté serveur, `validateRow`) : une saisie incohérente est
 * rejetée avec le même motif que si elle venait d'un fichier.
 */
export function SessionForm({
  mode,
  session,
  onDone,
  onCancel,
}: {
  mode: "create" | "edit";
  session?: ImportedPlanSession;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [input, setInput] = useState<SessionFormInput>(() => toInput(session));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof SessionFormInput>(key: K) => (value: string) =>
    setInput((prev) => ({ ...prev, [key]: value }));

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createSessionManually(input)
          : await updateSessionManually(session!.id, input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onDone();
    });
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <Label htmlFor="session-date">Date</Label>
        <Input
          id="session-date"
          type="date"
          value={input.date}
          onChange={(e) => set("date")(e.target.value)}
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="session-type">Type</Label>
        <Input
          id="session-type"
          value={input.type}
          onChange={(e) => set("type")(e.target.value)}
          placeholder="Course, Sortie longue, Renforcement…"
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="session-statut">Statut</Label>
        <Select
          id="session-statut"
          value={input.statut}
          onChange={(e) => set("statut")(e.target.value)}
          className="mt-1"
        >
          <option value="A_FAIRE">À faire</option>
          <option value="FAIT">Fait</option>
        </Select>
        <Hint>
          Une intention, pas une activité — n&apos;écrase jamais Strava, qui reste la source du
          réalisé.
        </Hint>
      </div>
      <div>
        <Label htmlFor="session-objectif">Objectif de la séance</Label>
        <Input
          id="session-objectif"
          value={input.objectif}
          onChange={(e) => set("objectif")(e.target.value)}
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="session-distance">Distance (km)</Label>
        <Input
          id="session-distance"
          type="number"
          step="0.1"
          value={input.distanceKm}
          onChange={(e) => set("distanceKm")(e.target.value)}
          placeholder="laisser vide si non disponible"
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="session-duree">Durée estimée (min)</Label>
        <Input
          id="session-duree"
          type="number"
          step="1"
          value={input.dureeMin}
          onChange={(e) => set("dureeMin")(e.target.value)}
          placeholder="laisser vide si non disponible"
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="session-fc-min">FC cible — min (bpm)</Label>
        <Input
          id="session-fc-min"
          type="number"
          value={input.fcMin}
          onChange={(e) => set("fcMin")(e.target.value)}
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="session-fc-max">FC cible — max (bpm)</Label>
        <Input
          id="session-fc-max"
          type="number"
          value={input.fcMax}
          onChange={(e) => set("fcMax")(e.target.value)}
          className="mt-1"
        />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="session-zone">Zone (texte libre)</Label>
        <Input
          id="session-zone"
          value={input.zone}
          onChange={(e) => set("zone")(e.target.value)}
          className="mt-1"
        />
        <Hint>
          Purement descriptif — seule la FC cible ci-dessus est vérifiée contre les zones réelles
          (lib/metrics/zones.ts). Une contradiction est rejetée à l&apos;enregistrement.
        </Hint>
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="session-muscu">Détail musculation</Label>
        <Textarea
          id="session-muscu"
          value={input.muscu}
          onChange={(e) => set("muscu")(e.target.value)}
          className="mt-1"
        />
        <Hint>Entrées séparées par « | ».</Hint>
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="session-fractionne">Détail fractionné</Label>
        <Textarea
          id="session-fractionne"
          value={input.fractionne}
          onChange={(e) => set("fractionne")(e.target.value)}
          className="mt-1"
        />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="session-notes">Notes</Label>
        <Textarea
          id="session-notes"
          value={input.notes}
          onChange={(e) => set("notes")(e.target.value)}
          className="mt-1"
        />
      </div>

      <div className="sm:col-span-2">
        <ErrorText>{error}</ErrorText>
        <div className="mt-2 flex gap-2">
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? "Enregistrement…" : mode === "create" ? "Ajouter la séance" : "Enregistrer"}
          </Button>
          {onCancel ? (
            <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
              Annuler
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
