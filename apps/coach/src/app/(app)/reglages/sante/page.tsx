import { Unavailable } from "@/components/ui/badge.tsx";
import { loadHealthHistory } from "@/lib/metrics/repository.ts";
import { formatDayShort } from "@/lib/time.ts";

export const dynamic = "force-dynamic";

/**
 * Consultation discrète des mesures COROS archivées — plus jamais alimentée
 * depuis la décision de ne plus importer de fichiers FIT à la main (voir
 * README, section Import de l'historique COROS). Aucun verdict recalculé :
 * juste les valeurs brutes, pour retrouver le contexte d'un bloc passé.
 */
export default async function HealthHistoryPage() {
  const history = await loadHealthHistory();

  return (
    <div className="p-4 md:p-6">
      <header>
        <h1 className="text-lg font-semibold">Historique santé</h1>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">
          Mesures COROS importées manuellement (sommeil, VFC nocturne, FC de
          repos, récupération) — l&apos;import est abandonné, ces valeurs ne
          seront plus mises à jour. Conservées pour mémoire, sans verdict
          recalculé.
        </p>
      </header>

      {history.length === 0 ? (
        <p className="mt-5 text-sm text-[var(--color-muted)]">
          Aucune mesure archivée.
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-muted)]">
                <th className="px-3 py-2 font-medium">Jour</th>
                <th className="px-3 py-2 text-right font-medium">VFC</th>
                <th className="px-3 py-2 text-right font-medium">FC repos</th>
                <th className="px-3 py-2 text-right font-medium">Sommeil</th>
                <th className="px-3 py-2 text-right font-medium">Sommeil profond</th>
                <th className="px-3 py-2 text-right font-medium">Score sommeil</th>
                <th className="px-3 py-2 text-right font-medium">Récupération</th>
                <th className="px-3 py-2 text-right font-medium">Source</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {history.map((h) => (
                <tr key={h.day} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-3 py-1.5">{formatDayShort(h.day)}</td>
                  <td className="px-3 py-1.5 text-right">
                    {h.hrv != null ? `${h.hrv} ms` : <Unavailable />}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {h.restingHr != null ? `${h.restingHr} bpm` : <Unavailable />}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {h.sleepDurationMin != null ? `${h.sleepDurationMin} min` : <Unavailable />}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {h.sleepDeepMin != null ? `${h.sleepDeepMin} min` : <Unavailable />}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {h.sleepScore != null ? h.sleepScore : <Unavailable />}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {h.recoveryStatusPct != null ? `${h.recoveryStatusPct} %` : <Unavailable />}
                  </td>
                  <td className="px-3 py-1.5 text-right text-xs text-[var(--color-muted)]">
                    {h.source}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
