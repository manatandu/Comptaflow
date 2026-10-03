# AVANCEMENT · ligne A7 quater

Suites de la relecture d'intégration d'A7 ter (docs/suivi-immobilisations-verrouille.md,
ligne A7 quater). Branche locale `travail-a7quater`, sauvegarde `travail/a7quater`.

## Fait

1. (B), (m7), (m1) côté lettrage, (m5) · `lettrage/ligne-de-reclassement.ts`
   (`lignesMisesDeCote`, `messageMiseDeCote`), `lettrage/lettrage.service.ts`
   (`calculerPropositions` lit DANS la transaction de `lettrageAutomatique`,
   `lettrerLignesDuModule` relit le gel dans sa transaction, `delettrer`
   refuse un groupe MODULE et relit le gel dans sa transaction), commentaire
   du schéma (`OrigineLettrage.MODULE`), écran Lettrage (message de mise de
   côté, lettrage automatique et pré-lettrage).

2. (m1) écriture de reclassement et `CreanceDouteuse` dans une seule
   transaction (`EcritureService.creerAvec`, sous `avecRetrySerialisable`,
   donc `transactionJournalisee`) ; (m6) `EcritureService.supprimer` ne
   retire que ce qui est encore au brouillard (`deleteMany` filtré, une
   ligne et une seule, sinon 409).

## Reste

- (m3) position en devise sur le 416 partagé à la déclaration.
- (m4) liste des à-nouveaux de « Lettrer au 416 » (tri, `tronque`).
- (m6) `EcritureService.supprimer` filtré sur le brouillard.
- (m8) dates ISO brutes au Règlement des tiers.
- « À apporter » expliqué par la bulle `Aide`.
- Scénario sur vraie base à travers une clôture ; bloc du § 3.

## Décisions

- (B) Règle sans devinette · dès qu'une ligne de reclassement R ouverte
  existe sur le compte, les passes par montant s'abstiennent, sauf si chaque
  R a UNE seule candidate de même montant, de sens contraire, datée au plus
  tard de R (candidates lues figées comprises) · la paire est alors mise de
  côté. La passe par référence de pièce joue toujours. Fondement · la ligne
  du reclassement lettrée avec une facture serait lue comme un encaissement
  (décret n° 011/42, art. 57 ; O.-L. n° 10/001, art. 25, 2°), règle d'A7.
- (B, N+1) L'à-nouveau de R n'a pas de liaison · une ligne d'à-nouveau
  postérieure à R, du montant et du sens de R, suspend aussi les passes par
  montant (sinon U et R de N, ouvertes, faisaient tenir la candidate unique
  et les à-nouveaux de U et R s'appariaient en N+1).
- (m5) CLAUDE.md, A7 ter B2 · un groupe d'origine MODULE n'est défait que
  par le module · `delettrer` le refuse avec l'issue (annuler ou retirer le
  mouvement de la créance).
- (m1) Le calcul du lettrage automatique se fait dans sa transaction · le
  délai de la transaction se règle sur le nombre de lignes ouvertes du compte.

## Vérification

```bash
npx jest src/modules/lettrage src/modules/creances-douteuses
```
