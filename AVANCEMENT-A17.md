# AVANCEMENT · ligne A17

Ligne du suivi (`docs/suivi-immobilisations-verrouille.md`) · « SYCEBNL ·
virements internes 585 et 588 non soldés à la clôture signalés (fiche SYCEBNL
du compte 58) · relevé CPCC C14 ». Prérequis A13 intégré.

Branche de sauvegarde · `travail/a17`, partie de `main` a95f723.

## Textes lus

- SYCEBNL, Partie 2 ch. 3, COMPTE 58 « Virements internes » · « Subdivisions.
  585 Virements de fonds ; 588 Autres virements internes. » Commentaires ·
  « Ce sont des comptes de passage utiles à la comptabilisation d'opérations
  internes à l'entité. [...] En tout état de cause ces comptes doivent être
  soldés au terme de leur utilisation. » Éléments de contrôle · « Il importe
  de s'assurer que les comptes 585 et 588 relatifs aux virements internes sont
  soldés à la fin de l'exercice. » Plan (Partie 2 ch. 2) · « 58 VIREMENTS
  INTERNES (585 virements de fonds, 588 autres virements internes) ».
- AUDCIF, Titre VII, COMPTE 58 « Régies d'avances, accréditifs et virements
  internes » · subdivisions 581, 582, 585, 588 ; les mêmes phrases sur 585 et
  588 (« doivent être soldés au terme de leur utilisation » ; « soldés à la
  fin de l'exercice ») ; 581 et 582 se régularisent, aucune phrase ne les fait
  solder à la clôture.

## Décisions (par la loi)

1. LE CONTRÔLE VAUT AUX DEUX RÉFÉRENTIELS · la fiche SYSCOHADA porte la même
   obligation que la fiche SYCEBNL. Pas de cloisonnement (il ferait taire une
   société que sa propre fiche oblige) ; chaque message cite SA fiche
   (`sourceFicheCompte58`).
2. RACINES 585 ET 588 SEULES, aux deux plans · jamais la division 58 (un
   numéro, deux contenus · 581, 582 au SYSCOHADA).
3. AVERTISSEMENT (« doivent être soldés »), état à la clôture, jamais un
   retard · parle au LENDEMAIN de la fin de l'exercice, sous la borne
   d'entrée en vigueur de la ligne A13 (AUDCIF art. 113, SYCEBNL art. 28).
4. DEUX SOLDES · livre-journal (validées, AUDCIF art. 22, 2°) et toutes
   lignes (brouillard et à-nouveau provisoire compris) ; signalé dès que l'un
   n'est pas nul, le détail dit les deux.
5. Contrôle n° 35, code `VIREMENT_INTERNE_NON_SOLDE_A_LA_CLOTURE`, lu au
   passage des écritures du contrôle (aucune requête de plus), occurrences
   bornées à `PLAFOND_OCCURRENCES` avec `nombre` au-delà.

## Fait

- Règle pure · `src/modules/controles/banque-et-cloture-informatique.ts`
  (`estCompteDeVirementInterne`, `sourceFicheCompte58`,
  `virementsInternesNonSoldes`).
- Câblage · `controles.service.ts` (parcours, contrôle 35).
- Tests · `banque-et-cloture-informatique.spec.ts` (semis des deux plans,
  règle pure, câblage dans les deux référentiels).

## Reste

- Rejeu sur vraie base à travers une clôture (§ 10).
- Bloc du § 3 des deux côtés.

## Vérification

```bash
npx tsc --noEmit
npx jest src/modules/controles/banque-et-cloture-informatique.spec.ts
npx jest --maxWorkers=3
npm run build
(cd client && npx tsc --noEmit && npm test && npm run build)
```
