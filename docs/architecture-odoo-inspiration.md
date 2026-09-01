# Odoo : ce qu'on en retient pour construire l'ERP OmegaX

Aucun manuel Odoo n'a été trouvé dans le Drive de l'utilisateur (recherche
faite, résultat vide) : ce document synthétise la documentation officielle
Odoo (`odoo.com/documentation`, versions 14 à 19, inchangée sur les points
structurels), des recherches croisées (Packt, O'Reilly, Medium), tenue à
distance des pages elles-mêmes (bloquées par le filtre réseau de la session,
uniquement les résumés de recherche ont pu être lus). À vérifier sur la
documentation officielle avant toute citation engageante.

**Portée de ce document** : pas un cours sur Odoo. Uniquement ce qui éclaire
une décision de conception pour OmegaX, avec à chaque fois le rapprochement
ou l'écart avec ce qui existe déjà ici.

## 1. Architecture générale

Trois couches : présentation (HTML5/JS/CSS), logique métier (Python pur),
données (PostgreSQL, exclusivement). Modèle MVC.

**Rapprochement OmegaX** : même schéma trois couches (React/TS, NestJS,
Postgres via Prisma). Rien à changer ici · c'est déjà l'architecture standard
que tout ERP web moderne adopte, Odoo y compris.

## 2. Le module (« addon ») · l'unité de construction

Un module Odoo est un dossier avec une structure fixe :

```
mon_module/
  __manifest__.py      # nom, version, dépendances, fichiers de données
  models/               # classes Python = objets métier, mappés en base par l'ORM
  views/                # XML : formulaires, listes, kanban
  security/
    ir.model.access.csv # qui a le droit de lire/écrire/créer/supprimer, par modèle
    security.xml         # règles d'enregistrement (quels ENREGISTREMENTS, pas juste quel modèle)
  data/                  # données de démarrage ou de démonstration
```

Les modules « orientés utilisateur » sont étiquetés et exposés comme des
**Apps** (Comptabilité, Stock, RH…) ; un module peut dépendre d'un autre
via le manifeste, ce qui commande l'ordre d'installation.

**Rapprochement OmegaX** : c'est très exactement la structure d'un module
NestJS (`src/modules/<domaine>/` : service, controller, DTO, module).
Ce qu'Odoo a et qu'OmegaX n'a pas formalisé : la notion de **dépendance
déclarée entre modules** (le manifeste dit explicitement « ce module a besoin
de tel autre ») et la distinction entre module technique et **App** exposée
à l'utilisateur. Ça vaut le coup d'expliciter, dans chaque `*.module.ts`
futur (Paie, Immobilisations avancées), de quels modules existants il dépend
· le futur module Paie dépendra du module Comptes (le salarié est un tiers
de classe 4) et du module Écritures (générer la passation comptable).

## 3. La sécurité · deux couches, pas une

1. **ACL** (`ir.model.access.csv`) : par modèle, par groupe d'utilisateurs,
   quatre droits (lire/écrire/créer/supprimer). C'est un contrôle
   **au niveau du type d'objet**.
2. **Record rules** (`security.xml`) : filtrent ensuite **quels
   enregistrements précis** un utilisateur autorisé par l'ACL peut réellement
   voir (ex. : un commercial ne voit que ses propres opportunités).

**Rapprochement OmegaX** : le `RolesGuard` actuel fait le premier niveau
(ADMIN_CABINET / COMPTABLE / LECTURE_SEULE, par route). Le deuxième niveau ·
filtrer par enregistrement, pas seulement par route · existe déjà de façon
implicite (tout est filtré par `tenantId`), mais deviendra un vrai besoin
avec le `Cabinet` : un comptable du cabinet ne doit voir que les dossiers
clients (`Tenant`) qui lui sont assignés, pas tous ceux du cabinet
automatiquement. C'est la même distinction ACL/record rule qu'Odoo formalise.

## 4. Le point le plus directement transposable : la « localisation fiscale »

C'est la découverte la plus utile de cette recherche.

Odoo ne code PAS un plan comptable unique. Il a un cœur générique (module
`account` : écritures, journaux, factures, réconciliation) et, par-dessus,
un **module de localisation par pays** (`l10n_XX`) qui installe le plan
comptable propre au pays, ses groupes de comptes, ses modèles de taxes, ses
états légaux. Au moment d'installer la Comptabilité, Odoo détecte le pays de
l'entreprise et installe automatiquement le bon `l10n_XX` · à défaut, un plan
générique (`l10n_generic_coa`, calqué sur les USA) sert de repli. Les états
réglementaires eux-mêmes vivent dans un module encore séparé
(`l10n_XX_reports`), pour ne pas alourdir le module de localisation de base.

**Rapprochement OmegaX** : c'est EXACTEMENT le choix déjà fait avec
`Tenant.referentiel` (SYCEBNL / SYSCOHADA) et
`Tenant.jeuEtatsFinanciersSycebnl` (Associations / Projets / SMT) · un cœur
commun (écritures, journaux, lettrage, balance) et un référentiel enfiché
par-dessus qui détermine le plan de comptes et les états produits. Le fait
qu'Odoo, qui doit couvrir des dizaines de pays, ait convergé vers exactement
ce patron d'architecture est une validation forte : **le squelette actuel
d'OmegaX n'a pas besoin d'être refait pour accueillir un jour le SYSCOHADA
entreprises en plus du SYCEBNL** · il suffira d'ajouter le `l10n`-équivalent
(plan de comptes SYSCOHADA, déjà encodé dans le skill `syscohada`), pas de
réécrire le moteur.

## 5. Le workflow comptable · déjà le même que le vôtre

Odoo génère automatiquement l'écriture en partie double dès qu'un document
commercial change d'état (facture validée, paiement enregistré…), puis
« réconcilie » l'écriture de paiement avec celle de la facture : appliquer
tout ou partie du solde de l'un sur l'autre, jusqu'à ce que la facture passe
à l'état soldé.

**Rapprochement OmegaX** : c'est très exactement le lettrage déjà construit
(code A, B… par compte, statut PARTIEL/SOLDE, solde signé). Rien à
emprunter ici · c'est déjà fait, et fait avec plus de rigueur documentaire
(ancrage CPCC explicite sur le sens du solde partiel).

## 6. Le modèle commercial · ce qui informe la discussion de licence en cours

- **Abonnement par utilisateur/mois**, deux paliers publics (Standard,
  Custom), les DEUX donnant accès à toutes les Apps installées · Odoo ne
  fait pas payer chaque App séparément dans son offre standard, contrairement
  à ce qu'on pourrait croire du nom « App Store ».
- **Tarification régionale explicite** : le même poste utilisateur coûte de
  8,95 $ (Moyen-Orient) à 76,20 $ (USA) selon le pouvoir d'achat local ·
  publiée comme telle, pas cachée dans des remises commerciales.
- **« One App Free »** : une seule App, utilisateurs illimités, gratuit à
  vie. C'est un levier d'acquisition, pas une offre commerciale complète :
  ça fait essayer le produit sans friction, puis convertit vers le palier
  payant quand une deuxième App devient nécessaire.
- Les Apps du magasin tiers (thèmes, modules premium d'éditeurs externes)
  sont sous licence propriétaire Odoo distincte · la plateforme elle-même
  reste open-source (LGPL pour Community), mais l'écosystème payant est
  encadré.

**Ce que ça suggère pour OmegaX**, en plus de ce qui a déjà été discuté
(licence par `Cabinet`, dossiers illimités) : le palier « Association »
resté en attente pourrait suivre le même principe que le « One App Free »
d'Odoo · un dossier SMT unique, gratuit, sans limite de durée, comme porte
d'entrée. Ça convertit l'observation initiale (« je ne suis pas derrière
l'argent, je trouverai un moyen ») en un vrai mécanisme d'adoption plutôt
qu'en absence de modèle : le logiciel se répand par l'usage gratuit d'un cas
simple, et se monétise quand un cabinet a besoin de plus d'un dossier.

## 7. Ce qu'on n'emprunte PAS, et pourquoi

- **Le low-code / Odoo Studio** (personnalisation visuelle des formulaires
  par l'utilisateur final) : hors de portée pour une équipe de la taille
  actuelle, et le public visé (cabinets comptables, pas des développeurs
  métier) n'en a pas l'usage · Sage 100 i7, la référence de conception
  déjà choisie, ne l'a pas non plus.
- **Le multi-tenant par base de données séparée** (chaque client Odoo Online
  a sa propre base) : OmegaX est multi-tenant par colonne (`tenantId`) dans
  une base partagée, ce qui est le bon choix pour la taille de dossier visée
  (une ASBL, pas une multinationale) · changer ça n'apporterait rien, sauf
  complexité opérationnelle.

## Sources consultées (résumés de recherche, pages non fetchables directement)

- Documentation développeur Odoo, chapitres Architecture / Building a Module
  / Security, versions 14.0 à 19.0 (`odoo.com/documentation/<version>/developer/...`)
- Documentation « Fiscal localization packages » et « Accounting
  localization » (`odoo.com/documentation/<version>/applications/finance/fiscal_localizations.html`
  et `.../developer/howtos/accounting_localization.html`)
- Documentation « Accounting and Invoicing » et « Bank reconciliation »
  (`odoo.com/documentation/<version>/applications/finance/accounting...`)
- Pages de tarification (`odoo.com/pricing`) et analyses tierces (thecfoclub,
  oec.sh) pour la fourchette régionale
- Ouvrages tiers cités par la recherche : *Odoo Development Essentials*
  (Packt/O'Reilly), *Mastering Odoo Development* · non lus intégralement,
  seulement leurs résumés éditoriaux.
