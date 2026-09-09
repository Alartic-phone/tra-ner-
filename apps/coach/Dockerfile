# syntax=docker/dockerfile:1

# ---- Dépendances -----------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ---- Build -----------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Le client Prisma est généré avant le build : les routes serveur l'importent.
RUN npx prisma generate && npm run build

# ---- CLI Prisma (migrations au démarrage) -----------------------------------
# Installation isolée, dans son propre node_modules : `node_modules/prisma`
# du dépôt principal (étage `deps`) ne suffit pas à lui seul pour `migrate
# deploy` — `@prisma/config` dépend transitivement de packages (`effect`,
# `fast-check`, `pure-rand`…) qui vivent hors de `@prisma/`, jamais copiés par
# une sélection manuelle de dossiers, et découverts au premier redéploiement
# après une mise à jour de Prisma (`Cannot find module 'effect'`). Une
# installation neuve, ciblée sur le seul paquet `prisma`, résout sa fermeture
# complète sans avoir à l'énumérer à la main.
FROM node:22-alpine AS prisma-cli
WORKDIR /cli
COPY package-lock.json ./
RUN node -e "process.stdout.write(require('./package-lock.json').packages['node_modules/prisma'].version)" > .prisma-version && \
    npm install --omit=dev --no-save "prisma@$(cat .prisma-version)" && \
    rm .prisma-version package-lock.json

# ---- Exécution -------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV TZ=Europe/Paris
# sqlite3 est nécessaire aux commandes de sauvegarde et de restauration.
RUN apk add --no-cache sqlite tzdata && \
    addgroup -S coach && adduser -S coach -G coach

COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
# Sortie autonome : n'embarque que les modules réellement utilisés.
COPY --from=builder --chown=coach:coach /app/.next/standalone ./
COPY --from=builder --chown=coach:coach /app/.next/static ./.next/static
# CLI Prisma et sa fermeture complète de dépendances, nécessaires aux
# migrations au démarrage (voir l'étage prisma-cli ci-dessus).
COPY --from=prisma-cli --chown=coach:coach /cli/node_modules ./node_modules

COPY docker-entrypoint.sh docker-backup.sh docker-restore.sh /app/
RUN chmod +x /app/docker-entrypoint.sh /app/docker-backup.sh /app/docker-restore.sh && \
    mkdir -p /app/data && chown coach:coach /app/data
USER coach
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

# L'entrypoint applique les migrations avant de lancer la commande (voir
# docker-entrypoint.sh) — un échec de migration arrête le conteneur au lieu
# de démarrer sur une base incomplète.
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "server.js"]
