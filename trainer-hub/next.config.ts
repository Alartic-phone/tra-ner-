import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
