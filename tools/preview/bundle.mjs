/**
 * Empaquetage mono-fichier.
 *
 * Regroupe `dist-preview/` en une seule page HTML autonome : aucune requête
 * réseau, images en data-URI, navigation gérée par un routeur client qui
 * rejoue les scripts de page — ce que fait le `ClientRouter` d'Astro sur le
 * site réel.
 *
 * Le contenu est compressé (gzip + base64) et décompressé au chargement via
 * `DecompressionStream`.
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("/opt/node22/lib/node_modules/typescript/lib/typescript.js");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const DIST = path.join(ROOT, "dist-preview");
const WEB = path.join(ROOT, "apps/web");
const OUT = path.join(ROOT, "dist-preview-bundle.html");

/* ───────── Assets en data-URI ───────── */

const MIME = { ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };

function collectAssets() {
  const map = new Map();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      const ext = path.extname(entry.name).toLowerCase();
      if (!MIME[ext]) continue;
      const url = "/" + path.relative(DIST, full).replace(/\\/g, "/");
      map.set(url, `data:${MIME[ext]};base64,${fs.readFileSync(full).toString("base64")}`);
    }
  };
  walk(DIST);
  return map;
}

/* Les assets ne sont PAS injectés dans chaque page : une image de 80 Ko
 * répétée sur 38 pages dépasse la fenêtre de déduplication de gzip et fait
 * exploser le bundle. Ils voyagent une seule fois dans une table, substituée
 * à l'affichage par le shell. */

/* ───────── Découpe d'une page ───────── */

function splitPage(html) {
  const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [, "ALARTIC"])[1];

  const styles = [];
  const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/g;
  let m;
  while ((m = styleRe.exec(html)) !== null) styles.push(m[1]);

  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/);
  let body = bodyMatch ? bodyMatch[1] : html;

  const scripts = [];
  body = body.replace(/<script([^>]*)>([\s\S]*?)<\/script>/g, (_all, attrs, code) => {
    const src = (attrs.match(/src=["']([^"']+)["']/) || [])[1];
    if (src) {
      /* `/scripts/animations.js` est fourni par le registre du bundle. */
      const name = path.basename(src, ".js");
      scripts.push({ module: name });
    } else if (code.trim()) {
      scripts.push({ code });
    }
    return "";
  });

  return { title, styles, body, scripts };
}

/* ───────── Modules partagés ───────── */

/**
 * Les modules ES deviennent des modules CommonJS : le routeur les exécute via
 * des balises `<script>` injectées (et non `eval`), avec un `require` maison.
 */
function toCommonJs(source) {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  });
  return outputText;
}

function normalizeRequires(code) {
  return code.replace(/require\((["'])([^"']+)\1\)/g, (_m, q, spec) => {
    const name = path.basename(spec).replace(/\.(js|ts)$/, "");
    return `require(${q}${name}${q})`;
  });
}

function buildModules() {
  const modules = {};
  const sources = {
    cart: fs.readFileSync(path.join(WEB, "src/scripts/cart.ts"), "utf8"),
    dialogs: fs.readFileSync(path.join(WEB, "src/scripts/dialogs.ts"), "utf8"),
    animations: fs.readFileSync(path.join(HERE, "animations-preview.js"), "utf8"),
  };
  for (const [name, src] of Object.entries(sources)) {
    modules[name] = normalizeRequires(toCommonJs(src));
  }
  return modules;
}

/* ───────── Assemblage ───────── */

function routeOf(file) {
  const rel = path.relative(DIST, file).replace(/\\/g, "/");
  const route = "/" + rel.replace(/index\.html$/, "").replace(/\/$/, "");
  return route === "/" ? "/" : route;
}

function main() {
  const assets = collectAssets();

  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "index.html") files.push(full);
    }
  };
  walk(DIST);

  /* Styles et scripts de composants se répètent d'une page à l'autre (en-tête,
   * pied de page, boutons…). gzip ne les déduplique pas au-delà de sa fenêtre
   * de 32 Ko : on les met en table et les pages n'en gardent que l'index. */
  const styleBlocks = [];
  const scriptBlocks = [];
  const indexIn = (table, value) => {
    const found = table.indexOf(value);
    return found === -1 ? table.push(value) - 1 : found;
  };

  const routes = {};
  for (const file of files) {
    const page = splitPage(fs.readFileSync(file, "utf8"));
    routes[routeOf(file)] = {
      title: page.title,
      body: page.body,
      styles: page.styles.map((css) => indexIn(styleBlocks, css)),
      /* Les scripts de page sont transpilés en CommonJS pour être rejoués. */
      scripts: page.scripts.map((s) =>
        s.module ? { module: s.module } : indexIn(scriptBlocks, normalizeRequires(toCommonJs(s.code))),
      ),
    };
  }

  const sharedCss =
    fs.readFileSync(path.join(DIST, "styles/tokens.css"), "utf8") +
    "\n" +
    fs
      .readFileSync(path.join(DIST, "styles/global.css"), "utf8")
      .replace(/@import\s+"\.\/tokens\.css";\s*/g, "");

  const payload = {
    routes,
    styleBlocks,
    scriptBlocks,
    modules: buildModules(),
    sharedCss,
    assets: Object.fromEntries(assets),
  };

  const packed = zlib.gzipSync(Buffer.from(JSON.stringify(payload), "utf8"), { level: 9 }).toString("base64");

  const shell = fs
    .readFileSync(path.join(HERE, "shell.html"), "utf8")
    .replace("__PAYLOAD__", packed);

  fs.writeFileSync(OUT, shell);

  const kb = (n) => `${(n / 1024).toFixed(0)} Ko`;
  console.log(`routes empaquetées : ${Object.keys(routes).length}`);
  console.log(`taille du bundle   : ${kb(fs.statSync(OUT).size)} (payload compressé ${kb(packed.length)})`);
  console.log(`sortie             : ${path.relative(ROOT, OUT)}`);
}

main();
