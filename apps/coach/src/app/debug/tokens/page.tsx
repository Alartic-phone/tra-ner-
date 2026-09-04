import { DUR, EASE, STAGGER, SPRING_RECORD } from "@/lib/motion.ts";
import { readPhotoManifest } from "@/lib/photo-manifest.ts";
import { pickPhoto, type PhotoMoment } from "@/lib/photos.ts";
import { today } from "@/lib/time.ts";

/**
 * Page de référence du système de design (étape 1, point de contrôle A).
 * Sert à vérifier d'un coup d'œil les tokens réels de globals.css et l'état
 * du pack de photos — jamais une page destinée à l'usage quotidien.
 */

export const metadata = { title: "Tokens — debug" };

const COLOR_GROUPS: Array<{ title: string; swatches: Array<{ name: string; varName: string }> }> = [
  {
    title: "Surfaces et texte",
    swatches: [
      { name: "bg", varName: "--color-bg" },
      { name: "surface", varName: "--color-surface" },
      { name: "surface-2", varName: "--color-surface-2" },
      { name: "border", varName: "--color-border" },
      { name: "border-strong", varName: "--color-border-strong" },
      { name: "text", varName: "--color-text" },
      { name: "muted", varName: "--color-muted" },
      { name: "faint", varName: "--color-faint" },
    ],
  },
  {
    title: "Accents",
    swatches: [
      { name: "accent", varName: "--color-accent" },
      { name: "signal (ambre, rare — voir commentaire globals.css)", varName: "--color-signal" },
      { name: "signal-bg", varName: "--color-signal-bg" },
    ],
  },
  {
    title: "Statut",
    swatches: [
      { name: "ok", varName: "--color-ok" },
      { name: "warn", varName: "--color-warn" },
      { name: "serious", varName: "--color-serious" },
      { name: "danger", varName: "--color-danger" },
      { name: "info", varName: "--color-info" },
    ],
  },
  {
    title: "Zones FC (Karvonen, non modifiables)",
    swatches: [
      { name: "zone 1 — récupération", varName: "--zone-1" },
      { name: "zone 2 — endurance fondamentale", varName: "--zone-2" },
      { name: "zone 3 — endurance active", varName: "--zone-3" },
      { name: "zone 4 — seuil", varName: "--zone-4" },
      { name: "zone 5 — VMA", varName: "--zone-5" },
    ],
  },
  {
    title: "Postes",
    swatches: [
      { name: "matin", varName: "--color-shift-m" },
      { name: "après-midi", varName: "--color-shift-a" },
      { name: "nuit", varName: "--color-shift-n" },
      { name: "repos", varName: "--color-rest" },
    ],
  },
  {
    title: "Sports (décoratif)",
    swatches: [
      { name: "course", varName: "--sport-run" },
      { name: "vélo", varName: "--sport-ride" },
      { name: "natation", varName: "--sport-swim" },
      { name: "autre", varName: "--sport-other" },
    ],
  },
];

const HERO_SIZES = [
  { key: "md", varName: "--text-hero-md" },
  { key: "lg", varName: "--text-hero-lg" },
  { key: "xl", varName: "--text-hero-xl" },
] as const;

const MOMENTS: PhotoMoment[] = ["aube", "jour", "soir", "nuit"];

export default async function TokensDebugPage() {
  const manifest = await readPhotoManifest();
  const day = today();

  return (
    <div className="mx-auto max-w-[1100px] space-y-12 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Tokens — système de design</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Point de contrôle A. Couleurs, typographie et mouvement lus directement dans
          globals.css / lib/motion.ts / lib/fonts.ts — rien de codé en dur sur cette page.
        </p>
      </header>

      <section>
        <h2 className="text-lg font-semibold">Couleur</h2>
        <div className="mt-4 space-y-6">
          {COLOR_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-sm font-medium text-[var(--color-muted)]">{group.title}</h3>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {group.swatches.map((s) => (
                  <div key={s.varName} className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)]">
                    <div className="h-16" style={{ backgroundColor: `var(${s.varName})` }} />
                    <div className="p-2 text-xs">
                      <div>{s.name}</div>
                      <div className="font-[family-name:var(--font-mono)] text-[var(--color-faint)]">
                        {s.varName}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Typographie</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Archivo Variable sur son axe de largeur (.text-hero-number) pour les chiffres héros ;
          poids normal pour les titres ; JetBrains Mono pour les tableaux de données.
        </p>
        <div className="mt-4 space-y-4">
          {HERO_SIZES.map((h) => (
            <div key={h.key} className="flex items-baseline gap-4 border-b border-[var(--color-border)] pb-3">
              <span className="w-32 shrink-0 text-xs text-[var(--color-faint)]">
                {h.varName} ({h.key})
              </span>
              <span className="text-hero-number" style={{ fontSize: `var(${h.varName})` }}>
                24,68
              </span>
              <span className="text-sm text-[var(--color-muted)]">km</span>
            </div>
          ))}
          <div className="flex items-baseline gap-4 border-b border-[var(--color-border)] pb-3">
            <span className="w-32 shrink-0 text-xs text-[var(--color-faint)]">titre (--font-display)</span>
            <span className="font-[family-name:var(--font-display)] text-xl font-semibold">
              Poste d&rsquo;après-midi
            </span>
          </div>
          <div className="flex items-baseline gap-4">
            <span className="w-32 shrink-0 text-xs text-[var(--color-faint)]">tableau (--font-mono)</span>
            <span className="font-[family-name:var(--font-mono)] text-sm">
              19:47 · 4,03 km · 4&rsquo;55&quot;/km · FC 177
            </span>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Mouvement — lib/motion.ts</h2>
        <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 font-[family-name:var(--font-mono)] text-sm sm:grid-cols-4">
          <div>DUR.fast = {DUR.fast}</div>
          <div>DUR.base = {DUR.base}</div>
          <div>DUR.slow = {DUR.slow}</div>
          <div>DUR.draw = {DUR.draw}</div>
          <div>EASE.out = [{EASE.out.join(", ")}]</div>
          <div>EASE.inOut = [{EASE.inOut.join(", ")}]</div>
          <div>STAGGER = {STAGGER}</div>
          <div>
            SPRING_RECORD = stiffness {SPRING_RECORD.type === "spring" ? SPRING_RECORD.stiffness : "—"},
            damping {SPRING_RECORD.type === "spring" ? SPRING_RECORD.damping : "—"}
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Pack de photos</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          {manifest.length === 0
            ? "Manifeste vide : le pack n'a pas encore été téléchargé (npm run photos:fetch, " +
              "nécessite UNSPLASH_ACCESS_KEY ou PEXELS_API_KEY dans .env.local). L'app dégrade " +
              "vers un aplat --color-surface, comme prévu — elle ne casse jamais."
            : `${manifest.length} photo(s) dans le pack.`}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {MOMENTS.map((moment) => {
            const photo = pickPhoto(day, moment, manifest);
            return (
              <div
                key={moment}
                className="flex h-32 flex-col items-center justify-center gap-1 overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] bg-cover bg-center text-xs"
                style={photo ? { backgroundImage: `url(${photo.file800})` } : undefined}
              >
                {!photo && <span className="text-[var(--color-faint)]">aplat — pas de photo</span>}
                <span
                  className={
                    photo
                      ? "rounded-[var(--radius-pill)] bg-[rgba(8,11,18,0.62)] px-2 py-0.5 text-[var(--color-text)]"
                      : "text-[var(--color-muted)]"
                  }
                >
                  {moment}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
