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

- [x] Schéma et migration `20270133000000_comptabilite_de_gestion` (dérive nulle).
- [x] Moteurs purs et spec chiffré (`src/modules/analytique/gestion/`).

## Reste

- [ ] Service et contrôleur, enregistrements (cloisonnement, audit, fonctions).
- [ ] Écran.
- [ ] Rejeu sur vraie base à travers une clôture.
- [ ] Bloc § 3 complet.

## Vérification

```bash
npx jest src/modules/analytique/gestion
npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <base jetable> --exit-code
```
