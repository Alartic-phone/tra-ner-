#!/bin/sh
set -eu

# Applique les migrations avant de démarrer le serveur. Un volume neuf n'a
# aucune table tant que ceci n'a pas tourné — jouer directement `node
# server.js` dessus servirait des requêtes sur une base vide.
#
# Appel direct du point d'entrée du paquet `prisma` (node_modules/prisma/
# build/index.js) plutôt que `npx prisma` : `node_modules/.bin/prisma` n'est
# pas copié dans l'étage runner de l'image, et `npx` chercherait sinon à le
# télécharger.
echo "[entrypoint] Application des migrations (prisma migrate deploy)…"
if ! node node_modules/prisma/build/index.js migrate deploy; then
  echo "[entrypoint] ÉCHEC des migrations — arrêt. L'application ne démarre jamais sur une base incomplète." >&2
  exit 1
fi
echo "[entrypoint] Migrations à jour. Démarrage."

exec "$@"
