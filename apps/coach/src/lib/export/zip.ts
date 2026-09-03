/**
 * Archive ZIP minimale, méthode STORE (pas de compression) : le format ZIP
 * est simple à écrire correctement sans compression, et les CSV exportés
 * restent petits (dossier perso, pas un historique de dix ans). Évite une
 * dépendance dédiée pour un format qu'on peut écrire soi-même en une
 * cinquantaine de lignes, testées.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 (norme ISO 3309 / ITU-T V.42), utilisé par le format ZIP. */
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export type ZipEntry = { name: string; content: string | Uint8Array };

function dosDateTime(): { date: number; time: number } {
  // Horodatage fixe plutôt que l'heure réelle : deux exports du même
  // contenu produisent alors un ZIP strictement identique (déterminisme).
  return { date: ((2020 - 1980) << 9) | (1 << 5) | 1, time: 0 };
}

function writeUint32LE(value: number): Uint8Array {
  const buf = new Uint8Array(4);
  new DataView(buf.buffer).setUint32(0, value, true);
  return buf;
}
function writeUint16LE(value: number): Uint8Array {
  const buf = new Uint8Array(2);
  new DataView(buf.buffer).setUint16(0, value, true);
  return buf;
}
function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/** Construit un fichier ZIP (méthode STORE) à partir d'entrées nom/contenu. */
export function buildZip(entries: readonly ZipEntry[]): Uint8Array {
  const { date, time } = dosDateTime();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.name);
    const contentBytes =
      typeof entry.content === "string" ? new TextEncoder().encode(entry.content) : entry.content;
    const crc = crc32(contentBytes);
    const size = contentBytes.length;

    const localHeader = concat([
      writeUint32LE(0x04034b50),
      writeUint16LE(20), // version nécessaire
      writeUint16LE(0), // flags
      writeUint16LE(0), // méthode : 0 = STORE
      writeUint16LE(time),
      writeUint16LE(date),
      writeUint32LE(crc),
      writeUint32LE(size), // taille compressée = taille réelle (STORE)
      writeUint32LE(size),
      writeUint16LE(nameBytes.length),
      writeUint16LE(0), // extra field
    ]);
    localParts.push(localHeader, nameBytes, contentBytes);

    const centralHeader = concat([
      writeUint32LE(0x02014b50),
      writeUint16LE(20), // version faite par
      writeUint16LE(20), // version nécessaire
      writeUint16LE(0),
      writeUint16LE(0),
      writeUint16LE(time),
      writeUint16LE(date),
      writeUint32LE(crc),
      writeUint32LE(size),
      writeUint32LE(size),
      writeUint16LE(nameBytes.length),
      writeUint16LE(0), // extra
      writeUint16LE(0), // comment
      writeUint16LE(0), // disque de départ
      writeUint16LE(0), // attributs internes
      writeUint32LE(0), // attributs externes
      writeUint32LE(offset), // offset du header local
    ]);
    centralParts.push(centralHeader, nameBytes);

    offset += localHeader.length + nameBytes.length + contentBytes.length;
  }

  const centralDir = concat(centralParts);
  const localData = concat(localParts);

  const end = concat([
    writeUint32LE(0x06054b50),
    writeUint16LE(0),
    writeUint16LE(0),
    writeUint16LE(entries.length),
    writeUint16LE(entries.length),
    writeUint32LE(centralDir.length),
    writeUint32LE(localData.length),
    writeUint16LE(0),
  ]);

  return concat([localData, centralDir, end]);
}
