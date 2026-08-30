"use client";

import { useMemo, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card.tsx";
import { ErrorText, Hint, Input, Label } from "@/components/ui/field.tsx";
import { DEFAULT_DISTANCES } from "@/lib/metrics/best-efforts.ts";
import { danielsPaces, fitRiegelExponent, predictTimeFromVdot, riegel, vdotFromRace, RIEGEL_EXPONENT } from "@/lib/metrics/prediction.ts";
import { formatClock, formatDistance, formatPace, parseClock } from "@/lib/utils.ts";

/**
 * Calculateur interactif « et si » — aucune donnée serveur requise : tout le
 * calcul est fait dans le navigateur avec les fonctions pures de
 * `metrics/prediction.ts`. Ce sont des simulations hypothétiques, jamais des
 * mesures : rien n'est enregistré, rien ne prétend décrire une performance
 * réelle qui n'a pas eu lieu.
 */

const DISTANCE_LABELS: Record<number, string> = {
  400: "400 m",
  1000: "1 km",
  1609: "1 mile",
  5000: "5 km",
  10000: "10 km",
  21097: "Semi-marathon",
  42195: "Marathon",
};

export function RiegelCalculator({
  initialDistanceM,
  initialTimeS,
}: {
  initialDistanceM?: number;
  initialTimeS?: number;
}) {
  const [distanceKm, setDistanceKm] = useState(
    initialDistanceM ? String(initialDistanceM / 1000) : "10",
  );
  const [time, setTime] = useState(initialTimeS ? formatClock(initialTimeS) : "");
  const [exponent, setExponent] = useState(RIEGEL_EXPONENT);

  const [secondDistanceKm, setSecondDistanceKm] = useState("");
  const [secondTime, setSecondTime] = useState("");

  const distanceM = Number(distanceKm) * 1000;
  const timeS = parseClock(time);
  const valid = Number.isFinite(distanceM) && distanceM > 0 && timeS != null && timeS > 0;

  const vdot = valid ? vdotFromRace(distanceM, timeS) : null;
  const paces = vdot != null ? danielsPaces(vdot) : null;

  const rows = useMemo(() => {
    if (!valid) return [];
    return DEFAULT_DISTANCES.map((target) => ({
      target,
      riegelTimeS: riegel(distanceM, timeS, target, exponent),
      vdotTimeS: vdot != null ? predictTimeFromVdot(vdot, target) : null,
    }));
  }, [valid, distanceM, timeS, exponent, vdot]);

  const autoFit = () => {
    const secondDistanceM = Number(secondDistanceKm) * 1000;
    const secondTimeS = parseClock(secondTime);
    if (!valid || !Number.isFinite(secondDistanceM) || secondDistanceM <= 0 || secondTimeS == null) {
      return;
    }
    const fitted = fitRiegelExponent(
      { distanceM, timeS: timeS! },
      { distanceM: secondDistanceM, timeS: secondTimeS },
    );
    if (fitted != null) setExponent(Math.round(fitted * 1000) / 1000);
  };

  return (
    <Card>
      <CardHeader
        title="Calculateur Riegel / VDOT"
        hint="Simulation hypothétique à partir d'une performance saisie — pas une mesure."
      />
      <CardBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="ref-distance">Distance de référence (km)</Label>
            <Input
              id="ref-distance"
              type="number"
              min="0.1"
              step="0.1"
              value={distanceKm}
              onChange={(e) => setDistanceKm(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="ref-time">Chrono</Label>
            <Input
              id="ref-time"
              placeholder="45:00"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="mt-1"
            />
            {time.trim() !== "" && timeS === null ? (
              <ErrorText>Format attendu : &quot;45:00&quot; ou &quot;1:04:00&quot;.</ErrorText>
            ) : null}
          </div>
          <div>
            <Label htmlFor="ref-exponent">Exposant de Riegel</Label>
            <Input
              id="ref-exponent"
              type="number"
              min="1"
              max="1.15"
              step="0.001"
              value={exponent}
              onChange={(e) => setExponent(Number(e.target.value))}
              className="mt-1"
            />
            <Hint>1,06 par défaut — plus bas pour un profil endurant.</Hint>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 border-t border-[var(--color-border)] pt-3">
          <div>
            <Label htmlFor="ref2-distance">Ajuster automatiquement — 2ᵉ distance (km)</Label>
            <Input
              id="ref2-distance"
              type="number"
              min="0.1"
              step="0.1"
              value={secondDistanceKm}
              onChange={(e) => setSecondDistanceKm(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="ref2-time">2ᵉ chrono</Label>
            <Input
              id="ref2-time"
              placeholder="21:00"
              value={secondTime}
              onChange={(e) => setSecondTime(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={autoFit}
              className="h-9 rounded-lg border border-[var(--color-border-strong)] px-3 text-xs transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-surface-2)]"
            >
              Ajuster l&apos;exposant depuis ces deux performances
            </button>
          </div>
        </div>

        {!valid ? (
          <p className="text-xs text-[var(--color-muted)]">
            Saisir une distance et un chrono de référence pour voir les prédictions.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-muted)]">
                    <th className="px-2 py-2 font-medium">Distance</th>
                    <th className="px-2 py-2 text-right font-medium">Riegel</th>
                    <th className="px-2 py-2 text-right font-medium">VDOT</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {rows.map((row) => (
                    <tr key={row.target} className="border-b border-[var(--color-border)] last:border-0">
                      <td className="px-2 py-1.5">
                        {DISTANCE_LABELS[row.target] ?? formatDistance(row.target)}
                      </td>
                      <td className="px-2 py-1.5 text-right">{formatClock(row.riegelTimeS)}</td>
                      <td className="px-2 py-1.5 text-right">{formatClock(row.vdotTimeS)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {paces ? (
              <div className="border-t border-[var(--color-border)] pt-3">
                <h3 className="text-xs font-medium text-[var(--color-muted)]">
                  Allures d&apos;entraînement (Daniels, VDOT {vdot!.toFixed(1)})
                </h3>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
                  <div>Endurance lente : {formatPace(paces.easySlowSPerKm)}</div>
                  <div>Endurance rapide : {formatPace(paces.easyFastSPerKm)}</div>
                  <div>Marathon : {formatPace(paces.marathonSPerKm)}</div>
                  <div>Seuil : {formatPace(paces.thresholdSPerKm)}</div>
                  <div>Intervalles : {formatPace(paces.intervalSPerKm)}</div>
                  <div>Répétitions : {formatPace(paces.repetitionSPerKm)}</div>
                </div>
              </div>
            ) : null}
          </>
        )}
      </CardBody>
    </Card>
  );
}
