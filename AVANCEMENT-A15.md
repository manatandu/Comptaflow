# AVANCEMENT · ligne A15

Réévaluation · notes annexes et tableau des amortissements après réévaluation,
déclaration spéciale, sortie d'un bien réévalué (loi n° 23/053 art. 133 al. 3,
135, 137 ; AUDCIF Titre VIII ch. 28 § 6) · relevé CPCC C12. Prérequis · lot 14
vérifié.

Branche locale `travail-a15`, sauvegarde `travail/a15`, partie de `main`
ce42a64.

## Textes lus (à l'instant, dans les compétences)

- AUDCIF Titre VIII ch. 28 (`audcif-acte-uniforme`,
  `titre-8-ch22-30-...`) · § 4.2.2 (« amortissements nouveaux égaux à ceux
  initialement prévus multipliés par k ») ; § 4.2.4.2 (reprise du 154 au 861
  « à concurrence du supplément de la dotation ») ; § 6 (« Le solde de l'écart
  de réévaluation d'un bien cédé ou mis hors service doit faire l'objet d'un
  transfert à un poste de réserve non distribuable ») ; § 8 (notes annexes ·
  nature et date, coûts historiques par postes du bilan, amortissements
  supplémentaires, traitement fiscal, méthode).
- AUDCIF Titre IX ch. 6 · NOTE 3E (colonnes « Éléments réévalués par postes du
  bilan », « Montants coûts historiques », « Amortissements supplémentaires »).
- SYCEBNL Partie 4 ch. 2 · NOTE 5H (colonnes « Montants en coûts historiques »,
  « Montants réévalués », « Écarts et provisions spéciales réévaluation »).
- AUDCIF Titre VII, fiches des comptes 106 (débité des seules incorporations au
  capital), 11 (« réserves indisponibles (légales, réglementées,
  statutaires) »), 15 (« réduites ou annulées exclusivement par Reprises
  H.A.O. »). SYCEBNL, fiches 10, 11 (112, 118, aucune qualification de
  disponibilité), 15 (« annulation […] par le crédit du compte 86 »).
- Loi n° 23/053 (compilation DGI au 19/07/2026) · art. 129, 132, 133 (al. 2 et
  3), 134, 135, 136, 137, 138 ; art. 19 (plus-value imposable si le bien est
  aliéné).

## Décisions (avec leur article)

1. NOTES · encadré en LECTURE SEULE sur la NOTE 3E (SYSCOHADA normal) et la
   NOTE 5H (associations SYCEBNL), comme les coûts d'emprunt (D1) · servi des
   réévaluations du module, jamais écrit à la place du cabinet. Projets de
   développement et SMT · aucune note de réévaluation dans leur jeu, rien.
2. TABLEAU DES AMORTISSEMENTS (art. 135) · chaque bien réévalué porte la part
   de la dotation due à la réévaluation (D × (1 − 1/∏k'), ch. 28 § 4.2.2) et la
   reprise de l'exercice opérée sur l'écart (154 → 861, annuelle et à la
   sortie), lues sur les enregistrements du module.
3. DÉCLARATION SPÉCIALE (art. 136, 137) · édition des éléments par catégorie
   d'immobilisations, depuis la réévaluation enregistrée. Le modèle des
   imprimés du CPCC n'est pas au corpus · l'édition le dit, elle n'est pas
   l'imprimé, et ne dit jamais la déclaration déposée.
4. SORTIE D'UN BIEN RÉÉVALUÉ ·
   - 154, cession (vente, échange) · le reste non repris se reprend au 861 dans
     la sortie (loi n° 23/053 art. 133 al. 3 ; fiches du compte 15 des deux
     plans).
   - 154, mise hors service · NON PASSÉ, nommé · le ch. 28 § 6 (réserve) et la
     fiche du compte 15 (reprises H.A.O. seulement) se contredisent, la loi ne
     vise que la cession.
   - 106, SYSCOHADA, toute sortie · transfert du solde (écart moins pertes
     imputées) à une réserve non distribuable CHOISIE sous 111, 112 ou 113
     (ch. 28 § 6 ; fiche du compte 11), exigé à la sortie. Fiscalement, l'art.
     133 al. 3 et l'art. 19 sont dits, rien n'est retraité (le logiciel se
     souvient, il ne qualifie pas).
   - 106, SYCEBNL · NON PASSÉ, nommé · le texte du SYCEBNL ne dit pas le sort de
     l'écart à la sortie, et le § 6 ne lui est pas prêté (décision antérieure,
     controles.service.ts).

## Fait

- Serveur · `reevaluation-suites.ts` (règles pures · `supplementDeLaDotation`,
  `sortDesEcarts`, `motifRefusCompteReserve`, `lignesSortDeLEcart`,
  `posteDuBien`, `vueDeLExercice`) ; `ReevaluationBilanService` ·
  `noteReevaluations`, `declarationSpeciale`, `comptesReserve`,
  `ecartALaSortie` et leurs routes GET ; `sortir` passe l'écriture de l'écart
  (retenue, `ecritureSortieEcartReevaluationId`), échange et renouvellement
  transmettent la réserve ; `tableauAmortissements` relu à l'exercice
  (`ajustementReevaluation`, `reevaluation`) ; contrôle
  REEVALUATION_IMMO_HORS_MODULE qui écarte l'écriture de sortie de l'écart.
- Migration `20270132000000_sortie_bien_reevalue` (colonne retenue et
  `ecartTransfere`), dérive vérifiée nulle sur base jetable.
- Écran · encadré `ReevaluationsEnNote` (NOTE 3E, 5H), cadre « Amortissements
  après réévaluation » sous le tableau, `EcartReevaluationSortie` dans la
  sortie, l'échange et le renouvellement, édition « Déclaration spéciale ».
- Specs · `reevaluation-suites.spec.ts`, `sortie-bien-reevalue.spec.ts`,
  `tableau-apres-reevaluation.spec.ts`, `reevaluation-note-declaration.spec.ts`,
  client `reevaluation-suites.spec.ts`.
- Rejeu sur vraie base (PostgreSQL 16, `a15_1`, serveur compilé, port 8106) ·
  deux dossiers SYSCOHADA à travers la clôture de 2026, 43 contrôles, aucun
  écart (scratchpad `l15/rejeu.mjs`).

## Reste / relevés (non faits)

- 154 d'un bien mis hors service, 106 d'un dossier SYCEBNL · non passés, textes
  en tension ou muets (à Manasse s'il veut trancher).
- La levée d'option d'un contrat de location-acquisition (sortie interne) ne
  transmet pas de réserve · un bien réévalué ainsi levé est refusé avec le
  motif ; la sortie ordinaire reste l'issue.
- Le tableau des IMMOBILISATIONS à une date d'arrêté antérieure relit encore la
  valeur d'aujourd'hui (réévaluations postérieures comprises).
- Le solde transféré n'est pas borné par le solde du 106 au jour de la sortie
  (incorporation au capital à la main non suivie par bien).
- Écart incorporé au capital (à la dotation) · non tenu par le module, rubrique
  à la saisie.

## Vérification

```bash
npx tsc --noEmit && npx jest --maxWorkers=2 && npm run build
cd client && npx tsc --noEmit && npm test && npm run build
```
