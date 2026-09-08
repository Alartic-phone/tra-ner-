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

# ---- Exécution -------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV TZ=Europe/Paris
# sqlite3 est nécessaire aux commandes de sauvegarde et de restauration.
RUN apk add --no-cache sqlite tzdata && \
    addgroup -S coach && adduser -S coach -G coach

COPY --from=builder /app/public ./public
# Sortie autonome : n'embarque que les modules réellement utilisés.
COPY --from=builder --chown=coach:coach /app/.next/standalone ./
COPY --from=builder --chown=coach:coach /app/.next/static ./.next/static
# `prisma` (CLI, devDependency) tire depuis peu `@prisma/config`, dont les
# dépendances transitives (effect, c12…) ne sont pas tracées par la sortie
# standalone de Next. Réinstallation isolée plutôt qu'une copie sélective de
# node_modules — fragile face aux futures montées de version de Prisma — et
# épinglée sur la version verrouillée par package-lock.json pour rester
# strictement compatible avec le client généré ci-dessous. Faite avant la
# copie du schéma, pour que le postinstall de @prisma/client ne trouve rien
# à régénérer.
COPY --from=builder /app/package-lock.json ./package-lock.json
RUN PRISMA_VERSION="$(node -e "console.log(require('./package-lock.json').packages['node_modules/prisma'].version)")" && \
    npm install --omit=dev --no-audit --no-fund --no-save \
      "prisma@$PRISMA_VERSION" "@prisma/client@$PRISMA_VERSION" && \
    rm package-lock.json
# Le schéma est nécessaire aux migrations au démarrage ; le client généré
# (.prisma/client) est celui produit par `prisma generate` dans l'étage
# builder, à partir du schéma réel de l'app — pas un client générique.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

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
