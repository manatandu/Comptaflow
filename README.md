# sycebnl-suite (nom provisoire)

Logiciel comptable professionnel spécialisé **OHADA / SYCEBNL** — un ERP comptable plus
large qu'un Sage généraliste, vendu en deux modèles commerciaux : abonnement (coupure
automatique à échéance) et licence perpétuelle (SaaS hébergé ou installable on-premise).

Projet séparé de [`compta-edu`](https://github.com/manatandu/compta-edu), qui reste
l'outil pédagogique OHADA/AUDCIF pour étudiants.

## Pourquoi un moteur relationnel (Postgres) et pas Firestore

Un grand livre légal exige des écritures en partie double équilibrées, des exercices
verrouillables à la clôture, et des requêtes de reporting transactionnelles (balance,
grand livre filtré, états financiers) — des garanties ACID et des jointures que le
NoSQL documentaire gère mal. Firestore reste très bien adapté à `compta-edu` (contenu
pédagogique), mais pas ici.

## Stack

- Backend : Node.js + NestJS + TypeScript + Prisma + PostgreSQL
- Frontend : à définir en Phase 1 (probable réutilisation React/TS/Vite/Tailwind, cohérent avec `compta-edu`)
- Auth : JWT (squelette posé, à compléter Phase 1)

## Structure

```
prisma/schema.prisma          Tenant, Licence, Compte, Exercice, Ecriture, LigneEcriture
src/modules/tenant/            Création & isolation multi-cabinet
src/modules/licence/           Logique d'accès abonnement / perpétuel SaaS / perpétuel on-premise
src/modules/auth/              Squelette JWT (à compléter)
src/modules/comptabilite/      Moteur d'écritures en partie double (équilibre + exercice clôturé)
```

## Modèle de licence (le point le plus structurant du produit)

Trois types, un seul modèle de données (`Licence.type`) :

| Type | Coupure | Statut |
|---|---|---|
| `ABONNEMENT` | Automatique à `dateExpiration` | Phase 2 |
| `PERPETUEL_SAAS` | Jamais (payé une fois, hébergé chez nous) | Phase 2 |
| `PERPETUEL_ONPREMISE` | Si le heartbeat en ligne dépasse `joursGraceHorsLigne` | Phase 4 |

Voir `src/modules/licence/licence.service.ts` pour la logique d'autorisation.

## Roadmap

- **Phase 0 (en cours)** — fondations : schéma Prisma, multi-tenant, licence, squelette NestJS
- **Phase 1** — MVP SYCEBNL en SaaS abonnement uniquement : plan de comptes, journal, grand
  livre, balance, états financiers association/projet de développement, Système Minimal de
  Trésorerie, opérations spécifiques (fonds affectés/reportés, dons, cotisations)
- **Phase 2** — option licence perpétuelle SaaS, facturation/abonnement, relances
- **Phase 3** — extension SYSCOHADA (entreprises) : plan de comptes, facturation, immobilisations, trésorerie
- **Phase 4** — version on-premise (packaging, licence anti-piratage, updates manuelles)
- **Phase 5** — paie (barèmes RDC), déclarations fiscales (TVA, IS/IRPP), multi-devises/multi-entités, tableaux de bord

## Démarrage (une fois Postgres disponible)

```bash
cp .env.example .env   # renseigner DATABASE_URL
npm install
npm run prisma:migrate
npm run start:dev
```
