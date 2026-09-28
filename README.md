# OmegaX

Logiciel de comptabilité SYCEBNL et SYSCOHADA pour les ASBL, ONG et
entreprises de RDC. Propriété du cabinet **VMG Consulting**, qui l'exploite et
le vend.

> **Réécrit le 2026-09-28 (audit final F204).** Ce fichier décrivait jusque-là
> le prototype de phase 1 · nom provisoire, licence sur site par vérification
> périodique en ligne, inscription ouverte et non atomique, feuille de route
> close depuis. Rien de cela ne décrit plus le logiciel. Les règles du dépôt
> sont dans [`CLAUDE.md`](CLAUDE.md), qui prime sur ce fichier.

## Pile

- **Serveur** (racine) · NestJS 10, Prisma 5, PostgreSQL (Neon), Jest,
  ExcelJS, passport-jwt, bcryptjs. Node 22, image du `Dockerfile`.
- **Client** (`client/`) · React 18, Vite, TypeScript, Tailwind,
  react-router-dom 6 en `HashRouter`.
- **Tests navigateur** (`e2e/`) · Playwright.

```
src/modules/     modules métier
src/common/      gardes, décorateurs, Prisma, journal d'audit, /health
prisma/          schema.prisma et migrations SQL écrites à la main
client/src/      interface (pages/, components/chrome/, lib/)
e2e/             tests navigateur
installation/    paquet d'installation sur site (Windows)
docs/            plans, audits, guides pilote, notes de droit
```

## Commandes

Avant chaque commit, tout ce bloc passe, des deux côtés (`CLAUDE.md`, § 3).

```bash
# Serveur (depuis la racine)
npx tsc --noEmit          # typage
npx jest                  # tous les tests passent, sans exception
npm run build             # nest build
npx prisma generate       # après toute modification du schéma

# Client (depuis client/)
npx tsc --noEmit
npm test                  # vitest run · vite et vitest en devDependencies exactes, lockfile
npm run build             # tsc -b && vite build
npm run dev               # port 5173
```

Pour faire tourner le serveur en local :

```bash
cp .env.example .env      # renseigner DATABASE_URL (base locale) et JWT_SECRET
npm install               # lance aussi prisma generate
npm run prisma:migrate    # prisma migrate dev, sur une base locale seulement
npm run start:dev         # port 3000, ou celui de PORT
```

La base de production n'est jamais migrée à la main · le déploiement applique
`prisma migrate deploy` lui-même (`CLAUDE.md`, § 5). Sans `VITE_API_URL`, le
client appelle `http://localhost:3000`. L'inscription est fermée par défaut ·
pour créer un premier dossier en local, poser `INSCRIPTION_PUBLIQUE=true`
(`CLAUDE.md`, § 8). Les tests navigateur se lancent comme le décrit le § 10
de `CLAUDE.md`.

## Déploiement

Le travail va sur `main`, et c'est cette branche qui déclenche les
déploiements (Cloud Run pour le serveur, Firebase Hosting pour le client).
Pousser n'est pas déployer · le résultat du workflow se relit après chaque
poussée qui touche `src/**` ou `prisma/**` (`CLAUDE.md`, § 5).

## Renvois

- [`CLAUDE.md`](CLAUDE.md) · règlement du dépôt, à lire avant toute
  modification.
- [`docs/deploiement.md`](docs/deploiement.md) · Firebase Hosting et Cloud Run.
- [`docs/connexions-et-plafonds.md`](docs/connexions-et-plafonds.md) · les
  deux chaînes de connexion et les plafonds du service.
- [`docs/sauvegardes-et-restauration.md`](docs/sauvegardes-et-restauration.md)
  · sauvegarde nocturne et restauration de contrôle.
- [`docs/installation-sur-site.md`](docs/installation-sur-site.md) ·
  installation sur un poste Windows du client, licence en fichier signé.
- [`docs/capacite-mesuree.md`](docs/capacite-mesuree.md) · volumes mesurés et
  plafonds de fenêtre.
- [`docs/restitution-du-dossier.md`](docs/restitution-du-dossier.md) ·
  l'archive de restitution du dossier.
- [`docs/charte-omegax.md`](docs/charte-omegax.md) · charte graphique.
- [`docs/pilote/guide-siege.md`](docs/pilote/guide-siege.md) et
  [`docs/pilote/guide-tresorier-cellule.md`](docs/pilote/guide-tresorier-cellule.md)
  · guides d'utilisation du module groupe.
- [`docs/audit-final-1-0.md`](docs/audit-final-1-0.md) · liste fermée de la
  1.0.
