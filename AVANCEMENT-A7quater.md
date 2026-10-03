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

3. (m4) « Lettrer au 416 » · à-nouveaux triés par date puis identifiant,
   lus au plafond plus un (`tronque` faux à 200 pile) ; « À apporter »
   expliqué par une bulle `Aide` ; (m8) dates du Règlement des tiers mises
   en forme par `lib/jour-fr.ts` (sorti de `controles-agregat-groupe.ts`).

4. (m3) Déclaration d'ouverture · une position en devise non soldée sur le
   416 partagé ne refuse plus ; ses francs sont retranchés de la borne
   (`positionsEnDevise`, `enDevise416`) et nommés dans le dépassement. Le
   refus reste pour une position sur le compte du CLIENT, avec l'issue.

5. Scénario sur VRAIE base (PostgreSQL 16 jetable, base `a7quater_1`,
   serveur compilé `node dist/main.js` sur le port 8090, dossier SYSCOHADA
   inscrit par l'API), à travers la clôture de 2026 et l'ouverture de 2027 ;
   gelé par `e2e/tests/lettrage-reclassement.e2e.ts` (typé, non joué en
   local faute de navigateur Playwright).

   Client Kasa (41110101, report en détail) · U 10/02 D 1 160 000 (706
   1 000 000, 443 160 000), T 01/05 idem, P 20/05 C 1 160 000 (D 521), R
   15/06 reclassement D 41620000 / C 41110101 1 160 000.
   - Lettrage automatique N · 0 groupe, passes par montant suspendues,
     4 lignes laissées ouvertes, message servi ; pré-lettrage · 0 proposition.
   - [T,P] lettré à la main (A, soldé) ; [U,R] refusé par le motif nommé.
   - Balance N · 41110101 D 2 320 000 / C 2 320 000, solde 0 ; 41620000
     1 160 000 ; 70610000 C 2 000 000 ; 44310000 C 320 000 (calcul à la main ·
     2 × 1 160 000 au débit, P + R au crédit ; TVA 2 × 160 000).
   - Clôture 2026 · à-nouveaux en détail de U (D 1 160 000) et de R
     (C 1 160 000) au 01/01/2027 ; lettrage automatique N+1 · 0 groupe,
     suspendu, 2 lignes ; pré-lettrage · 0. Balance N+1 41110101 D 1 160 000
     / C 1 160 000, solde 0.

   Client Mbuyi (41110102) · V 01/02 D 580 000, R2 15/03 (litigieuse,
   41610000) C 580 000, W 01/07 D 580 000, Q 20/07 C 580 000. Rejoué au
   second tour (base `a7quater_2`) après le retrait de la candidate unique ·
   - Lettrage automatique N · 0 groupe, suspendu, 4 lignes laissées
     ouvertes (au premier tour, [W,Q] était posé par l'exception retirée).
     Balance N 41110102 D 1 160 000 / C 1 160 000, solde 0.
   - N+1 · à-nouveaux de V, R2, W, Q · 0 groupe, suspendu, 4 lignes ; balance
     N+1 41110102 D 1 160 000 / C 1 160 000, solde 0.
   Tous les autres chiffres ci-dessous identiques au second passage.

   (m3) Au 41620000 en N · 300 000 francs (créance à déclarer) et 600 000
   d'une créance de 400 USD à 1 500. À-nouveau 2027 du 41620000 · 2 060 000.
   Déclaration de 400 000 refusée · « (1160000.00 déjà portés) plus cette
   créance (400000.00) dépasse son à-nouveau (2060000.00, dont 600000.00
   portés par une créance en devise non réglée, hors du module et
   retranchés) » ; 300 000 déclarés (borne 2 060 000 − 600 000 = 1 460 000 =
   1 160 000 + 300 000).

   (m4, m5) Recouvrement de Kasa en N+1, 10/02/2027, 1 160 000 · lettrage
   au 416 à désigner ; proposition · 1 ligne ouverte, à apporter 1 160 000,
   trois à-nouveaux triés par date (600 000, 300 000, 1 160 000), tronque
   faux, une ligne proposée ; posé (A, MODULE) ; délettrage de A refusé par
   le motif nommé.

   (m6) Brouillard supprimé ; écriture validée refusée (403).

   Balance N+1 finale · 41620000 D 2 060 000 / C 1 160 000, solde 900 000
   (300 000 déclarés + 600 000 en devise) ; 52110000 2 000 010 (840 000
   d'à-nouveau = 1 160 000 + 580 000 − 300 000 − 600 000, plus 1 160 000
   recouvrés, plus 10) ; 41610000 580 000 ; 41110101 et 41110102 à zéro.

6. Bloc du § 3 · `npx prisma generate`, `npx tsc --noEmit`, `npx jest
   --maxWorkers=3` (715 suites, 10 017 tests ; deux doublures corrigées
   après le premier passage, `tva/annulation-liquidation.spec.ts` pour
   m6 et `client/src/lib/jour-fr.spec.ts` sans import de vitest, rejouées
   au vert), `npm run build` ; client · `npx tsc --noEmit`, `npm test`
   (209 fichiers, 1 702 tests), `npm run build` ; dérive du schéma ·
   « No difference detected » (seul un commentaire a changé).

7. Second tour (vérification indépendante) · BLOQUANT, exception de la
   candidate unique retirée (`lignesMisesDeCote` suspend dès qu'un R est
   ouvert), specs des deux cas du vérificateur (aucun groupe par montant,
   ni au lettrage automatique ni au pré-lettrage) ; mineur 1, bulle Aide de
   l'écran Lettrage ; mineur 2, une position en devise CRÉDITRICE au 416
   n'élargit jamais la borne (`Math.max(0, …)`, spec) ; mineur 4, la bulle
   « À apporter » ne cite plus que la convention d'OmegaX. Mineurs 3 et 5
   laissés au suivi. Bloc du § 3 rejoué · serveur tsc, `npx jest
   --maxWorkers=2` (715 suites, 10 020 tests ; un dépassement de délai de
   5 s dans `exports/liasse-etafi.spec.ts`, hors des fichiers de la ligne,
   sous la charge du constructeur parallèle, rejoué seul au vert, 24 sur
   24), build ; client tsc, `npm test` (209 fichiers, 1 702 tests), build ;
   e2e tsc.

## Reste

- Intégration sur `main` (tests navigateur en CI, dont le nouveau
  `lettrage-reclassement.e2e.ts`, non joué en local faute de navigateur).

## Décisions

- (B) Règle sans devinette (second tour, exception RETIRÉE) · dès qu'une
  ligne de reclassement R ouverte existe sur le compte, TOUTES les passes
  par montant s'abstiennent, au lettrage automatique comme au pré-lettrage ;
  seule la passe par référence de pièce joue, le nombre de lignes laissées
  ouvertes est dit. La « candidate unique » du premier tour était une
  devinette · R peut couvrir plusieurs factures (V, X, Y, R = X + Y, P paie
  V · [P,X,Y] posé) ou une partie d'une seule (U payée 600 000 par P1, R
  reclasse 400 000, W payée par Q · [U,P1,Q] posé). Fondement · la ligne du
  reclassement lettrée avec une facture serait lue comme un encaissement
  (décret n° 011/42, art. 57 ; O.-L. n° 10/001, art. 25, 2°), règle d'A7.
- (B, N+1) R, jamais lettrée, reste ouverte dans son exercice clôturé · le
  compte reste donc suspendu en N+1, et les à-nouveaux de U et de R (celui
  de R sans liaison) ne s'apparient pas. Le lettrage de ce compte se fait à
  la main ou par référence de pièce (bulle Aide de l'écran Lettrage,
  convention d'OmegaX).
- (m5) CLAUDE.md, A7 ter B2 · un groupe d'origine MODULE n'est défait que
  par le module · `delettrer` le refuse avec l'issue (annuler ou retirer le
  mouvement de la créance).
- (m1) Le calcul du lettrage automatique se fait dans sa transaction · le
  délai de la transaction se règle sur le nombre de lignes ouvertes du compte.

- (m3) Décision · le refus ne mord que sur le compte du client (la créance
  déclarée est en francs, le module ne suit pas les créances en devise,
  AUDCIF art. 54 et 55) ; sur le 416 partagé, la contrevaleur d'une autre
  créance en devise ne peut pas servir de borne à une créance en francs ·
  elle est retranchée, pas refusée.

## Vérification

```bash
npx jest src/modules/lettrage src/modules/creances-douteuses src/modules/comptabilite
(cd client && npx vitest run src/lib/jour-fr.spec.ts)
(cd e2e && npx tsc --noEmit -p .)
# vraie base · scratchpad scenario.mjs contre node dist/main.js (PORT=8090)
```
