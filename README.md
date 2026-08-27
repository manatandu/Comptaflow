# sycebnl-suite (nom provisoire — à renommer en "Compta Flow" sur GitHub)

Logiciel comptable professionnel spécialisé **OHADA / SYCEBNL** — un ERP comptable plus
large qu'un Sage généraliste, vendu en deux modèles commerciaux : abonnement (coupure
automatique à échéance) et licence perpétuelle (SaaS hébergé ou installable on-premise).

Direction visuelle : dense et professionnelle (barre de titre, barre de menus, ruban à
onglets/groupes, arborescence de navigation, grilles à lignes alternées) — délibérément à
l'opposé du "look SaaS générique", pour signaler un outil sérieux plutôt qu'une app grand
public. Voir le canevas de design validé pour la référence exacte.

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
- Frontend : React + TypeScript + Vite + Tailwind (`client/`)
- Auth : JWT (Passport, bcrypt) — voir `src/modules/auth/`

## Structure

```
prisma/schema.prisma            Tenant, Licence, Compte, Exercice, Ecriture, LigneEcriture
src/modules/tenant/              Création & isolation multi-cabinet
src/modules/licence/              Logique d'accès abonnement / perpétuel SaaS / perpétuel on-premise
src/modules/auth/                 Inscription (tenant+admin+licence+plan de comptes+exercice), connexion, JWT
src/modules/comptes/               Plan de comptes SYCEBNL (CRUD + seed automatique à l'inscription)
src/modules/exercice/              Exercices comptables (création, clôture)
src/modules/comptabilite/          Écritures (partie double), journal, grand livre, balance
src/modules/etats-financiers/      Bilan associatif (⚠ regroupement simplifié — voir le fichier)
client/src/components/chrome/      Ruban, arborescence de navigation, barre de statut (chrome partagé)
client/src/pages/                  Connexion, inscription, tableau de bord, saisie guidée, plan de
                                    comptes, journal/grand livre/balance, états financiers
```

## Modèle de licence (le point le plus structurant du produit)

Trois types, un seul modèle de données (`Licence.type`) :

| Type | Coupure | Statut |
|---|---|---|
| `ABONNEMENT` | Automatique à `dateExpiration` | Phase 1 (par défaut à l'inscription) |
| `PERPETUEL_SAAS` | Jamais (payé une fois, hébergé chez nous) | Phase 2 (flux commercial séparé) |
| `PERPETUEL_ONPREMISE` | Si le heartbeat en ligne dépasse `joursGraceHorsLigne` | Phase 4 |

Voir `src/modules/licence/licence.service.ts` pour la logique d'autorisation.

## Limites connues (Phase 1, honnêtement documentées)

- **Bilan simplifié** : le regroupement classe de compte → poste ACTIF/PASSIF
  (`etats-financiers.service.ts`) est une approximation MVP, pas le tableau de
  correspondance postes/comptes officiel SYCEBNL. À remplacer par le moteur `liasse/`
  du skill `sycebnl` avant toute mise en production réelle.
- **Transaction d'inscription non atomique** : la création tenant+licence+user et le
  seed du plan de comptes ne sont pas dans la même transaction DB (voir le commentaire
  dans `auth.service.ts`).
- **Un seul exercice géré côté frontend** (le premier `OUVERT`) — le multi-exercice
  UI (sélecteur, historique) est prévu en Phase 2/3.
- **Saisie guidée à 4 modèles** (don, cotisation, achat, salaire) câblés sur les 11
  comptes seedés — pas encore un formulaire d'écriture libre pour un comptable qui
  voudrait sortir de ces gabarits (prévu avec le développement du plan de comptes
  personnalisable).

## Roadmap

- ✅ **Phase 0** — fondations : schéma Prisma, multi-tenant, licence, squelette NestJS
- ✅ **Phase 1** — MVP SYCEBNL en SaaS abonnement : auth JWT, plan de comptes, saisie
  guidée, journal, grand livre, balance, bilan associatif (simplifié), frontend dense
  fidèle au canevas de design validé
- **Phase 2** — option licence perpétuelle SaaS, facturation/abonnement, relances,
  bilan conforme au tableau de correspondance officiel SYCEBNL
- **Phase 3** — extension SYSCOHADA (entreprises) : plan de comptes, facturation, immobilisations, trésorerie
- **Phase 4** — version on-premise (packaging, licence anti-piratage, updates manuelles)
- **Phase 5** — paie (barèmes RDC), déclarations fiscales (TVA, IS/IRPP), multi-devises/multi-entités, tableaux de bord

## Démarrage

### Backend

```bash
cp .env.example .env   # renseigner DATABASE_URL (Postgres)
npm install
npm run prisma:migrate
npm run start:dev      # http://localhost:3000
```

### Frontend

```bash
cd client
npm install
npm run dev             # http://localhost:5173 (VITE_API_URL par défaut : http://localhost:3000)
```

Ouvrir `http://localhost:5173/#/inscription` pour créer une première entité — le plan
de comptes SYCEBNL et l'exercice courant sont générés automatiquement.
