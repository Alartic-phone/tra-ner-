import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Racine du projet épinglée explicitement : apps/coach a son propre
  // package-lock.json, distinct de celui d'alartic/ à la racine du dépôt.
  // Sans ça, Next.js remonte l'arborescence à la recherche d'un lockfile et
  // peut choisir le mauvais répertoire comme racine (visible aussi via un
  // worktree Git, physiquement imbriqué sous le dépôt principal) —
  // resolution de `eslint-config-next` faussée en conséquence.
  outputFileTracingRoot: import.meta.dirname,
  // Sortie autonome : l'image Docker n'embarque que le strict nécessaire.
  output: "standalone",
  // Aucune ressource tierce : pas de domaine d'images distant autorisé.
  images: { remotePatterns: [] },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
