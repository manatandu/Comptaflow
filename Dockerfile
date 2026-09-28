# --- OmegaX · API NestJS (déploiement Cloud Run) --------------------------
# Multi-stage : la première étape compile (dev deps + prisma generate), la
# seconde ne garde que le nécessaire à l'exécution.
#
# Le produit s'appelle OmegaX (audit final F264). Le service Cloud Run garde
# son nom technique `comptaflow-api` : le relais de Firebase Hosting et le
# contrôle de santé du déploiement le désignent, le renommer est un autre
# chantier que cet en-tête.
#
# La version de Node des deux étapes est CELLE DE LA PRODUCTION, et la CI
# l'éprouve sous le même numéro (audit final F194) · chaine-de-livraison.spec.ts
# refuse qu'un workflow du serveur en installe une autre.

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
# process.env.PORT · aucun changement de code nécessaire.
EXPOSE 8080
CMD ["node", "dist/main.js"]
