import { AnalysesTabs } from "@/components/analytics/analyses-tabs.tsx";
import { ExportControls } from "@/components/analytics/export-controls.tsx";

export const dynamic = "force-dynamic";

export default function ExportPage() {
  return (
    <div className="mx-auto max-w-[640px] p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-lg font-semibold">Export</h1>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">
            Sort tout le dossier dans un fichier unique, à transmettre à un coach — humain ou
            modèle — sans accès à l&apos;app.
          </p>
        </div>
        <AnalysesTabs active="export" />
      </header>

      <div className="mt-6">
        <ExportControls />
      </div>

      <p className="mt-6 border-t border-[var(--color-border)] pt-4 text-xs text-[var(--color-faint)]">
        Équivalent en ligne de commande : <code>npm run export -- --format md --since AAAA-MM-JJ --out ./export.md</code>
        {" "}— produit exactement le même fichier.
      </p>
    </div>
  );
}
