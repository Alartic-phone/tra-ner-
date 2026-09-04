"use client";

import { useState, useTransition } from "react";
import { previewExport } from "@/app/(app)/analyses/export/actions.ts";
import { Button } from "@/components/ui/button.tsx";
import type { ExportFormat } from "@/lib/export/build.ts";
import type { ExportScope } from "@/lib/export/gather.ts";

type Detail = "aucune" | "plus_45min" | "toutes";

const SCOPES: Array<{ value: ExportScope; label: string }> = [
  { value: "7j", label: "7 jours" },
  { value: "30j", label: "30 jours" },
  { value: "90j", label: "90 jours" },
  { value: "tout", label: "Tout" },
  { value: "personnalise", label: "Dates libres" },
];
const DETAILS: Array<{ value: Detail; label: string }> = [
  { value: "aucune", label: "Aucune" },
  { value: "plus_45min", label: "Plus de 45 min" },
  { value: "toutes", label: "Toutes" },
];
const FORMATS: Array<{ value: ExportFormat; label: string }> = [
  { value: "md", label: "Markdown" },
  { value: "json", label: "JSON" },
  { value: "csv", label: "CSV (.zip)" },
];

type Preset = { scope: ExportScope; format: ExportFormat; detail: Detail };
const PRESETS: Record<string, Preset> = {
  "Bilan de la semaine": { scope: "7j", format: "md", detail: "aucune" },
  "Dossier complet": { scope: "tout", format: "md", detail: "toutes" },
  "Brut (JSON)": { scope: "tout", format: "json", detail: "toutes" },
};

export function ExportControls() {
  const [scope, setScope] = useState<ExportScope>("30j");
  const [format, setFormat] = useState<ExportFormat>("md");
  const [detail, setDetail] = useState<Detail>("aucune");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [preview, setPreview] = useState<{ filename: string; charCount: number; tooLarge: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function applyPreset(preset: Preset) {
    setScope(preset.scope);
    setFormat(preset.format);
    setDetail(preset.detail);
    setPreview(null);
  }

  function runPreview() {
    setError(null);
    startTransition(async () => {
      const result = await previewExport({ scope, format, detail, from: from || undefined, to: to || undefined });
      if (result.ok) {
        setPreview({ filename: result.filename, charCount: result.charCount, tooLarge: result.tooLarge });
      } else {
        setPreview(null);
        setError(result.error);
      }
    });
  }

  const downloadHref = (() => {
    const params = new URLSearchParams({ scope, format, detail });
    if (scope === "personnalise") {
      if (from) params.set("from", from);
      if (to) params.set("to", to);
    }
    return `/api/export?${params.toString()}`;
  })();

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium text-[var(--color-muted)]">Préréglages</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {Object.entries(PRESETS).map(([label, preset]) => (
            <button
              key={label}
              type="button"
              onClick={() => applyPreset(preset)}
              className="rounded-[var(--radius-pill)] border border-[var(--color-border-strong)] px-3 py-1 text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-2)]"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-[var(--color-muted)]">Période</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {SCOPES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => {
                setScope(s.value);
                setPreview(null);
              }}
              className={`rounded-[var(--radius-pill)] border px-3 py-1 text-xs ${scope === s.value ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : "border-[var(--color-border-strong)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        {scope === "personnalise" ? (
          <div className="mt-2 flex items-center gap-2">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-9 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 text-xs text-[var(--color-text)]"
            />
            <span className="text-xs text-[var(--color-faint)]">à</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-9 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 text-xs text-[var(--color-text)]"
            />
          </div>
        ) : null}
      </div>

      <div>
        <p className="text-xs font-medium text-[var(--color-muted)]">Détail des activités</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {DETAILS.map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => {
                setDetail(d.value);
                setPreview(null);
              }}
              className={`rounded-[var(--radius-pill)] border px-3 py-1 text-xs ${detail === d.value ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : "border-[var(--color-border-strong)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"}`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-[var(--color-muted)]">Format</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {FORMATS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => {
                setFormat(f.value);
                setPreview(null);
              }}
              className={`rounded-[var(--radius-pill)] border px-3 py-1 text-xs ${format === f.value ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : "border-[var(--color-border-strong)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--color-border)] pt-4">
        <Button type="button" variant="outline" onClick={runPreview} disabled={isPending}>
          {isPending ? "Calcul…" : "Vérifier la taille"}
        </Button>
        {preview ? (
          <a
            href={downloadHref}
            className="inline-flex h-9 items-center rounded-lg bg-[var(--color-accent)] px-4 text-xs font-medium text-[#06101f] hover:opacity-90"
          >
            Télécharger {preview.filename}
          </a>
        ) : (
          <span className="text-xs text-[var(--color-faint)]">
            Vérifier la taille avant de télécharger.
          </span>
        )}
      </div>

      {preview ? (
        <p className={`text-xs ${preview.tooLarge ? "text-[var(--color-danger)]" : "text-[var(--color-muted)]"}`}>
          {preview.charCount.toLocaleString("fr-FR")} caractères.
          {preview.tooLarge
            ? " Au-delà de 400 000 caractères : envisager de réduire la période plutôt que de tronquer le fichier."
            : ""}
        </p>
      ) : null}
      {error ? <p className="text-xs text-[var(--color-danger)]">{error}</p> : null}
    </div>
  );
}
