/**
 * Build de prévisualisation — rend le site Astro en HTML statique sans la
 * chaîne d'outils Astro (indisponible ici : le registre npm est bloqué par la
 * politique réseau de l'environnement).
 *
 * Sortie : `dist-preview/` (arborescence servable) puis un bundle
 * mono-fichier autonome pour consultation hors serveur.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { compileAstro } from "./compile.mjs";
import { startPage, endPage, toHtml } from "./runtime.mjs";

const require = createRequire(import.meta.url);
const ts = require("/opt/node22/lib/node_modules/typescript/lib/typescript.js");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const WEB = path.join(ROOT, "apps/web");
const SRC = path.join(WEB, "src");
const OUT = path.join(ROOT, "dist-preview");
const WORK = path.join(ROOT, ".preview-build");

/* ───────── Utilitaires ───────── */

const walk = (dir, filter) => {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, filter));
    else if (!filter || filter(full)) out.push(full);
  }
  return out;
};

const write = (file, content) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};

const copyDir = (from, to) => {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dst);
    else fs.copyFileSync(src, dst);
  }
};

/* ───────── Transpilation ───────── */

function transpile(source, { jsx }) {
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: jsx ? ts.JsxEmit.React : ts.JsxEmit.None,
      jsxFactory: "h",
      jsxFragmentFactory: "Fragment",
      verbatimModuleSyntax: false,
      isolatedModules: true,
    },
    reportDiagnostics: true,
  });
  const fatal = (result.diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error);
  return { code: result.outputText, errors: fatal };
}

/** Réécrit les spécifieurs d'import vers l'arborescence de build. */
function rewriteImports(code, { fileDir }) {
  const runtimeRel = path
    .relative(fileDir, path.join(WORK, "_runtime.mjs"))
    .replace(/\\/g, "/");
  const contentRel = path
    .relative(fileDir, path.join(WORK, "_content.mjs"))
    .replace(/\\/g, "/");
  const rel = (p) => (p.startsWith(".") ? p : `./${p}`);

  /* `import.meta.env` est fourni par Vite ; ici on fige les valeurs d'un build
   * de production (l'API back-end n'existe pas dans cette prévisualisation).
   * La table `__BLOCKS` est exclue : elle contient le corps des `<script>`
   * client sous forme de littéral JSON, traité plus tard à l'assemblage. */
  code = code
    .split("\n")
    .map((line) =>
      line.startsWith("const __BLOCKS =")
        ? line
        : line.replace(/import\.meta\.env/g, '({ DEV: false, PROD: true, SSR: true, BASE_URL: "/", MODE: "production" })'),
    )
    .join("\n");

  return code.replace(
    /(from\s*|import\s*)(["'])([^"']+)\2/g,
    (match, prefix, quote, spec) => {
      if (spec === "@runtime") return `${prefix}${quote}${rel(runtimeRel)}${quote}`;
      if (spec === "astro:content") return `${prefix}${quote}${rel(contentRel)}${quote}`;
      if (spec === "astro:transitions" || spec.startsWith("astro:")) {
        return `${prefix}${quote}${rel(runtimeRel.replace("_runtime.mjs", "_astro-shims.mjs"))}${quote}`;
      }
      if (spec.endsWith(".astro")) return `${prefix}${quote}${spec.replace(/\.astro$/, ".mjs")}${quote}`;
      if (spec.endsWith(".css")) return `${prefix}${quote}${rel(path.relative(fileDir, path.join(WORK, "_noop.mjs")).replace(/\\/g, "/"))}${quote}`;
      if (spec.startsWith("@fontsource")) {
        return `${prefix}${quote}${rel(path.relative(fileDir, path.join(WORK, "_noop.mjs")).replace(/\\/g, "/"))}${quote}`;
      }
      return match;
    },
  );
}

/* ───────── Étape 1 : compiler les .astro ───────── */

function buildModules() {
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });

  /* Ré-exports plutôt que copies : le runtime et la couche contenu doivent
   * exister en une seule instance, partagée avec ce script (le contexte de
   * page et les collections sont des états de module). */
  const reexport = (file) =>
    `export * from ${JSON.stringify(pathToFileURL(path.join(HERE, file)).href)};\n`;
  write(path.join(WORK, "_runtime.mjs"), reexport("runtime.mjs"));
  write(path.join(WORK, "_content.mjs"), reexport("content.mjs"));
  write(path.join(WORK, "_noop.mjs"), "export default {};\n");
  write(
    path.join(WORK, "_astro-shims.mjs"),
    [
      'import { raw } from "./_runtime.mjs";',
      "/* `ClientRouter` n'a pas d'équivalent statique : rendu neutre. */",
      "export const ClientRouter = async () => raw(\"\");",
      "export const fade = () => ({});",
      "export const slide = () => ({});",
    ].join("\n"),
  );

  const errors = [];
  const astroFiles = walk(SRC, (f) => f.endsWith(".astro"));

  for (const file of astroFiles) {
    const relPath = path.relative(SRC, file);
    const name = path.basename(file, ".astro");
    const source = fs.readFileSync(file, "utf8");

    let tsx;
    try {
      tsx = compileAstro(source, { componentName: name });
    } catch (err) {
      errors.push({ file: relPath, stage: "compile", message: err.message });
      continue;
    }

    const { code, errors: tsErrors } = transpile(tsx, { jsx: true });
    if (tsErrors.length) {
      for (const d of tsErrors.slice(0, 3)) {
        const { line } = ts.getLineAndCharacterOfPosition(d.file, d.start ?? 0);
        errors.push({
          file: relPath,
          stage: "tsx",
          message: `${ts.flattenDiagnosticMessageText(d.messageText, " ")} (ligne TSX ${line + 1})`,
          tsx,
        });
      }
    }

    const outFile = path.join(WORK, relPath.replace(/\.astro$/, ".mjs"));
    write(outFile, rewriteImports(code, { fileDir: path.dirname(outFile) }));
  }

  /* Scripts TypeScript partagés (cart, dialogs) — transpilés pour le client. */
  for (const file of walk(path.join(SRC, "scripts"), (f) => f.endsWith(".ts"))) {
    const name = path.basename(file, ".ts");
    if (name === "animations") continue; /* remplacé : GSAP indisponible */
    const { code } = transpile(fs.readFileSync(file, "utf8"), { jsx: false });
    write(path.join(OUT, "scripts", `${name}.js`), rewriteClientImports(code));
  }

  return errors;
}

/** Les imports client pointent vers les fichiers `/scripts/*.js` émis. */
function rewriteClientImports(code) {
  code = code.replace(/import\.meta\.env/g, '({ DEV: false, PROD: true, BASE_URL: "/", MODE: "production" })');
  return code.replace(
    /(from\s*|import\s*)(["'])([^"']+)\2/g,
    (match, prefix, quote, spec) => {
      const m = spec.match(/(?:^|\/)scripts\/([\w-]+)(?:\.ts)?$/);
      if (m) return `${prefix}${quote}/scripts/${m[1]}.js${quote}`;
      if (/^\.{1,2}\//.test(spec)) {
        const base = spec.replace(/\.ts$/, "").split("/").pop();
        return `${prefix}${quote}/scripts/${base}.js${quote}`;
      }
      return match;
    },
  );
}

/* ───────── Étape 2 : rendre les pages ───────── */

function routeFor(relPath) {
  let route = "/" + relPath.replace(/\.astro$/, "").replace(/\\/g, "/");
  if (route.endsWith("/index")) route = route.slice(0, -"/index".length) || "/";
  return route;
}

async function renderPages() {
  const content = await import("./content.mjs");
  content.loadCollections(path.join(WEB, "content"));

  const pageFiles = walk(path.join(SRC, "pages"), (f) => f.endsWith(".astro"));
  const pages = [];
  const failures = [];

  for (const file of pageFiles) {
    const relPath = path.relative(path.join(SRC, "pages"), file);
    const modPath = path.join(WORK, "pages", relPath.replace(/\.astro$/, ".mjs"));
    if (!fs.existsSync(modPath)) continue;

    let mod;
    try {
      mod = await import(pathToFileURL(modPath).href);
    } catch (err) {
      failures.push({ route: routeFor(relPath), message: `import: ${err.message}` });
      continue;
    }

    /* Routes dynamiques : une page par entrée de `getStaticPaths()`. */
    const instances = [];
    if (typeof mod.getStaticPaths === "function") {
      const paths = await mod.getStaticPaths();
      for (const entry of paths) {
        let route = routeFor(relPath);
        for (const [key, value] of Object.entries(entry.params || {})) {
          route = route.replace(`[${key}]`, value);
        }
        instances.push({ route, props: entry.props || {}, params: entry.params || {} });
      }
    } else {
      instances.push({ route: routeFor(relPath), props: {}, params: {} });
    }

    for (const instance of instances) {
      try {
        const page = startPage(instance.route);
        const result = await mod.default({
          props: instance.props,
          params: instance.params,
          slots: { default: "" },
          url: new URL(instance.route, "https://alartic.fr"),
        });
        const body = await toHtml(result);
        endPage();
        pages.push({ ...instance, body, styles: page.styles, scripts: page.scripts });
      } catch (err) {
        endPage();
        failures.push({ route: instance.route, message: err.stack?.split("\n").slice(0, 3).join(" | ") });
      }
    }
  }

  return { pages, failures };
}

/* ───────── Étape 3 : assemblage HTML ───────── */

function assemble(page) {
  let html = page.body.trim();

  const styleTags = page.styles
    .map((s) => `<style data-owner="${s.owner}">${s.css}</style>`)
    .join("\n");

  const scriptTags = page.scripts
    .map((s) => {
      const vars = s.vars
        ? Object.entries(s.vars)
            .map(([k, v]) => `const ${k} = ${JSON.stringify(v)};`)
            .join("\n")
        : "";
      const { code } = transpile(s.body, { jsx: false });
      const body = rewriteClientImports(code);
      /* Astro traite chaque `<script>` d'un composant comme un module : c'est
       * ce qui isole les portées quand deux blocs déclarent le même nom. */
      return `<script type="module">\n${vars}\n${body}\n</script>`;
    })
    .join("\n");

  const head = [
    '<link rel="stylesheet" href="/styles/global.css" />',
    styleTags,
  ].join("\n");

  html = html.replace("</head>", `${head}\n</head>`);
  /* Les composants s'initialisent sur `astro:page-load`, émis par le
   * ClientRouter d'Astro. Sans routeur client ici, on émet l'événement
   * nous-mêmes — après les modules de page, qui sont différés et donc déjà
   * évalués à ce stade. */
  const lifecycle =
    '<script type="module">document.dispatchEvent(new Event("astro:page-load"));</script>';

  html = html.replace(
    "</body>",
    `${scriptTags}\n<script type="module" src="/scripts/animations.js"></script>\n${lifecycle}\n</body>`,
  );

  return `<!doctype html>\n${html}\n`;
}

/* ───────── Étape 4 : assets ───────── */

function copyAssets() {
  copyDir(path.join(WEB, "public"), OUT);

  /* Les polices Fontsource viennent de npm (inaccessible) : on retire les
   * @import et on laisse jouer les fallbacks système déclarés dans tokens.css. */
  const global = fs
    .readFileSync(path.join(SRC, "styles/global.css"), "utf8")
    .replace(/@import\s+"@fontsource[^"]*";\s*\n?/g, "");
  write(path.join(OUT, "styles/global.css"), global);
  fs.copyFileSync(path.join(SRC, "styles/tokens.css"), path.join(OUT, "styles/tokens.css"));

  fs.copyFileSync(path.join(HERE, "animations-preview.js"), path.join(OUT, "scripts/animations.js"));
}

/* ───────── Main ───────── */

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const compileErrors = buildModules();
  copyAssets();

  const { pages, failures } = await renderPages();

  for (const page of pages) {
    const target =
      page.route === "/"
        ? path.join(OUT, "index.html")
        : path.join(OUT, page.route.replace(/^\//, ""), "index.html");
    write(target, assemble(page));
  }

  write(
    path.join(ROOT, ".preview-report.json"),
    JSON.stringify({ compileErrors: compileErrors.map(({ tsx, ...r }) => r), failures, pages: pages.map((p) => p.route) }, null, 2),
  );

  /* Les sources TSX fautives sont conservées pour le débogage. */
  for (const err of compileErrors) {
    if (err.tsx) write(path.join(WORK, "_debug", `${err.file.replace(/[\\/]/g, "_")}.tsx`), err.tsx);
  }

  console.log(`pages rendues : ${pages.length}`);
  console.log(`erreurs de compilation : ${compileErrors.length}`);
  console.log(`échecs de rendu : ${failures.length}`);
  if (compileErrors.length) {
    console.log("\n--- compilation ---");
    for (const e of compileErrors.slice(0, 20)) console.log(`  ${e.file} [${e.stage}] ${e.message}`);
  }
  if (failures.length) {
    console.log("\n--- rendu ---");
    for (const f of failures.slice(0, 20)) console.log(`  ${f.route} :: ${f.message}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
