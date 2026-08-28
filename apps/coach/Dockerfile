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
COPY --from=builder /app/prisma ./prisma
# Sortie autonome : n'embarque que les modules réellement utilisés.
COPY --from=builder --chown=coach:coach /app/.next/standalone ./
COPY --from=builder --chown=coach:coach /app/.next/static ./.next/static
# Le moteur Prisma et le schéma sont nécessaires aux migrations au démarrage.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

RUN mkdir -p /app/data && chown coach:coach /app/data
USER coach
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
