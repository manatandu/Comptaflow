# --- Compta Flow — API NestJS (déploiement Cloud Run) ---------------------
# Multi-stage : la première étape compile (dev deps + prisma generate), la
# seconde ne garde que le nécessaire à l'exécution.

FROM node:22-slim AS build
WORKDIR /app

# Prisma a besoin d'OpenSSL pour générer son client sur cette image.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npx prisma generate
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev
RUN npx prisma generate

COPY --from=build /app/dist ./dist

# Cloud Run fournit PORT dynamiquement (8080 par défaut) ; main.ts lit déjà
# process.env.PORT — aucun changement de code nécessaire.
EXPOSE 8080
CMD ["node", "dist/main.js"]
