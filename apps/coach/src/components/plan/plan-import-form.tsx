"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  analyzePlanImport,
  confirmPlanImport,
  type PlanImportPreview,
} from "@/app/(app)/plan/import-actions.ts";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardBody, CardHeader } from "@/components/ui/card.tsx";
import { formatDayShort } from "@/lib/time.ts";

/**
 * Import en deux temps (aperçu, puis confirmation explicite) : le fichier
 * reste en mémoire côté client entre les deux étapes et est renvoyé tel
 * quel à la confirmation — le serveur reparse et revalide indépendamment de
 * l'aperçu, jamais fait confiance aux lignes déjà classées côté client.
 */
export function PlanImportForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PlanImportPreview | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmedMessage, setConfirmedMessage] = useState<string | null>(null);
  const [analyzing, startAnalyze] = useTransition();
  const [confirming, startConfirm] = useTransition();

  const reset = () => {
    setFile(null);
    setPreview(null);
    setConfirmError(null);
    setConfirmedMessage(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const onFileChange = (f: File | null) => {
    setFile(f);
    setPreview(null);
    setConfirmError(null);
    setConfirmedMessage(null);
    if (!f) return;
    startAnalyze(async () => {
      const fd = new FormData();
      fd.set("file", f);
      const result = await analyzePlanImport(fd);
      setPreview(result);
    });
  };

  const onConfirm = () => {
    if (!file) return;
    setConfirmError(null);
    startConfirm(async () => {
      const fd = new FormData();
      fd.set("file", file);
      const result = await confirmPlanImport(fd);
      if (!result.ok) {
        setConfirmError(result.error);
        return;
      }
      setConfirmedMessage(
        `Import terminé : ${result.created} séance(s) créée(s), ${result.updated} mise(s) à jour.`,
      );
      setPreview(null);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    });
  };

  const hasRejected = preview?.ok && preview.rejected.length > 0;
  const canConfirm = preview?.ok && preview.rejected.length === 0 && preview.valid.length > 0;

  return (
    <Card>
      <CardHeader
        title="Importer le plan (fichier CSV)"
        hint="Séparateur « ; », en-tête obligatoire. Aperçu avant écriture — rien n'est enregistré tant que l'import n'est pas confirmé."
      />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
            className="text-xs"
          />
          {file ? (
            <Button variant="ghost" size="sm" onClick={reset} disabled={analyzing || confirming}>
              Annuler
            </Button>
          ) : null}
        </div>

        {analyzing ? <p className="text-xs text-[var(--color-muted)]">Analyse du fichier…</p> : null}

        {confirmedMessage ? (
          <p className="rounded-[var(--radius-card)] border border-[var(--color-ok)]/40 px-3 py-2 text-xs text-[var(--color-ok)]">
            {confirmedMessage}
          </p>
        ) : null}

        {preview && !preview.ok ? (
          <p className="rounded-[var(--radius-card)] border border-[var(--color-danger)]/40 px-3 py-2 text-xs text-[var(--color-danger)]">
            {preview.fileError}
          </p>
        ) : null}

        {preview?.ok ? (
          <div className="space-y-3">
            <p className="text-xs text-[var(--color-muted)]">
              Encodage détecté : {preview.encoding === "utf-8" ? "UTF-8" : "CP1252 (Excel français)"} ·{" "}
              {preview.valid.length} ligne(s) valide(s) · {preview.rejected.length} rejetée(s)
            </p>

            {preview.valid.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-xs">
                  <thead className="text-[var(--color-muted)]">
                    <tr className="border-b border-[var(--color-border)]">
                      <th className="py-1.5 pr-3 font-medium">Date</th>
                      <th className="py-1.5 pr-3 font-medium">Type</th>
                      <th className="py-1.5 pr-3 font-medium">Statut</th>
                      <th className="py-1.5 pr-3 font-medium">Objectif</th>
                      <th className="py-1.5 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.valid.map((row) => (
                      <tr key={row.line} className="border-b border-[var(--color-border)] last:border-0">
                        <td className="py-1.5 pr-3 tabular">{formatDayShort(row.day)}</td>
                        <td className="py-1.5 pr-3">{row.type}</td>
                        <td className="py-1.5 pr-3">
                          <Badge tone={row.status === "FAIT" ? "ok" : "neutral"}>{row.status}</Badge>
                        </td>
                        <td className="py-1.5 pr-3 text-[var(--color-muted)]">{row.objective || "—"}</td>
                        <td className="py-1.5">
                          <Badge tone={row.action === "create" ? "info" : "warn"}>
                            {row.action === "create" ? "création" : "mise à jour"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {hasRejected ? (
              <div className="rounded-[var(--radius-card)] border border-[var(--color-danger)]/40 p-3">
                <p className="text-xs font-medium text-[var(--color-danger)]">
                  {preview.rejected.length} ligne(s) rejetée(s) — tout ou rien : tant qu&apos;il en
                  reste une, rien n&apos;est écrit.
                </p>
                <ul className="mt-2 space-y-1 text-xs text-[var(--color-danger)]">
                  {preview.rejected.map((r) => (
                    <li key={r.line}>
                      ligne {r.line} : {r.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {confirmError ? (
              <p className="text-xs text-[var(--color-danger)]">{confirmError}</p>
            ) : null}

            <Button onClick={onConfirm} disabled={!canConfirm || confirming}>
              {confirming
                ? "Import en cours…"
                : hasRejected
                  ? "Corriger le fichier avant import"
                  : "Confirmer l'import"}
            </Button>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
