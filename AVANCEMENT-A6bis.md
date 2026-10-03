# AVANCEMENT · ligne A6 bis (défauts de production de l'écart de change réalisé)

Branche de sauvegarde · `travail/a6bis`, partie de `origin/main` 5d388c0,
rattachée à `origin/main` f4ab9bb (fusion, pas de rebase) au premier tour.
Fiche retirée à l'intégration (CLAUDE.md § 5, « RIEN NE SE PERD »).

## Textes lus (à l'instant, dans les compétences)

- AUDCIF art. 50 à 58-4 (`titre-1-ch4-evaluation-resultat.md`).
- AUDCIF Titre VIII ch. 22 · § 1.1 (immobilisations, « paiement à terme
  libellé en devises » · « charge ou produit financier »), section 2 et
  § 2.3 (règlement, 656 / 756 commercial, 676 / 776 financier, « la provision
  pour pertes de change de fin d'exercice est ajustée pour tenir compte des
  opérations dénouées »), section 4 (disponibilités en devises).
- Titre VII, fiches des comptes 40, 41 (dont 404 « Fournisseurs,
  acquisitions courantes d'immobilisations » et 414 « Créances sur cessions
  courantes d'immobilisations »), 52 (« les avoirs en monnaies étrangères
  sont évalués au dernier cours officiel de change connu »).
- SYCEBNL Partie 2 ch. 2 (plan · ni 404 ni 414) et ch. 3, fiches 40, 41, 52.

## Fait

- B1 · `coursEtFrancsDuReglement` refuse montant en devise, francs et cours
  (saisi ou déduit) nuls, négatifs, `null` ou NaN, sur la valeur arrondie que
  la pièce porterait ; DTO `montant` en `@FacultatifNonNul` + `@IsPositive` ;
  service · `undefined` seul vaut « le dû entier ». Tests · règle pure, porte
  (class-validator), service (six cas, aucune pièce).
- B3 · le RIB du journal se lit à CHAQUE règlement ; case « Moyen de paiement
  en devise » décochée et RIB tenu dans une devise étrangère · refus, que le
  lot soit en devise ou en francs (art. 57 ; fiche du compte 52 des deux
  plans). La trésorerie en devise sur facture en francs n'est PAS ouverte
  (relevé), le refus nomme l'issue (journal d'un compte en francs, ou saisie
  au journal avec devise et cours). m7 · les deux refus ajoutent « ou, si le
  RIB est mal renseigné, corrigez sa devise (Banques) ».
- B2, REFAIT AU PREMIER TOUR (le refus de clôture ENFERMAIT un dossier dont
  le groupe était figé, B-1) · `lettrage/lettrages-a-cheval.ts`, trois
  règles. (1) `lireComptesDuReport` · au report Détail et à l'à-nouveau
  provisoire, une ligne lettrée par un groupe qui touche un AUTRE exercice se
  lit NON lettrée pour le report de son exercice · plus de 500, plus de refus
  de clôture ni d'exigence de délettrage, figé ou non. Les refus de
  `cloturer` et `genererANouveauxProvisoires` sont retirés. Tests
  (`report-a-nouveau-agrege.spec.ts`, double qui honore le filtre de groupe) ·
  partiel et soldé au Détail, soldé au SOLDE, groupe interne écarté, clôture
  et provisoire, report équilibré, requête bornée à l'exercice lu. (2) Un
  NOUVEAU groupe entre exercices n'est refusé qu'au DÉTAIL (doctrine CPCC,
  § 3 de `docs/organisation-comptable-cpcc.md`, « mode Détail des comptes de
  tiers ») · lettrage manuel, complément, confirmation du pré-lettrage ; le
  lettrage automatique et le pré-lettrage ne partitionnent par exercice
  qu'au Détail. Le refus nomme l'issue · lettrer contre l'à-nouveau DÉFINITIF
  une fois l'exercice antérieur clôturé, sinon attendre sa clôture. Libre au
  SOLDE (B-2, m6 · salaire de décembre payé en janvier, testé). (3) Contrôle
  35 (le 34 est pris par A5 bis, relu sur sa branche) ·
  `LETTRAGE_A_CHEVAL_D_EXERCICES` en INFORMATION, au Détail seulement (effet
  réel restant · la ligne d'à-nouveau de la facture reste ouverte dans
  l'exercice suivant, son règlement lettré avec la ligne d'origine ; le solde
  est juste, le détail ouvert ne l'est pas) ; plus rien au SOLDE ;
  `LETTRAGE_A_CHEVAL_FIGE` retiré, avec sa phrase « Aucun total n'en est
  faussé ». « Figé » se lit par la règle de `gel-cloture.ts` (exercice,
  journal ou période clôturés), plus par le seul exercice.
- m1 · le lettrage automatique et le pré-lettrage écartent les lignes
  `estANouveauProvisoire` (testé).
- m4 · `ECART_CHANGE_A_CHEVAL_NON_CONSTATE` en AVERTISSEMENT · groupe à
  cheval partiel, soldé dans sa devise sur l'ensemble de ses lignes et pas en
  francs, dénoué dans l'exercice lu · montant, et issue par cas · figé,
  écriture manuelle au compte PRESCRIT (`comptesPrescrits` · 656 / 756 ou
  676 / 776 au SYSCOHADA, 658 / 7588 ou 676 / 776 au SYCEBNL, décision D2),
  contre le compte du tiers, datée dans l'exercice du dénouement ; non figé
  au Détail, refaire le lettrage contre l'à-nouveau ; au SOLDE, l'écart
  proposé. `propositionEcartChange` · groupe à cheval figé, motif de
  l'écriture manuelle ; au Détail, refus avec l'issue ; au SOLDE non figé,
  l'écart se propose (testé). D3 n'en compte toujours aucun, sa phrase dit
  où il se lit.
- m5 · le « aucun geste d'OmegaX ne le défait » du groupe figé nomme sa
  cause (formé avant la règle, ou compte passé au Détail après coup).
- M4 · `ordreDeReglement` · factures par date, puis identifiant de LIGNE, au
  passage (`coutHistoriqueRegle`), à l'écran (`ecartEstime`, `ReglementsPage`
  envoie l'identifiant) et à la liste des échéances (`orderBy` complété).
  Écart à la consigne écrit · « ordre de `ligneIds` » n'est gardé nulle part,
  D4 ne pourrait pas le rejouer (M1) ; l'identifiant de ligne, si.
- M1 · D4 lit le coût historique par la règle d'A6 (`coutsHistoriquesSuccessifs`,
  règlements successifs, la part qui épuise une facture prend ses francs
  restants) ; des règlements qui dépassent les factures en devise sont
  écartés et comptés.
- M2 · D4 · une écriture de clôture ou d'à-nouveau n'est jamais un règlement.
- M3 · `natureDuCompte` (serveur et écran) · le 404 du SYSCOHADA est
  FINANCIER (ch. 22 § 1.1, relu · prix payé d'une immobilisation, « charge
  ou produit financier »), le 414 du SYSCOHADA SANS nature (aucun texte ne la
  dit, le cabinet choisit parmi les comptes de change) ; le SYCEBNL n'ouvre
  ni l'un ni l'autre (vérifié aux semis). Table `CAS_NATURE` au spec du
  serveur, relue et rejouée par le spec du client ; cas ajoutés à `CAS_ADMIS`.
- M5 · `avertissementExtourneManquante` lit TOUTES les réévaluations
  antérieures non annulées et non contre-passées (bornées à cinquante, une
  par exercice), chacune sur le compte du tiers seul (rien des
  disponibilités, A5 bis) ; nomme une ou plusieurs dates.
- M7 · le message dit que la contre-passation ne touche que le 478 et le
  479, et que la provision s'ajuste à la réévaluation de l'exercice en cours
  (ch. 22 § 2.3).
- M6 · VÉRIFIÉ, confirmé · le report Détail lit les lignes sans lettre
  (`OR: [{ lettre: null }, { lettre: '' }]`), et un groupe PARTIEL n'en pose
  aucune · la facture de 1 160 USD et le règlement de 600 USD passent en N+1
  chacun de son côté, sans lien (test de `lignesReportANouveau`). PREMIER
  TOUR · la borne ne vise que les lignes CHOISIES qui sont elles-mêmes des
  à-nouveaux, contre LEUR part · leur dû moins les règlements, acomptes et
  avoirs REPORTÉS hors de tout groupe (colonne du règlement, signe compris ·
  une inscription en négatif annule) ; une facture de l'exercice garde son dû
  entier, dans un lot comme seule (le premier jet la refusait à tort). Refus
  nommé avec l'issue (régler au plus, compléter le lettrage avec la ligne
  d'à-nouveau, ou la lettrer d'abord avec son autre facture). La borne au
  reste dû du COMPTE est RETIRÉE (voir Décisions). Tests · huit
  (vérification du report, à-nouveau de clôture et provisoire, facture de
  l'exercice non bornée, lot, client, lettrée ou annulée, ligne non lettrée
  de l'exercice sans effet, requête).

## Reste

- Premier tour fait. Bloc du § 3 à repasser des deux côtés (voir
  Vérification) ; puis relecture, intégration sur `main` (relire alors le
  numéro du contrôle · 35 si A5 bis a pris le 34) et tests navigateur.

## Renvoyé après l'intégration d'A5 bis (B-3, ne pas toucher `calculer` avant)

- La réévaluation de N écarte une facture de N lettrée (SOLDE) par un
  règlement de N+1 · son latent n'est pas calculé à la clôture de N.
  Atteignable au SOLDE, où le lettrage entre exercices reste libre (règle 2),
  et par les groupes à cheval déjà en base. Correctif à porter dans
  `DevisesService.calculer` · lire comme OUVERTE, à la date de réévaluation,
  une ligne lettrée par un groupe dont une ligne est postérieure à cette
  date ; et un contrôle qui nomme les réévaluations déjà passées touchées
  (groupe, compte, montant en devise, issue · annuler et réévaluer, D6).

## Relevés (hors périmètre, non traités)

- Le règlement EN FRANCS d'une facture reportée entière en N+1 après un
  règlement partiel en N (même défaut que M6, sans devise) · le dû en
  francs n'est borné que par les factures choisies. Même remède possible,
  hors de la ligne A6.
- La trésorerie en devise sur facture en francs (B3) · refusée, non ouverte.

## Décisions prises

- B1 · AUDCIF art. 52 et 55 · le règlement se mesure contre ce qui est
  réellement payé ; un paiement nul ou négatif n'est pas un règlement.
- B3 · AUDCIF art. 57, fiche du compte 52 des deux plans (« les avoirs en
  monnaies étrangères sont évalués au dernier cours officiel de change
  connu ») · un compte tenu en devise ne reçoit pas de francs sans devise.
- B2 (premier tour, consigne du coordinateur) · doctrine CPCC (§ 3 de
  `docs/organisation-comptable-cpcc.md`, en tête de `lettrage.service.ts`) ·
  « un règlement de mars qui solde une facture de décembre se lettre contre
  la ligne de REPORT À-NOUVEAU de l'exercice ouvert (MODE DÉTAIL des comptes
  de tiers) » · la règle vise le Détail, le SOLDE reste libre ; AUDCIF
  art. 20 · les groupes existants ne sont pas réécrits, le report les lit
  pour chaque exercice. Le cas « soldé, figé, part non nulle » du premier
  jet n'enferme plus rien (la règle 1 l'équilibre).
- m4 · la clôture ne refuse pas l'écart resté sur un groupe à cheval (D3
  inchangé, aucun refus de clôture pour ces groupes) · il est dit en
  AVERTISSEMENT, chiffré, avec son issue. Non tranché par le texte · le
  compte d'un écart quand la nature du compte ne se lit pas sur son numéro
  (414 au SYSCOHADA, et tout compte hors des racines que `natureDuCompte` lit
  pour le référentiel) · le cabinet choisit, l'issue le dit.
- M6 · aucun lien ne relie une ligne d'à-nouveau à sa facture d'origine
  (`report-a-nouveau.ts` ne recopie ni groupe ni référence) · la borne est
  PROTECTRICE (lecture du § 10 bis) · tout règlement reporté non lettré est
  lu contre la ligne d'à-nouveau CHOISIE, l'issue étant de le lettrer d'abord
  avec la sienne. Limite dite · une avance reportée sur une commande à venir
  borne aussi. Aucune migration (le schéma ne bouge pas).
- M6, borne (2) RETENUE COMME RETIRÉE · le règlement se borne au dû des
  factures choisies dans LEUR devise. Fiche du compte 40 (AUDCIF Titre VII,
  lue) · le compte fournisseur est « débité des avances et acomptes versés
  aux fournisseurs ainsi que des règlements effectués sur factures » · une
  avance, un règlement ou un avoir non lettré du compte ne dit pas à quelle
  facture il revient ; la borne au reste dû du compte refusait de régler une
  facture à côté d'une avance ou d'un avoir qui ne la concernait pas, et
  l'issue juste (régler la facture, puis lettrer l'avoir à part) n'était pas
  la sienne.
- M4 · écart à la consigne · l'« ordre de `ligneIds` » n'est gardé nulle
  part, D4 ne pourrait pas le rejouer ; l'identifiant de ligne, si.

## Vérification

```bash
npx tsc --noEmit
npx jest src/modules/reglements src/modules/lettrage src/modules/exercice src/modules/controles --maxWorkers=2
(cd client && npx tsc --noEmit && npx vitest run src/lib/ecart-change.spec.ts)
```
