"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createGoal } from "@/app/(app)/plan/actions.ts";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardBody, CardHeader } from "@/components/ui/card.tsx";
import { ErrorText, Hint, Input, Label } from "@/components/ui/field.tsx";
import { parseClock } from "@/lib/utils.ts";

export function GoalForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("10 km");
  const [day, setDay] = useState("");
  const [distanceKm, setDistanceKm] = useState("10");
  const [targetTimeMin, setTargetTimeMin] = useState("");
  const [targetTimeMax, setTargetTimeMax] = useState("");
  const [floorTime, setFloorTime] = useState("");

  const submit = () => {
    setError(null);
    const distanceM = Number(distanceKm) * 1000;
    if (!day) {
      setError("Le jour de la course est requis.");
      return;
    }
    if (!Number.isFinite(distanceM) || distanceM <= 0) {
      setError("Distance invalide.");
      return;
    }
    const minFilled = targetTimeMin.trim() !== "";
    const maxFilled = targetTimeMax.trim() !== "";
    if (minFilled !== maxFilled) {
      setError("Les deux bornes du chrono visé doivent être renseignées ensemble, ou aucune.");
      return;
    }
    if (minFilled && parseClock(targetTimeMin) === null) {
      setError('Borne basse invalide — format "1:04:00" ou "45:00".');
      return;
    }
    if (maxFilled && parseClock(targetTimeMax) === null) {
      setError('Borne haute invalide — format "1:04:00" ou "45:00".');
      return;
    }
    if (minFilled && maxFilled && parseClock(targetTimeMin)! > parseClock(targetTimeMax)!) {
      setError("La borne basse doit être inférieure ou égale à la borne haute.");
      return;
    }
    if (floorTime.trim() !== "" && parseClock(floorTime) === null) {
      setError('Chrono plancher invalide — format "1:04:00" ou "45:00".');
      return;
    }

    startTransition(async () => {
      const result = await createGoal({
        name,
        day,
        distanceM,
        targetTimeMinS: parseClock(targetTimeMin),
        targetTimeMaxS: parseClock(targetTimeMax),
        floorTimeS: parseClock(floorTime),
        priority: "A",
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader title="Nouvel objectif" hint="Un seul objectif actif à la fois." />
      <CardBody className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="goal-name">Nom</Label>
          <Input id="goal-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label htmlFor="goal-day">Jour de la course</Label>
          <Input
            id="goal-day"
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="goal-distance">Distance (km)</Label>
          <Input
            id="goal-distance"
            type="number"
            min="0.1"
            step="0.1"
            value={distanceKm}
            onChange={(e) => setDistanceKm(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="goal-target-min">Chrono visé — borne basse</Label>
          <Input
            id="goal-target-min"
            placeholder="1:03:00"
            value={targetTimeMin}
            onChange={(e) => setTargetTimeMin(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="goal-target-max">Chrono visé — borne haute</Label>
          <Input
            id="goal-target-max"
            placeholder="1:07:00"
            value={targetTimeMax}
            onChange={(e) => setTargetTimeMax(e.target.value)}
            className="mt-1"
          />
          <Hint>
            Fourchette, pas un chiffre unique. Les deux ensemble, ou laisser les deux vides pour
            « terminer sans pression de temps ».
          </Hint>
        </div>
        <div>
          <Label htmlFor="goal-floor">Chrono plancher</Label>
          <Input
            id="goal-floor"
            placeholder="1:10:00"
            value={floorTime}
            onChange={(e) => setFloorTime(e.target.value)}
            className="mt-1"
          />
          <Hint>Optionnel — chrono « plancher » encore considéré comme une réussite.</Hint>
        </div>

        <div className="sm:col-span-2">
          <ErrorText>{error}</ErrorText>
          <Button type="button" onClick={submit} disabled={pending} className="mt-2">
            {pending ? "Enregistrement…" : "Créer l'objectif"}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
