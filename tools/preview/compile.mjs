/**
 * Compilateur `.astro` → module TSX.
 *
 * Sous-ensemble d'Astro couvrant ce dépôt : frontmatter TS, expressions `{}`,
 * composants importés, slots (dont nommés), `class:list`, `define:vars`,
 * blocs `<style>` / `<script>`.
 *
 * La sortie est du TSX transpilé par `typescript` avec la factory `h` du
 * runtime — c'est le parseur TS qui gère le JSX imbriqué dans les expressions
 * (`items.map((i) => <li>{i}</li>)`), ce qui évite d'écrire un parseur maison.
 */

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

/* ───────── Découpe frontmatter / template ───────── */

function splitFrontmatter(src) {
  if (!src.startsWith("---")) return { frontmatter: "", template: src };
  const end = src.indexOf("\n---", 3);
  if (end === -1) return { frontmatter: "", template: src };
  const frontmatter = src.slice(src.indexOf("\n") + 1, end);
  const rest = src.slice(end + 4);
  return { frontmatter, template: rest.replace(/^\r?\n/, "") };
}

/**
 * Scanner JS conscient des chaînes / commentaires — sert à repérer les bornes
 * d'un bloc `export function ...` sans se faire piéger par une accolade dans
 * une chaîne de caractères.
 */
function matchBraces(src, openIdx) {
  let depth = 0;
  let i = openIdx;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i++;
      while (i < src.length) {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === quote) break;
        i++;
      }
    } else if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
    } else if (c === "/" && src[i + 1] === "*") {
      const close = src.indexOf("*/", i + 2);
      i = close === -1 ? src.length : close + 1;
    } else if (c === "{") {
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

/**
 * Sépare le frontmatter en trois : imports (hoistés en tête de module),
 * exports de fonctions (`getStaticPaths`, hoistés aussi car un `export` ne
 * peut pas vivre dans une fonction) et le reste (corps du render).
 */
function partitionFrontmatter(frontmatter) {
  const imports = [];
  const exports = [];
  let body = frontmatter;

  /* Les `export function` / `export async function` deviennent des exports de module. */
  const exportRe = /^export\s+(?:async\s+)?function\s+\w+\s*\(/gm;
  let m;
  const cuts = [];
  while ((m = exportRe.exec(body)) !== null) {
    const openIdx = body.indexOf("{", m.index + m[0].length - 1);
    if (openIdx === -1) continue;
    const closeIdx = matchBraces(body, openIdx);
    if (closeIdx === -1) continue;
    cuts.push([m.index, closeIdx + 1]);
  }
  for (let i = cuts.length - 1; i >= 0; i--) {
    const [start, end] = cuts[i];
    exports.unshift(body.slice(start, end));
    body = body.slice(0, start) + body.slice(end);
  }

  /* Les imports montent en tête de module (un import par ligne dans ce dépôt). */
  const importRe = /^[ \t]*import\s+[^;\n]*?(?:from\s*["'][^"']+["'])?\s*;?[ \t]*$/gm;
  body = body.replace(importRe, (line) => {
    if (!/^\s*import\b/.test(line)) return line;
    imports.push(line.trim());
    return "";
  });

  return { imports, exports, body };
}

/* ───────── Extraction des blocs bruts (style / script) ───────── */

/**
 * `<style>` et `<script>` contiennent du CSS/JS que le parseur JSX ne doit
 * jamais voir. On les remplace par un marqueur `{__block(n, vars)}`.
 */
function extractRawBlocks(template, blocks) {
  const re = /<(style|script)((?:[^>"']|"[^"]*"|'[^']*'|\{(?:[^{}]|\{[^{}]*\})*\})*)>([\s\S]*?)<\/\1\s*>/g;
  return template.replace(re, (_all, tag, attrs, body) => {
    const idx = blocks.length;
    /* `define:vars={{ A, B }}` injecte des constantes JS en tête de script. */
    const varsMatch = attrs.match(/define:vars\s*=\s*\{([\s\S]*)\}\s*$/)
      || attrs.match(/define:vars\s*=\s*\{([\s\S]*?)\}(?=\s|$)/);
    let varsExpr = "undefined";
    let cleanAttrs = attrs;
    if (varsMatch) {
      varsExpr = varsMatch[1].trim();
      cleanAttrs = attrs.replace(/define:vars\s*=\s*\{[\s\S]*?\}\s*(?=\s|$)/, " ");
    }
    blocks.push({ tag, attrs: cleanAttrs.trim(), body });
    return `{__block(${idx}, ${varsExpr})}`;
  });
}

/* ───────── Normalisation HTML → JSX ───────── */

/**
 * Scanner récursif à deux modes.
 *
 * Un template Astro alterne entre du JSX (balises, texte) et du JS
 * (expressions `{}`), et les deux s'imbriquent : `{list.map((x) => <li>…</li>)}`.
 * Un simple appariement d'accolades ne suffit pas — une apostrophe de texte
 * français (« l'accueil ») serait prise pour une chaîne JS. On suit donc
 * explicitement le mode courant.
 *
 * Corrections appliquées au passage :
 *  - fermeture des éléments void (`<meta>` → `<meta />`)
 *  - échappement des `{`, `}` et `<` isolés dans le texte
 *  - préservation des espaces inter-nœuds (JSX les supprime, HTML les réduit)
 */
class TemplateScanner {
  constructor(src) {
    this.src = src;
    this.i = 0;
    this.out = [];
  }

  emit(text) {
    this.out.push(text);
  }

  /** Enfants JSX jusqu'à la fin de l'entrée ou la balise fermante attendue. */
  parseChildren(closeTag) {
    const { src } = this;
    let textStart = this.i;

    const flush = (end) => {
      const text = src.slice(textStart, end);
      if (!text) return;
      if (/^\s+$/.test(text)) {
        /* Espace significatif : JSX jette les blancs contenant un saut de
         * ligne, HTML les réduit à une espace — on la rétablit. */
        this.emit(text.includes("\n") ? '{" "}\n' : text);
        return;
      }
      /* Même règle aux extrémités d'un nœud texte : « …acceptez nos\n<a> »
       * doit garder l'espace avant le lien. */
      const leading = /^\s*\n\s*/.test(text) ? '{" "}' : "";
      const trailing = /\s*\n\s*$/.test(text) ? '{" "}' : "";
      this.emit(
        leading +
          text
            .replace(/[{}]/g, (c) => `{"${c}"}`)
            .replace(/<(?![a-zA-Z/!])/g, '{"<"}') +
          trailing,
      );
    };

    while (this.i < src.length) {
      const c = src[this.i];

      if (src.startsWith("</>", this.i)) {
        flush(this.i);
        this.i += 3;
        this.emit("</>");
        if (closeTag === "") return;
        textStart = this.i;
        continue;
      }

      if (c === "<" && src.startsWith("</", this.i)) {
        const name = (src.slice(this.i + 2).match(/^\s*([A-Za-z][\w.-]*)/) || [])[1];
        if (closeTag && name && name === closeTag) {
          flush(this.i);
          const end = src.indexOf(">", this.i);
          this.i = end === -1 ? src.length : end + 1;
          this.emit(`</${name}>`);
          return;
        }
        /* Balise fermante orpheline : on la saute pour ne pas casser l'arbre. */
        flush(this.i);
        const end = src.indexOf(">", this.i);
        this.i = end === -1 ? src.length : end + 1;
        textStart = this.i;
        continue;
      }

      if (c === "<" && /[a-zA-Z]/.test(src[this.i + 1] || "")) {
        flush(this.i);
        this.parseElement();
        textStart = this.i;
        continue;
      }

      if (c === "{") {
        flush(this.i);
        this.parseExpression();
        textStart = this.i;
        continue;
      }

      this.i++;
    }
    flush(this.i);
  }

  /** Un élément complet : balise ouvrante, enfants, balise fermante. */
  parseElement() {
    const { src } = this;
    const name = (src.slice(this.i + 1).match(/^([A-Za-z][\w.-]*)/) || [])[1];
    if (!name) { this.i++; this.emit("<"); return; }

    this.i += 1 + name.length;
    this.emit(`<${name}`);

    const selfClosed = this.parseAttributes();
    const isHtmlTag = name === name.toLowerCase();
    const isVoid = isHtmlTag && VOID_TAGS.has(name);

    if (selfClosed) { this.emit(" />"); return; }
    if (isVoid) { this.emit(" />"); return; }

    this.emit(">");
    this.parseChildren(name);
  }

  /**
   * Attributs jusqu'à `>` ou `/>`. Renvoie `true` si la balise est
   * auto-fermante. Les valeurs `{...}` repartent en mode JS.
   */
  parseAttributes() {
    const { src } = this;
    let plain = this.i;

    const flushPlain = (end) => {
      if (end > plain) this.emit(src.slice(plain, end));
    };

    while (this.i < src.length) {
      const c = src[this.i];

      if (c === '"' || c === "'") {
        const quote = c;
        this.i++;
        while (this.i < src.length && src[this.i] !== quote) this.i++;
        this.i++;
        continue;
      }

      if (c === "{") {
        flushPlain(this.i);
        this.parseExpression();
        plain = this.i;
        continue;
      }

      if (c === "/" && src[this.i + 1] === ">") {
        flushPlain(this.i);
        this.i += 2;
        return true;
      }

      if (c === ">") {
        flushPlain(this.i);
        this.i += 1;
        return false;
      }

      this.i++;
    }
    flushPlain(this.i);
    return false;
  }

  /**
   * Expression `{...}` en mode JS : chaînes, gabarits et commentaires sont
   * traversés sans interprétation, et tout JSX rencontré repasse en mode JSX.
   */
  parseExpression() {
    const { src } = this;
    this.emit("{");
    this.i++; /* `{` */

    let depth = 1;
    let plain = this.i;
    let lastToken = "";

    const flushPlain = (end) => {
      if (end > plain) {
        const chunk = src.slice(plain, end);
        this.emit(chunk);
        const trimmed = chunk.trimEnd();
        if (trimmed) lastToken = trimmed.slice(-2);
      }
    };

    while (this.i < src.length) {
      const c = src[this.i];

      if (c === '"' || c === "'" || c === "`") {
        const quote = c;
        this.i++;
        while (this.i < src.length) {
          if (src[this.i] === "\\") { this.i += 2; continue; }
          if (src[this.i] === quote) break;
          /* Interpolation `${...}` d'un gabarit : peut contenir des accolades. */
          if (quote === "`" && src[this.i] === "$" && src[this.i + 1] === "{") {
            let d = 1;
            this.i += 2;
            while (this.i < src.length && d > 0) {
              if (src[this.i] === "{") d++;
              else if (src[this.i] === "}") d--;
              this.i++;
            }
            continue;
          }
          this.i++;
        }
        this.i++;
        lastToken = "x";
        continue;
      }

      if (c === "/" && src[this.i + 1] === "/") {
        while (this.i < src.length && src[this.i] !== "\n") this.i++;
        continue;
      }

      if (c === "/" && src[this.i + 1] === "*") {
        const close = src.indexOf("*/", this.i + 2);
        this.i = close === -1 ? src.length : close + 2;
        continue;
      }

      if (c === "{") { depth++; this.i++; lastToken = "{"; continue; }

      if (c === "}") {
        depth--;
        if (depth === 0) {
          flushPlain(this.i);
          this.i++;
          this.emit("}");
          return;
        }
        this.i++;
        lastToken = "}";
        continue;
      }

      /* Début de JSX imbriqué : `(`, `=>`, `&&`, `?`, `:`, `,`… le précèdent.
       * Sans ce test, `i < arr.length` serait pris pour une balise. */
      if (c === "<" && /[A-Za-z>]/.test(src[this.i + 1] || "")) {
        const before = src.slice(plain, this.i).trimEnd();
        const prev = (before || lastToken).slice(-2).trim();
        const jsxPosition = prev === "" || /[([{,=>&|?:;!+]$/.test(prev) || /\breturn$/.test(before);
        if (jsxPosition) {
          flushPlain(this.i);
          if (src[this.i + 1] === ">") {
            /* Fragment `<>` */
            this.i += 2;
            this.emit("<>");
            this.parseChildren("");
          } else {
            this.parseElement();
          }
          plain = this.i;
          lastToken = "x";
          continue;
        }
      }

      this.i++;
    }
    flushPlain(this.i);
    this.emit("}");
  }
}

function normalize(template) {
  const scanner = new TemplateScanner(template);
  scanner.parseChildren(null);
  return scanner.out.join("");
}

/** Retire commentaires HTML et doctype avant toute autre analyse. */
function stripHtmlNoise(template) {
  return template
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!doctype[^>]*>/gi, "");
}

/* ───────── slots ───────── */

/**
 * `<slot />` est résolu à la compilation (`{__slot(Astro, "default")}`) plutôt
 * qu'au rendu : pas de pile de contexte à maintenir à travers les `await`.
 */
function replaceSlots(template) {
  return template
    .replace(/<slot\s+name=["']([^"']+)["']\s*\/>/g, (_m, name) => `{__slot(Astro, ${JSON.stringify(name)})}`)
    .replace(/<slot\s*\/>/g, `{__slot(Astro, "default")}`)
    .replace(/<slot\s+name=["']([^"']+)["']\s*>([\s\S]*?)<\/slot\s*>/g,
      (_m, name, fallback) => `{__slot(Astro, ${JSON.stringify(name)}, <>${fallback}</>)}`)
    .replace(/<slot\s*>([\s\S]*?)<\/slot\s*>/g,
      (_m, fallback) => `{__slot(Astro, "default", <>${fallback}</>)}`);
}

/* ───────── Génération du module ───────── */

export function compileAstro(src, { componentName = "Component" } = {}) {
  const { frontmatter, template } = splitFrontmatter(src);
  const { imports, exports, body } = partitionFrontmatter(frontmatter);

  const blocks = [];
  const withoutRaw = extractRawBlocks(stripHtmlNoise(template), blocks);
  const jsx = normalize(replaceSlots(withoutRaw));

  const blockTable = JSON.stringify(blocks);

  return [
    `import { h, Fragment, __makeBlock, __slot } from "@runtime";`,
    ...imports,
    ``,
    `const __BLOCKS = ${blockTable};`,
    `const __block = __makeBlock(__BLOCKS, ${JSON.stringify(componentName)});`,
    ``,
    ...exports,
    ``,
    `export default async function ${sanitize(componentName)}(Astro: any) {`,
    body,
    `  return (<>${jsx}</>);`,
    `}`,
  ].join("\n");
}

function sanitize(name) {
  const clean = name.replace(/[^A-Za-z0-9_]/g, "_");
  return /^[0-9]/.test(clean) ? `_${clean}` : clean;
}

export { splitFrontmatter, normalize };
