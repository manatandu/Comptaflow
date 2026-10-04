# AVANCEMENT A20 · comptabilité de gestion

Ligne A20 du suivi (`docs/suivi-immobilisations-verrouille.md`) · clés de
répartition, coût de production avec imputation rationnelle, seuil de
rentabilité, définitions d'OmegaX dites (relevé CPCC C17). Branche locale
`travail-a20`, sauvegarde `travail/a20`, partie de `ce42a64`.

## Sources lues (2026-10-04)

- AUDCIF Titre VI (glossaire) · « COMPTABILITÉ ANALYTIQUE DE GESTION (CAGE) »
  (« ni normalisée, ni obligatoire »), « RÉPARTITION » (clef « fondée sur des
  relevés statistiques ou des raisonnements techniques et économiques »),
  « UNITÉ D'ŒUVRE », « CHARGES FIXES ET VARIABLES » (fixes, variables,
  semi-variables), « COÛT », « COÛT DE PRODUCTION », « COÛT RÉEL », « MARGE ».
  Aucun article ne définit le seuil de rentabilité (mention seule sous
  « AVANCES CONDITIONNÉES ») · définition d'OmegaX.
- AUDCIF Titre VIII **ch. 14** § 2.3.1 et § 2.3.2 (imputation rationnelle,
  capacité normale, sous-activité en charge de la période). ANOMALIE DU RENVOI
  de la ligne A20 · elle cite « ch. 13 § 2.3 », qui est le portefeuille-titres.
- AUDCIF art. 37 (coût réel de production, charges indirectes « raisonnablement
  rattachées »), non exclu par l'art. 3 du SYCEBNL.
- AUDCIF Titre VII classe 9 et SYCEBNL Partie 2 ch. 3 section 9 · comptes 92 à
  99 « laissés à l'initiative des entités ».
- SYCEBNL Partie 2 ch. 3 section 3 (règles des stocks) · « imputation
  systématique des frais généraux de production fixes et variables », sans la
  règle de la capacité normale.

## Décisions (définitions d'OmegaX, dites dans l'Aide)

1. Le comportement d'un compte (fixe, variable, semi-variable avec sa part
   variable, produit d'activité, hors calcul) se DÉCLARE sur le compte
   (`Compte.comportementGestion`, `partVariableGestionPct`), jamais déduit du
   numéro ; non déclaré et mouvementé = calcul incomplet (`null`).
2. Clé de répartition par exercice, en pourcentages (somme 100) ou en unités,
   source exigée ; la répartition PROPOSE une OD analytique par compte général,
   équilibrée (règle de `od-analytique.ts`), passée au clic, rejouée par le
   serveur. Aucune réciprocité résolue · méthode en escalier, dite.
3. Coût de production · capacité normale et activité réelle déclarées avec
   unité et source ; coefficient borné à 1 (lecture d'OmegaX · « coût réel ») ;
   sous-activité montrée comme charge de la période ; rien posté, rien changé
   aux règles des stocks.
4. Seuil · classes 6 et 7 seules, mouvement clôture exclue ; aux deux
   référentiels (une EBNL peut s'en servir).

## Fait

- [x] Schéma et migration `20270133000000_comptabilite_de_gestion` (dérive nulle,
      `prisma migrate diff --exit-code` sur base jetable).
- [x] Moteurs purs et spec chiffré (`src/modules/analytique/gestion/`,
      `gestion.spec.ts`, 14 cas à la main).
- [x] Service, contrôleur `/comptabilite-gestion` (dans `AnalytiqueModule`, aucun
      import circulaire), spec du service sur doublure qui honore le `where`.
- [x] Enregistrements · cloisonnement (3 modèles), audit (`CleRepartition`,
      `CoutProductionDeclare` journalisés, lignes de la tête), libellés du
      journal, restitution (148 modèles), références de suppression (une clé
      retient sa section, test ajouté), fonctions métier, routes « pas une
      liste de comptes ».
- [x] Écran · fenêtre « Comptabilité de gestion » (État › Suivi et prévision),
      quatre onglets, Aide par onglet, masquée au SMT ; décompte du menu État
      passé à 31 (`chrome-etroit.spec.ts`, bornes inchangées).
- [x] Rejeu sur vraie base (`a20_1`, serveur compilé, port 8107), SYSCOHADA ET
      SYCEBNL, à travers la clôture de N · REJEU VERT aux deux (voir chiffres).

## Chiffres du rejeu (à la main = servi)

- Seuil N · P 2 000 000, CV 520 000, CF 380 000, M 1 480 000 (74 %),
  S 513 513,51, sécurité 1 486 486,49 (74,32 %), point mort 3,08 mois ;
  identique après la clôture de N.
- Clé ATEL 75/25 · 624 de 300 000 en 225 000 / 75 000 ; soldes périmés 409 ;
  balance analytique ATEL 0, PRODA -1 275 000, PRODB 175 000, total -1 100 000
  inchangé ; clé qui a produit une OD non retirable (409).
- Coût PRODA · variables 420 000, fixes 305 000, coefficient 0,8, imputées
  244 000, sous-activité 61 000, coût 664 000, unitaire 1 660 ; identique après
  la clôture.
- N+1 · reprise de la clé (1, source datée), 100 000 en 75 000 / 25 000, seuil
  N+1 sans produit (null, motif), grand livre du 624 intact (100 000).

## Reste (non fait, à décider)

- Prestations réciproques entre sections auxiliaires · non résolues (méthode en
  escalier, dite dans l'Aide). Aucun texte ne l'impose.
- Seuil par section (et non pour le dossier entier) · non servi.
- Le coût unitaire n'alimente pas le magasin · le cabinet le porte lui-même,
  aucune règle des stocks n'a été touchée (rien dans le texte ne l'exige).
- Suivi · la ligne A20 cite « Titre VIII ch. 13 § 2.3 » ; le § 2.3 du coût de
  production est au ch. 14 (le ch. 13 est le portefeuille-titres). Corriger la
  ligne du suivi à l'intégration.

## Bloc § 3 (2026-10-04)

Serveur · tsc vert, `npx jest --maxWorkers=2` 741 suites, 10 500 tests verts,
`npm run build` vert. Client · tsc vert, `npm test` 218 fichiers, 1 780 tests
verts, `npm run build` vert. Tests navigateur non lancés ici (au portillon).

## Vérification

```bash
npx jest src/modules/analytique/gestion
npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <base jetable> --exit-code
```
