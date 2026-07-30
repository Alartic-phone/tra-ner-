/**
 * Runtime de rendu — transforme l'arbre JSX produit par le compilateur en
 * chaîne HTML. Tout est asynchrone : un composant `.astro` peut faire des
 * `await` dans son frontmatter (`getCollection`, `render`).
 */

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

export const Fragment = Symbol("Fragment");

const NODE = Symbol("node");

const node = (html, slot) => ({ [NODE]: true, html, slot });
const isNode = (v) => v && typeof v === "object" && v[NODE] === true;

/** Marque une chaîne comme déjà sûre (sortie de `set:html`). */
export const raw = (html) => node(String(html));

/* ───────── Contexte de page ───────── */

/**
 * Collecte, pour la page en cours de rendu, les blocs `<style>` / `<script>`
 * des composants — dédupliqués comme le fait Astro quand un composant est
 * instancié plusieurs fois.
 */
let ctx = null;

export function startPage(url) {
  ctx = { url, seen: new Set(), styles: [], scripts: [] };
  return ctx;
}

export function endPage() {
  const done = ctx;
  ctx = null;
  return done;
}

/* ───────── Échappement ───────── */

/* `&` n'est échappé que s'il n'introduit pas déjà une entité : le texte issu
 * du template peut contenir des entités HTML volontaires (`&nbsp;`, `&times;`). */
const escapeText = (s) =>
  String(s)
    .replace(/&(?!#?[a-zA-Z0-9]+;)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const escapeAttr = (s) =>
  String(s)
    .replace(/&(?!#?[a-zA-Z0-9]+;)/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");

/* ───────── class:list ───────── */

function classList(value) {
  const out = [];
  const walk = (v) => {
    if (!v) return;
    if (typeof v === "string") { if (v.trim()) out.push(v.trim()); return; }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v === "object") {
      for (const [k, on] of Object.entries(v)) if (on) out.push(k);
    }
  };
  walk(value);
  return out.join(" ");
}

/* ───────── Rendu ───────── */

async function toHtml(value) {
  if (value === null || value === undefined || value === false || value === true) return "";
  const v = await value;
  if (v === null || v === undefined || v === false || v === true) return "";
  if (isNode(v)) return v.html;
  if (Array.isArray(v)) {
    const parts = await Promise.all(v.map(toHtml));
    return parts.join("");
  }
  return escapeText(v);
}

async function renderChildren(children) {
  const parts = await Promise.all(children.map(toHtml));
  return parts.join("");
}

/** Range les enfants d'un composant par nom de slot. */
async function collectSlots(children) {
  const slots = { default: "" };
  const flat = [];
  const push = async (c) => {
    const v = await c;
    if (Array.isArray(v)) { for (const x of v) await push(x); return; }
    flat.push(v);
  };
  for (const c of children) await push(c);

  for (const child of flat) {
    const name = isNode(child) && child.slot ? child.slot : "default";
    slots[name] = (slots[name] || "") + (await toHtml(child));
  }
  return slots;
}

export async function h(tag, props, ...children) {
  props = props || {};

  if (tag === Fragment) return node(await renderChildren(children));

  /* Composant `.astro` : fonction async recevant l'objet `Astro`. */
  if (typeof tag === "function") {
    const { slot, ...rest } = props;
    const slots = await collectSlots(children);
    const Astro = {
      props: rest,
      slots: {
        ...slots,
        has: (name) => Boolean(slots[name]),
        render: async (name) => slots[name] || "",
      },
      url: new URL(ctx?.url || "/", "https://alartic.fr"),
    };
    const out = await tag(Astro);
    return node(await toHtml(out), slot);
  }

  const name = String(tag);
  const { slot, ...attrs } = props;

  let inner = "";
  if ("set:html" in attrs) {
    inner = String((await attrs["set:html"]) ?? "");
    delete attrs["set:html"];
  } else if ("set:text" in attrs) {
    inner = escapeText((await attrs["set:text"]) ?? "");
    delete attrs["set:text"];
  } else {
    inner = await renderChildren(children);
  }

  const parts = [];
  for (const [key, rawValue] of Object.entries(attrs)) {
    const value = await rawValue;
    if (value === false || value === null || value === undefined) continue;

    let attrName = key;
    let attrValue = value;

    if (key === "class:list") {
      attrName = "class";
      attrValue = classList(value);
      if (!attrValue) continue;
    } else if (key.startsWith("transition:") || key.startsWith("client:") || key.startsWith("is:")) {
      /* Directives Astro sans équivalent dans ce rendu statique. */
      continue;
    }

    if (attrValue === true) { parts.push(` ${attrName}`); continue; }
    parts.push(` ${attrName}="${escapeAttr(attrValue)}"`);
  }

  const open = `<${name}${parts.join("")}`;
  if (VOID_TAGS.has(name.toLowerCase())) return node(`${open} />`, slot);
  return node(`${open}>${inner}</${name}>`, slot);
}

/* ───────── slots ───────── */

export function __slot(Astro, name, fallback) {
  const content = Astro?.slots?.[name];
  if (content) return raw(content);
  return fallback !== undefined ? fallback : raw("");
}

/* ───────── Blocs <style> / <script> ───────── */

/**
 * Les blocs bruts ne sont pas émis sur place : ils sont collectés pour être
 * injectés dans le `<head>` (styles) et en fin de `<body>` (scripts), comme
 * le fait le build Astro — et dédupliqués par composant.
 */
export function __makeBlock(blocks, ownerName) {
  return function __block(index, vars) {
    const block = blocks[index];
    if (!block || !ctx) return raw("");

    const key = `${ownerName}#${index}#${vars ? JSON.stringify(vars) : ""}`;
    if (ctx.seen.has(key)) return raw("");
    ctx.seen.add(key);

    if (block.tag === "style") {
      ctx.styles.push({ owner: ownerName, css: block.body });
    } else {
      ctx.scripts.push({
        owner: ownerName,
        attrs: block.attrs,
        body: block.body,
        vars: vars || null,
      });
    }
    return raw("");
  };
}

export { toHtml, isNode, escapeText, escapeAttr };
