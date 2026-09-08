#!/bin/sh
set -eu

# Sauvegarde de la base, à lancer avec `docker compose exec app
# ./docker-backup.sh` (voir README, §Sauvegarde et restauration).
#
# Réimplémentation en shell de scripts/backup.ts plutôt que copie de ce
# script + tsx dans l'image : sqlite3 est déjà installé dans cet étage (pour
# cette raison précise, cf. Dockerfile), tsx ne l'est pas et n'a aucun autre
# usage à l'exécution — l'ajouter alourdirait l'image pour une seule
# commande. Mêmes garanties que la version TypeScript : VACUUM INTO (copie
# cohérente même pendant une écriture concurrente) et refus d'écraser une
# destination existante.

SOURCE="${DATABASE_URL#file:}"
if [ "$SOURCE" = "$DATABASE_URL" ]; then
  echo "Sauvegarde SQLite uniquement (DATABASE_URL doit commencer par file:)." >&2
  exit 1
fi
if [ ! -f "$SOURCE" ]; then
  echo "Base introuvable : $SOURCE" >&2
  exit 1
fi

STAMP=$(date -u +%Y-%m-%dT%H-%M-%S)
DEST="${1:-/app/data/backups/coach-${STAMP}.db}"
mkdir -p "$(dirname "$DEST")"

if [ -e "$DEST" ]; then
  echo "Le fichier de destination existe déjà : $DEST" >&2
  exit 1
fi

sqlite3 "$SOURCE" "VACUUM INTO '$(printf '%s' "$DEST" | sed "s/'/''/g")';"

SIZE_KB=$(du -k "$DEST" | cut -f1)
echo "Sauvegarde écrite : $DEST (${SIZE_KB} Ko)"
echo "Pour la sortir du volume : docker compose cp app:${DEST} ./$(basename "$DEST")"
