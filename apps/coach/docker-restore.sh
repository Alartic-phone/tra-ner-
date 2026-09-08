#!/bin/sh
set -eu

# Restauration depuis une sauvegarde, à lancer avec `docker compose exec app
# ./docker-restore.sh <chemin-dans-le-conteneur>` (voir README, §Sauvegarde
# et restauration). La sauvegarde doit d'abord être copiée dans le conteneur
# avec `docker compose cp`.
#
# Réimplémentation en shell de scripts/restore.ts — même raison que
# docker-backup.sh. Mêmes garanties : contrôle d'intégrité avant de toucher
# à quoi que ce soit, base actuelle mise de côté sous un nom horodaté plutôt
# qu'écrasée.

BACKUP="${1:-}"
if [ -z "$BACKUP" ]; then
  echo "Usage : docker compose exec app ./docker-restore.sh <chemin-dans-le-conteneur>" >&2
  exit 1
fi
if [ ! -f "$BACKUP" ]; then
  echo "Sauvegarde introuvable : $BACKUP" >&2
  exit 1
fi

# `|| true` : un fichier qui n'est pas une base SQLite fait échouer sqlite3
# lui-même (set -e arrêterait le script avant le message ci-dessous) — capté
# ici pour afficher un message clair plutôt que l'erreur brute de sqlite3.
CHECK=$(sqlite3 "$BACKUP" "PRAGMA integrity_check;" 2>&1) || true
if [ "$CHECK" != "ok" ]; then
  echo "La sauvegarde est corrompue ou illisible (integrity_check : $CHECK)." >&2
  exit 1
fi

TARGET="${DATABASE_URL#file:}"
if [ "$TARGET" = "$DATABASE_URL" ]; then
  echo "Restauration SQLite uniquement (DATABASE_URL doit commencer par file:)." >&2
  exit 1
fi
mkdir -p "$(dirname "$TARGET")"

if [ -e "$TARGET" ]; then
  STAMP=$(date -u +%Y-%m-%dT%H-%M-%S)
  ASIDE="${TARGET}.remplacee-${STAMP}"
  mv "$TARGET" "$ASIDE"
  echo "Base actuelle mise de côté : $ASIDE"
fi

cp "$BACKUP" "$TARGET"
echo "Base restaurée depuis $BACKUP"
echo "Redémarrer le service pour qu'il reprenne la nouvelle base : docker compose restart app"
