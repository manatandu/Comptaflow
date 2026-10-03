# Avancement · ligne A8 (décompte final émis, figé et passé au journal)

Branche de sauvegarde : `travail/a8` (`git push -q origin HEAD:refs/heads/travail/a8`).
Jamais sur `main`, aucune demande de tirage. Fiche retirée à l'intégration.

## Objet

Le décompte final (module `src/modules/personnel/decompte-final.ts`, P4) ne
faisait que calculer. A8 le fait ÉMETTRE et FIGER comme un bulletin
(numérotation continue, indélébile, annulation motivée, remise déclarée),
avec ses retenues (CNSS ouvrière, impôt, autres) et son net, puis le fait
passer au journal par la même mécanique que la paie du mois (P9).

## Sources lues (2026-10-03)

- AUDCIF, Titre VIII ch. 21 § 5.2 · « L'indemnité de cessation d'emploi est
  comptabilisée au débit d'un compte de charge de personnel par le crédit du
  compte 42 Personnel » ; exemples · licenciement, rupture conventionnelle,
  plan de départ volontaire.
- AUDCIF, Titre VII, fiche du compte 66 · 6614 « Indemnités de préavis, de
  licenciement et de recherche d'embauche » ; 66 débité par le crédit du 422.
- SYCEBNL, Partie 2 ch. 3, fiche du compte 66 · mêmes subdivisions (6614,
  même intitulé) et même fonctionnement ; fiche du compte 42 · crédité des
  rémunérations brutes par le débit des 66.
- Semis · `66140000` aux deux (`compte-seed.ts` l. 981 « Indemnités de préavis
  et de licenciement » ; `compte-seed-syscohada.ts` l. 1232 « Indemnités de
  préavis, de licenciement et de recherche d'embauche »). Même numéro, aucun
  rôle divergent ; l'intitulé du semis SYCEBNL (plan des comptes, ch. 2) est
  plus court que celui de sa fiche (ch. 3) · non corrigé, signalé.
- Code du travail, art. 100, 103, 104 ; arrêté n° 12/CAB.MIN/ETPS/042 du
  8 août 2008, art. 2 (décompte écrit « lors de la résiliation du contrat de
  travail, pour quelque cause que ce soit ») ; art. 7, point 8 (liste
  d'exclusion FERMÉE de la rémunération).
- Loi n° 23/053, art. 68, 6° · imposables « les sommes payées par
  l'employeur [...] par suite de cessation de travail ou de rupture de
  contrat d'emploi » ; art. 118 et 119 (barème, retenue mensuelle).

## Décisions (de Manasse, 2026-10-02, appliquées telles quelles)

- IMPÔT · barème du mois (art. 118 et 119), le mois de cessation annualisé
  comme un bulletin, avec une réserve écrite sur le versement unique.
- COEXISTENCE · le décompte REMPLACE le bulletin du dernier mois ; un
  bulletin actif du même mois refuse le décompte, et inversement.

## Plan

1. [ ] Schéma · `BulletinPaie.nature` (`MOIS` | `DECOMPTE_FINAL`), migration
   écrite à la main, contrôle de dérive sur une base jetable.
2. [ ] Moteur · nature `INDEMNITE_DE_FIN_DE_CONTRAT` (6614 aux deux plans),
   éléments du décompte (`elements-decompte.ts`), refus d'émission.
3. [ ] Service et route · `POST /personnel/salaries/:id/decompte-final`,
   rejoué au serveur, même séquence et même refus de coexistence que le
   bulletin ; passation par la paie du mois (P9) sans autre chemin.
4. [ ] Écran · bouton « Émettre le décompte » dans l'onglet du décompte,
   nature affichée dans la liste des bulletins.
5. [ ] Bloc du § 3 des deux côtés.

## Fait

(rien encore)

## Reste

Tout le plan ci-dessus.

## Vérification

```bash
npx tsc --noEmit && npx jest src/modules/personnel && npx jest
npm run build
cd client && npx tsc --noEmit && npm test && npm run build
```
