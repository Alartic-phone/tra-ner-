/**
 * Tokenizer CSV minimal (séparateur configurable, guillemets RFC4180,
 * guillemet échappé `""`, champs multi-lignes). Pas de dépendance externe :
 * le format est entièrement spécifié par le cahier des charges (13 colonnes
 * fixes, séparateur `;`) et un fichier de quelques dizaines de lignes ne
 * justifie pas d'en ajouter une pour ça.
 */
export function tokenizeCsv(text: string, delimiter = ";"): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let touchedRow = false;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      touchedRow = true;
      i++;
      continue;
    }
    if (c === delimiter) {
      row.push(field);
      field = "";
      touchedRow = true;
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      touchedRow = false;
      i++;
      continue;
    }
    field += c;
    touchedRow = true;
    i++;
  }

  if (touchedRow || field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Ignore les lignes entièrement vides (ligne blanche de mise en forme dans
  // le fichier source) plutôt que de les traiter comme une ligne de données
  // à 1 colonne.
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

export type DetectedEncoding = "utf-8" | "windows-1252";

/**
 * Détecte l'encodage plutôt que de le supposer : UTF-8 strict d'abord (rejette
 * tout octet non valide), repli sur CP1252 (Excel français) sinon — jamais
 * l'inverse, un CP1252 valide n'est presque jamais un UTF-8 valide pour du
 * texte accentué, l'ordre suffit donc à distinguer les deux sans heuristique
 * plus fine.
 */
export function decodeCsvBuffer(buffer: Buffer): { text: string; encoding: DetectedEncoding } {
  try {
    const strict = new TextDecoder("utf-8", { fatal: true });
    return { text: strict.decode(buffer), encoding: "utf-8" };
  } catch {
    const cp1252 = new TextDecoder("windows-1252");
    return { text: cp1252.decode(buffer), encoding: "windows-1252" };
  }
}
