import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://alartic.fr',
  trailingSlash: 'never',
  build: {
    // Les CSS sont inlinés s'ils sont petits (perf), les scripts sont TOUJOURS
    // externalisés (cf. vite.build.assetsInlineLimit) pour respecter la CSP stricte
    // (script-src 'self') configurée dans le Caddyfile.
    inlineStylesheets: 'auto',
    assets: '_astro',
  },
  compressHTML: true,
  prefetch: false,
  devToolbar: {
    enabled: false,
  },
  vite: {
    build: {
      // 0 = ne jamais inliner d'asset (scripts inclus). Les scripts deviennent
      // des fichiers /_astro/*.js servis avec hash, donc compatibles CSP self.
      assetsInlineLimit: 0,
    },
  },
});
