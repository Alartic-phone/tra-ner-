"use client";

import { useMemo, useState, useTransition } from "react";
import { saveProfile } from "@/app/(app)/reglages/profil/actions.ts";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardBody, CardHeader } from "@/components/ui/card.tsx";
import { Hint, Input, Label, Select } from "@/components/ui/field.tsx";
import { computeHeartRateZones, computePaceZones } from "@/lib/metrics/zones.ts";
import { formatPace } from "@/lib/utils.ts";

export type ProfileValues = {
  firstName: string | null;
  birthDate: string | null;
  sex: "M" | "F" | null;
  weightKg: number | null;
  hrMax: number | null;
  hrRest: number | null;
  lactateThresholdHr: number | null;
  vma: number | null;
  weeklyVolumeKm: number | null;
  weeklySessionsTarget: number | null;
  injuryHistory: string | null;
};

export function ProfileForm({ initial }: { initial: ProfileValues }) {
  const [form, setForm] = useState<ProfileValues>(initial);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const set = <K extends keyof ProfileValues>(key: K, value: ProfileValues[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const num = (value: string): number | null => (value === "" ? null : Number(value));

  // Aperçu immédiat : voir les zones se déplacer en saisissant sa FC max évite
  // de découvrir une valeur aberrante trois semaines plus tard.
  const hrZones = useMemo(
    () =>
      form.hrMax != null && form.hrRest != null && form.hrMax > form.hrRest
        ? computeHeartRateZones(form.hrMax, form.hrRest)
        : [],
    [form.hrMax, form.hrRest],
  );
  const paceZones = useMemo(
    () => (form.vma != null && form.vma > 0 ? computePaceZones(form.vma) : []),
    [form.vma],
  );

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Identité" />
        <CardBody className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="firstName">Prénom</Label>
            <Input
              id="firstName"
              value={form.firstName ?? ""}
              onChange={(e) => set("firstName", e.target.value || null)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="birthDate">Date de naissance</Label>
            <Input
              id="birthDate"
              type="date"
              value={form.birthDate ?? ""}
              onChange={(e) => set("birthDate", e.target.value || null)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="sex">Sexe</Label>
            <Select
              id="sex"
              value={form.sex ?? ""}
              onChange={(e) => set("sex", (e.target.value || null) as "M" | "F" | null)}
              className="mt-1"
            >
              <option value="">Non renseigné</option>
              <option value="M">Homme</option>
              <option value="F">Femme</option>
            </Select>
            <Hint>
              Le TRIMP de Banister applique un coefficient différent selon le sexe.
              Sans cette information, la charge n&apos;est pas calculée.
            </Hint>
          </div>
          <div>
            <Label htmlFor="weightKg">Poids (kg)</Label>
            <Input
              id="weightKg"
              type="number"
              step="0.1"
              value={form.weightKg ?? ""}
              onChange={(e) => set("weightKg", num(e.target.value))}
              className="mt-1"
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Repères cardiaques"
          hint="La charge d'entraînement et les cinq zones en dépendent directement."
        />
        <CardBody>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="hrMax">FC maximale (bpm)</Label>
              <Input
                id="hrMax"
                type="number"
                value={form.hrMax ?? ""}
                onChange={(e) => set("hrMax", num(e.target.value))}
                className="mt-1"
              />
              <Hint>Valeur mesurée sur un test, pas la formule 220 − âge.</Hint>
            </div>
            <div>
              <Label htmlFor="hrRest">FC de repos (bpm)</Label>
              <Input
                id="hrRest"
                type="number"
                value={form.hrRest ?? ""}
                onChange={(e) => set("hrRest", num(e.target.value))}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="lactateThresholdHr">FC au seuil (bpm)</Label>
              <Input
                id="lactateThresholdHr"
                type="number"
                value={form.lactateThresholdHr ?? ""}
                onChange={(e) => set("lactateThresholdHr", num(e.target.value))}
                className="mt-1"
              />
              <Hint>Facultatif.</Hint>
            </div>
          </div>

          {hrZones.length > 0 ? (
            <div className="mt-4 border-t border-[var(--color-border)] pt-3">
              <p className="text-xs text-[var(--color-muted)]">
                Zones de Karvonen sur une réserve de{" "}
                {(form.hrMax ?? 0) - (form.hrRest ?? 0)} bpm :
              </p>
              <ul className="tabular mt-1.5 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                {hrZones.map((zone) => (
                  <li key={zone.index} className="flex justify-between">
                    <span className="text-[var(--color-muted)]">
                      Z{zone.index} · {zone.name}
                    </span>
                    <span>
                      {zone.fromBpm}–{zone.toBpm}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Repères d'allure" />
        <CardBody>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="vma">VMA (km/h)</Label>
              <Input
                id="vma"
                type="number"
                step="0.1"
                value={form.vma ?? ""}
                onChange={(e) => set("vma", num(e.target.value))}
                className="mt-1"
              />
              <Hint>Demi-Cooper ou Vameval.</Hint>
            </div>
            <div>
              <Label htmlFor="weeklyVolumeKm">Volume hebdomadaire actuel (km)</Label>
              <Input
                id="weeklyVolumeKm"
                type="number"
                step="1"
                value={form.weeklyVolumeKm ?? ""}
                onChange={(e) => set("weeklyVolumeKm", num(e.target.value))}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="weeklySessionsTarget">Séances tenables par semaine</Label>
              <Input
                id="weeklySessionsTarget"
                type="number"
                value={form.weeklySessionsTarget ?? ""}
                onChange={(e) => set("weeklySessionsTarget", num(e.target.value))}
                className="mt-1"
              />
            </div>
          </div>

          {paceZones.length > 0 ? (
            <ul className="tabular mt-4 grid gap-x-4 gap-y-1 border-t border-[var(--color-border)] pt-3 text-xs sm:grid-cols-2">
              {paceZones.map((zone) => (
                <li key={zone.name} className="flex justify-between">
                  <span className="text-[var(--color-muted)]">{zone.name}</span>
                  <span>
                    {formatPace(zone.slowestSPerKm).replace("/km", "")} →{" "}
                    {formatPace(zone.fastestSPerKm)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Historique de blessures"
          hint="Fourni au modèle lors de la génération du plan."
        />
        <CardBody>
          <textarea
            value={form.injuryHistory ?? ""}
            onChange={(e) => set("injuryHistory", e.target.value || null)}
            rows={4}
            className="w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] p-2 text-sm"
            placeholder="Zones sensibles, blessures passées, épisodes récurrents…"
          />
        </CardBody>
      </Card>

      <div className="flex items-center gap-3">
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await saveProfile(form);
              setFeedback(
                result.ok
                  ? { ok: true, text: result.message }
                  : { ok: false, text: result.error },
              );
            })
          }
        >
          {pending ? "Enregistrement…" : "Enregistrer le profil"}
        </Button>
        {feedback ? (
          <p
            className={
              feedback.ok
                ? "text-xs text-[var(--color-ok)]"
                : "text-xs text-[var(--color-danger)]"
            }
          >
            {feedback.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}
