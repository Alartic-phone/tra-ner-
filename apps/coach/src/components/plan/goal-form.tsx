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
  const [targetTime, setTargetTime] = useState("");
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
    if (targetTime.trim() !== "" && parseClock(targetTime) === null) {
      setError('Chrono visé invalide — format "1:04:00" ou "45:00".');
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
        targetTimeS: parseClock(targetTime),
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
          <Label htmlFor="goal-target">Chrono visé</Label>
          <Input
            id="goal-target"
            placeholder="1:04:00"
            value={targetTime}
            onChange={(e) => setTargetTime(e.target.value)}
            className="mt-1"
          />
          <Hint>Optionnel — laisser vide pour « terminer sans pression de temps ».</Hint>
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
