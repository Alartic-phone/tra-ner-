/**
 * Couche contenu — équivalent minimal d'`astro:content` pour les collections
 * Markdown du dépôt : parseur de frontmatter YAML (sous-ensemble réellement
 * utilisé) et rendu Markdown.
 */

import fs from "node:fs";
import path from "node:path";
import { raw } from "./runtime.mjs";

/* ───────── YAML (sous-ensemble) ───────── */

function parseScalar(token) {
  const s = token.trim();
  if (s === "") return "";
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "null" || s === "~") return null;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s
      .slice(1, -1)
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\n/g, "\n");
  }
  return s;
}

/** Lignes utiles (sans commentaires ni lignes vides), avec leur indentation. */
function tokenize(src) {
  return src
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "" && !/^\s*#/.test(line))
    .map((line) => ({
      indent: line.match(/^\s*/)[0].length,
      text: line.trim(),
      rawLine: line,
    }));
}

function parseBlock(lines, start, indent) {
  /* Séquence */
  if (lines[start] && lines[start].text.startsWith("- ")) {
    const items = [];
    let i = start;
    while (i < lines.length && lines[i].indent === indent && lines[i].text.startsWith("- ")) {
      const head = lines[i].text.slice(2).trim();
      /* Élément-mapping : `- key: value` suivi de lignes plus indentées. */
      if (/^[\w.-]+:(\s|$)/.test(head)) {
        const sub = [{ indent: indent + 2, text: head }];
        let j = i + 1;
        while (j < lines.length && lines[j].indent > indent) {
          sub.push(lines[j]);
          j++;
        }
        const [value] = parseBlock(sub, 0, indent + 2);
        items.push(value);
        i = j;
      } else {
        items.push(parseScalar(head));
        i++;
      }
    }
    return [items, i];
  }

  /* Mapping */
  const obj = {};
  let i = start;
  while (i < lines.length && lines[i].indent === indent) {
    const line = lines[i];
    const m = line.text.match(/^([\w.-]+):\s*(.*)$/);
    if (!m) { i++; continue; }
    const [, key, inline] = m;
    if (inline !== "") {
      obj[key] = parseScalar(inline);
      i++;
      continue;
    }
    /* Valeur sur les lignes suivantes (plus indentées, ou séquence au même
     * niveau — YAML autorise `-` aligné sur la clé). */
    let j = i + 1;
    if (j < lines.length && (lines[j].indent > indent
      || (lines[j].indent === indent && lines[j].text.startsWith("- ")))) {
      const childIndent = lines[j].indent;
      const sub = [];
      while (j < lines.length && (lines[j].indent > indent
        || (lines[j].indent === indent && lines[j].text.startsWith("- ")))) {
        sub.push(lines[j]);
        j++;
      }
      const [value] = parseBlock(sub, 0, childIndent);
      obj[key] = value;
      i = j;
    } else {
      obj[key] = null;
      i = j;
    }
  }
  return [obj, i];
}

export function parseYaml(src) {
  const lines = tokenize(src);
  if (lines.length === 0) return {};
  const [value] = parseBlock(lines, 0, lines[0].indent);
  return value;
}

export function parseFrontmatter(src) {
  if (!src.startsWith("---")) return { data: {}, body: src };
  const end = src.indexOf("\n---", 3);
  if (end === -1) return { data: {}, body: src };
  const yaml = src.slice(src.indexOf("\n") + 1, end);
  const body = src.slice(end + 4).replace(/^\r?\n/, "");
  return { data: parseYaml(yaml), body };
}

/* ───────── Markdown ───────── */

const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function inline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

export function renderMarkdown(src) {
  const lines = src.split(/\r?\n/);
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") { i++; continue; }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2].trim())}</h${level}>`);
      i++;
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(line.trim())) { out.push("<hr />"); i++; continue; }

    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s*[-*]\s+/, ""))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s*\d+\.\s+/, ""))}</li>`);
        i++;
      }
      out.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoted = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoted.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      out.push(`<blockquote>${renderMarkdown(quoted.join("\n"))}</blockquote>`);
      continue;
    }

    /* Paragraphe : jusqu'à la prochaine ligne vide ou construction de bloc. */
    const para = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,6}\s|>\s?|\s*[-*]\s+|\s*\d+\.\s+)/.test(lines[i])
    ) {
      para.push(lines[i].trim());
      i++;
    }
    out.push(`<p>${inline(para.join(" "))}</p>`);
  }

  return out.join("\n");
}

/* ───────── Collections ───────── */

const collections = new Map();

export function loadCollections(contentDir) {
  for (const name of fs.readdirSync(contentDir)) {
    const dir = path.join(contentDir, name);
    if (!fs.statSync(dir).isDirectory()) continue;

    const entries = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .map((file) => {
        const { data, body } = parseFrontmatter(fs.readFileSync(path.join(dir, file), "utf8"));
        return {
          id: file.replace(/\.md$/, ""),
          slug: file.replace(/\.md$/, ""),
          collection: name,
          data,
          body,
        };
      });
    collections.set(name, entries);
  }
}

export async function getCollection(name, filter) {
  const entries = collections.get(name) || [];
  return filter ? entries.filter(filter) : entries.slice();
}

export async function getEntry(name, id) {
  const entries = collections.get(name) || [];
  return entries.find((e) => e.id === id);
}

/** Équivalent de `render(entry)` : renvoie un composant `Content`. */
export async function render(entry) {
  const html = renderMarkdown(entry.body || "");
  const Content = async () => raw(html);
  return { Content, headings: [], remarkPluginFrontmatter: entry.data };
}
