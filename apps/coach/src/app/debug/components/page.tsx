import { CycleRibbon } from "@/components/ui/cycle-ribbon.tsx";
import { PhotoHero } from "@/components/ui/photo-hero.tsx";
import { HeroStat } from "@/components/ui/hero-stat.tsx";
import { ZoneBar } from "@/components/activities/zone-bar.tsx";
import { TraceThumb } from "@/components/ui/trace-thumb.tsx";
import { RecordStaircase } from "@/components/ui/record-staircase.tsx";
import { TraceAtlas } from "@/components/ui/trace-atlas.tsx";
import { getAvailabilityRules } from "@/lib/settings.ts";
import { loadCycleRibbonDays } from "@/lib/shifts/repository.ts";
import { readPhotoManifest } from "@/lib/photo-manifest.ts";
import { pickPhoto, momentForContext } from "@/lib/photos.ts";
import { today } from "@/lib/time.ts";
import { buildTracePath } from "@/lib/trace.ts";
import { buildAtlasSvg } from "@/lib/trace-atlas.ts";
import { computeHeartRateZones } from "@/lib/metrics/zones.ts";

export const metadata = { title: "Composants — debug" };
export const dynamic = "force-dynamic";

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-[var(--color-border)] pt-6 first:border-t-0 first:pt-0">
      <h2 className="text-lg font-semibold">{title}</h2>
      {note ? <p className="mt-1 text-sm text-[var(--color-muted)]">{note}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Génère une boucle synthétique autour d'un centre — UNIQUEMENT pour peupler
 * cette page de démonstration (ni activité ni tracé réels n'existent encore
 * dans cette base). Jamais utilisé ailleurs que /debug. */
function syntheticLoop(centerLat: number, centerLng: number, seed: number): [number, number][] {
  const points: [number, number][] = [];
  const n = 60;
  for (let i = 0; i <= n; i++) {
    const angle = (i / n) * Math.PI * 2;
    const r = 0.01 + 0.004 * Math.sin(angle * 3 + seed);
    points.push([centerLat + Math.sin(angle) * r, centerLng + Math.cos(angle) * r * 1.3]);
  }
  return points;
}

export default async function ComponentsDebugPage() {
  const rules = await getAvailabilityRules();
  const day = today();
  const ribbonDays = await loadCycleRibbonDays(day, rules);
  const manifest = await readPhotoManifest();
  const moment = momentForContext({ shiftCode: null, isWorking: false, hour: new Date().getHours() });
  const photo = pickPhoto(day, moment, manifest);

  // Échantillon aligné sur l'exemple canonique de zones.ts (seuil 175 bpm).
  const sampleZones = computeHeartRateZones(175, 190);
  const sampleSecondsByZone = [420, 1560, 720, 240, 60];

  const tracePath = buildTracePath(syntheticLoop(45.75, 4.85, 0));
  const atlasTraces = Array.from({ length: 7 }, (_, i) => syntheticLoop(45.75, 4.85, i));
  const atlas = buildAtlasSvg(atlasTraces);

  return (
    <div className="mx-auto max-w-[1100px] space-y-10 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Composants signature</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Point de contrôle B. Les sept composants de l&apos;étape 2, chacun avec des
          données réelles quand elles existent (cycle de postes) ou clairement
          synthétiques sinon (tracés — la base ne contient encore aucune activité).
        </p>
      </header>

      <Section title="1. CycleRibbon" note="Avec le vrai cycle de postes stocké en base.">
        <CycleRibbon days={ribbonDays} />
      </Section>

      <Section title="2. PhotoHero" note="Avec le pack de photos si disponible, sinon l'aplat de repli.">
        <PhotoHero photo={photo} height={196}>
          <p className="text-sm text-[var(--color-text)]">Poste d&apos;après-midi · matinée libre jusqu&apos;à 12 h 15</p>
          <p className="mt-1 text-hero-number text-hero-lg">Repos</p>
        </PhotoHero>
      </Section>

      <Section title="3. HeroStat" note="Tailles md/lg/xl, estimé, absent, tendance.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <HeroStat label="Distance" value={24.68} decimals={2} unit="km" size="md" />
          <HeroStat label="Allure" value={5.42} decimals={2} unit="min/km" size="lg" estimated />
          <HeroStat label="TRIMP" value={null} reason="Aucune source de charge pour cette séance" size="lg" />
          <HeroStat label="D+" value={214} unit="m" size="lg" trend="+18 % vs 7 j" tone="ok" />
        </div>
      </Section>

      <Section title="4. ZoneBar" note="Avec légende chiffrée (par défaut) puis en variante compacte (liste).">
        <div className="max-w-md space-y-4">
          <ZoneBar secondsByZone={sampleSecondsByZone} zones={sampleZones} />
          <ZoneBar secondsByZone={sampleSecondsByZone} zones={sampleZones} legend={false} />
        </div>
      </Section>

      <Section title="5. TraceThumb" note="Avec tracé (synthétique), et sans GPS (repli icône).">
        <div className="flex items-center gap-4">
          <TraceThumb tracePath={tracePath} type="Run" size={80} />
          <TraceThumb tracePath={null} type="WeightTraining" size={80} />
        </div>
      </Section>

      <Section
        title="6. RecordStaircase"
        note="Données de référence de la refonte : 6,84 → 7,32 → 8,00 → 8,96 → 10,71 km."
      >
        <div className="max-w-xl">
          <RecordStaircase
            records={[
              { day: "2026-07-24", value: 6.84 },
              { day: "2026-08-14", value: 7.32 },
              { day: "2026-08-20", value: 8.0 },
              { day: "2026-08-25", value: 8.96 },
              { day: "2026-08-29", value: 10.71 },
            ]}
          />
        </div>
      </Section>

      <Section
        title="7. TraceAtlas"
        note="7 tracés synthétiques (démonstration) — en usage réel, moins de 5 tracés affiche l'état vide ci-dessous en second."
      >
        <div className="max-w-md space-y-4">
          <TraceAtlas svg={atlas.svg} />
          <TraceAtlas svg={null} />
        </div>
      </Section>
    </div>
  );
}
