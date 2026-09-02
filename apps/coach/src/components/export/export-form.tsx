"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Label, Select } from "@/components/ui/field.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { formatDistance } from "@/lib/utils.ts";
import {
  ALL_SECTIONS,
  EXPORT_PERIOD_PRESETS,
  EXPORT_PRESETS,
  buildExportFilename,
  type ExportActivityDetail,
  type ExportFormat,
  type ExportPeriodPreset,
  type ExportScope,
  type ExportSections,
} from "@/lib/export/scope.ts";
import type { ExportPreview } from "@/lib/export/size.ts";

type StreamCandidate = { id: string; name: string; startDay: string; distanceM: number };

const SECTION_LABELS: Record<keyof ExportSections, string> = {
  profile: "Profil et zones",
  shifts: "Postes",
  weeks: "Semaines",
  activities: "Activités",
  health: "Santé quotidienne",
  records: "Records et meilleurs efforts",
  plan: "Plan",
  quality: "Qualité des données",
};

const PERIOD_LABELS: Record<ExportPeriodPreset, string> = {
  "7": "7 derniers jours",
  "30": "30 derniers jours",
  "90": "90 derniers jours",
  all: "Tout",
  custom: "Dates personnalisées",
};

const DETAIL_LABELS: Record<ExportActivityDetail, string> = {
  none: "Aucune",
  long: "Les sorties de plus de 45 min",
  all: "Toutes (fichier volumineux)",
};

const FORMAT_LABELS: Record<ExportFormat, { label: string; hint: string }> = {
  markdown: { label: "Markdown", hint: "Un seul fichier .md, le plus lisible — usage par défaut." },
  json: { label: "JSON", hint: "Structure typée complète, pour réimport ou script." },
  csv: { label: "CSV (.zip)", hint: "Quatre tableaux, pour ouvrir dans un tableur." },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

export function ExportForm({ streamCandidates }: { streamCandidates: StreamCandidate[] }) {
  const [periodPreset, setPeriodPreset] = useState<ExportPeriodPreset>("90");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [sections, setSections] = useState<ExportSections>(ALL_SECTIONS);
  const [activityDetail, setActivityDetail] = useState<ExportActivityDetail>("none");
  const [format, setFormat] = useState<ExportFormat>("markdown");
  const [includeStreams, setIncludeStreams] = useState(false);
  const [streamActivityIds, setStreamActivityIds] = useState<string[]>([]);

  const [preview, setPreview] = useState<ExportPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scope: ExportScope = useMemo(
    () => ({
      periodPreset,
      customFrom: customFrom || undefined,
      customTo: customTo || undefined,
      sections,
      activityDetail,
      format,
      includeStreams,
      streamActivityIds,
    }),
    [periodPreset, customFrom, customTo, sections, activityDetail, format, includeStreams, streamActivityIds],
  );

  // Aperçu de taille : recalculé à chaque changement de portée, débattu pour
  // ne pas déclencher une génération complète à chaque frappe sur les dates.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setPreviewLoading(true);
    debounceRef.current = setTimeout(() => {
      fetch("/api/export/size", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(scope) })
        .then(async (res) => {
          if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Échec de l'estimation");
          return res.json() as Promise<ExportPreview>;
        })
        .then((p) => {
          setPreview(p);
          setError(null);
        })
        .catch((e) => setError(e instanceof Error ? e.message : String(e)))
        .finally(() => setPreviewLoading(false));
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(scope)]);

  function applyPreset(id: (typeof EXPORT_PRESETS)[number]["id"]) {
    const preset = EXPORT_PRESETS.find((p) => p.id === id)!;
    setPeriodPreset(preset.scope.periodPreset);
    setSections(preset.scope.sections);
    setActivityDetail(preset.scope.activityDetail);
    setFormat(preset.scope.format);
    setIncludeStreams(false);
    setStreamActivityIds([]);
  }

  function toggleSection(key: keyof ExportSections) {
    setSections((s) => ({ ...s, [key]: !s[key] }));
  }

  async function handleDownload() {
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scope),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Échec de l'export (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = buildExportFilename(scope, new Date().toISOString().slice(0, 10));
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Préréglages" hint="Un clic pour une portée courante — modifiable ensuite ci-dessous." />
        <CardBody className="flex flex-wrap gap-2">
          {EXPORT_PRESETS.map((p) => (
            <Button key={p.id} variant="outline" size="sm" onClick={() => applyPreset(p.id)} title={p.description}>
              {p.label}
            </Button>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Période" />
        <CardBody className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {EXPORT_PERIOD_PRESETS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setPeriodPreset(key)}
                className={`rounded-[var(--radius-pill)] border px-3 py-1 text-xs transition-colors duration-[var(--duration-fast)] ${
                  periodPreset === key
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                    : "border-[var(--color-border-strong)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"
                }`}
              >
                {PERIOD_LABELS[key]}
              </button>
            ))}
          </div>
          {periodPreset === "custom" ? (
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label htmlFor="export-from">Du</Label>
                <input
                  id="export-from"
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="mt-1 h-9 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 text-sm"
                />
              </div>
              <div>
                <Label htmlFor="export-to">Au</Label>
                <input
                  id="export-to"
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="mt-1 h-9 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 text-sm"
                />
              </div>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Sections" />
        <CardBody>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(SECTION_LABELS) as Array<keyof ExportSections>).map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={sections[key]}
                  onChange={() => toggleSection(key)}
                  className="h-4 w-4 accent-[var(--color-accent)]"
                />
                {SECTION_LABELS[key]}
              </label>
            ))}
          </div>

          <div className="mt-4">
            <Label htmlFor="export-detail">Détail des activités marquantes (section 5)</Label>
            <Select
              id="export-detail"
              className="mt-1 max-w-xs"
              value={activityDetail}
              onChange={(e) => setActivityDetail(e.target.value as ExportActivityDetail)}
            >
              {(Object.keys(DETAIL_LABELS) as ExportActivityDetail[]).map((key) => (
                <option key={key} value={key}>
                  {DETAIL_LABELS[key]}
                </option>
              ))}
            </Select>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Format" />
        <CardBody className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(FORMAT_LABELS) as ExportFormat[]).map((key) => (
              <label
                key={key}
                className={`flex-1 min-w-[180px] cursor-pointer rounded-[var(--radius-card)] border px-3 py-2 text-sm transition-colors duration-[var(--duration-fast)] ${
                  format === key
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                    : "border-[var(--color-border-strong)] hover:bg-[var(--color-surface-2)]"
                }`}
              >
                <input
                  type="radio"
                  name="export-format"
                  value={key}
                  checked={format === key}
                  onChange={() => setFormat(key)}
                  className="sr-only"
                />
                <div className="font-medium">{FORMAT_LABELS[key].label}</div>
                <div className="mt-0.5 text-xs text-[var(--color-muted)]">{FORMAT_LABELS[key].hint}</div>
              </label>
            ))}
          </div>

          {format === "json" ? (
            <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={includeStreams}
                  onChange={(e) => setIncludeStreams(e.target.checked)}
                  className="h-4 w-4 accent-[var(--color-accent)]"
                />
                Inclure les flux seconde par seconde
              </label>
              <p className="mt-1 text-[11px] text-[var(--color-faint)]">
                Décoché par défaut : des dizaines de mégaoctets pour un historique complet. Uniquement
                pour les activités cochées ci-dessous.
              </p>
              {includeStreams ? (
                <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-[var(--color-border)] p-2">
                  {streamCandidates.length === 0 ? (
                    <p className="text-xs text-[var(--color-muted)]">
                      Aucune activité avec flux sur les 12 derniers mois.
                    </p>
                  ) : (
                    streamCandidates.map((a) => (
                      <label key={a.id} className="flex items-center gap-2 py-0.5 text-xs">
                        <input
                          type="checkbox"
                          checked={streamActivityIds.includes(a.id)}
                          onChange={(e) =>
                            setStreamActivityIds((ids) =>
                              e.target.checked ? [...ids, a.id] : ids.filter((id) => id !== a.id),
                            )
                          }
                          className="h-3.5 w-3.5 accent-[var(--color-accent)]"
                        />
                        <span className="tabular text-[var(--color-muted)]">{a.startDay}</span>
                        <span className="truncate">{a.name}</span>
                        <span className="tabular ml-auto shrink-0 text-[var(--color-faint)]">
                          {formatDistance(a.distanceM)}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card elevated>
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            {previewLoading ? (
              <span className="inline-flex items-center gap-1.5 text-[var(--color-muted)]">
                <Loader2 size={14} className="animate-spin" aria-hidden /> Estimation…
              </span>
            ) : preview ? (
              <span className="tabular">
                Taille estimée : <span className="font-medium">{formatBytes(preview.bytes)}</span>
                {preview.format === "csv" ? " (avant compression du .zip)" : ""}
                {preview.warnTooLarge ? (
                  <Badge tone="warn" className="ml-2">
                    au-delà de 400 000 caractères — réduire la période plutôt que tronquer
                  </Badge>
                ) : null}
              </span>
            ) : (
              <span className="text-[var(--color-muted)]">—</span>
            )}
            {error ? <p className="mt-1 text-xs text-[var(--color-danger)]">{error}</p> : null}
          </div>
          <Button onClick={handleDownload} disabled={downloading}>
            {downloading ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Download size={16} aria-hidden />}
            Télécharger
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
