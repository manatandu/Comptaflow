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
  NOUVEAU groupe entre exercices n'est refusé qu'au DÉTAIL (CONVENTION
  D'OMEGAX, pas une doctrine du CPCC · le cours dit que la clôture « autorise
  : le lettrage et le pointage » ; l'écart est écrit au § 3 de
  `docs/organisation-comptable-cpcc.md`, second tour m7) · lettrage manuel,
  complément, confirmation du pré-lettrage ; le
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
- m4 (premier tour ; son issue « écriture manuelle » est REMPLACÉE au second
  tour, B2) · `ECART_CHANGE_A_CHEVAL_NON_CONSTATE` en AVERTISSEMENT · groupe à
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

## Second tour (relecture adverse sur 8efe29e, deux BLOQUANTS)

Fait, dans l'ordre demandé (B2 et les mineurs, qui ne touchent pas
`calculer`, avant B1) ·

- B2 (459cb82) · le groupe figé reçoit son écart · `passerEcartChange`
  complète le groupe de SA ligne de tiers sous la tolérance nommée de
  `LettrageService.completer` (`groupeTolere`, même nom et même portée qu'à
  A7 ter) · seule la ligne nouvelle doit être libre, aucune ligne figée
  n'est déplacée, la lettre du groupe soldé ne se pose pas sur une ligne
  d'exercice clôturé (posée sous une période close d'un exercice OUVERT,
  sans quoi le report Détail la lirait ouverte), aucun exercice nouveau
  n'entre au Détail. Dénouement dans une période close · report au premier
  jour non clôturé sur demande, date de valeur gardée
  (`reporterAuPremierJourOuvert`, case de l'écran Lettrage, AUDCIF art. 22,
  4°). La proposition ne refuse plus les groupes figés ou à cheval
  (`fige`, `aCheval`). Le contrôle 35 s'éteint une fois l'écart passé
  (testé). Le cas chiffré de la provision (50 000 et non 150 000) dépend de
  `calculer` · il est écrit avec B1.
- m2 (459cb82) · plus aucun « délettrez » dans les issues du contrôle 35 ni
  la proposition · rien à défaire, l'écart se passe sur le groupe, jamais
  par une écriture libre que la réévaluation recompterait.
- m7 (459cb82) · la règle 2 est une convention d'OmegaX · en-têtes de
  `lettrage.service.ts` et `lettrages-a-cheval.ts`, § 3 de
  `docs/organisation-comptable-cpcc.md`, et cette fiche.
- m5, m4 (8732461) · le refus de la borne M6 nomme l'issue qui reste
  (saisie au journal de trésorerie, puis lettrage à la main) ; un règlement
  reporté en francs SANS devise revient en avertissement chiffré, non
  bloquant.
- m6 (58107db) · l'à-nouveau PROVISOIRE est écarté des échéances, compté
  par compte (`aNouveauProvisoireEcartees`, dit à l'écran), et refusé s'il
  est choisi, l'issue nommée · lettré, il ferait refuser la clôture de
  l'exercice précédent.
- m1 (65bd2d2) · `lettrage/paires-a-cheval.ts` · la ligne d'à-nouveau qui
  reporte une facture lettrée avec un règlement de l'exercice et ce
  règlement forment une PAIRE qui se compense, au règlement des tiers
  (ligne éteinte retirée et refusée, reste seul dû et payé, lettrage
  partiel dit) et aux relances. Au Détail, appariement par la copie que le
  report recopie (compte, montants, devise, échéance, libellé), sinon rien ;
  au Solde, sur le solde reporté de la devise. La balance âgée et les notes
  par échéance ne la lisent pas · nommées par le contrôle 35.
- m3 · inscrit à la ligne A7 bis du suivi, sans code · au Détail, le lien
  facture → encaissement de l'exigibilité passe par la ligne d'à-nouveau.

## Troisième tour (après l'intégration d'A5 bis et d'A7 quater sur `main`)

- Fusion de `main` a95f723 (4c4627e) · conflits de `lettrage.service.ts`
  (calcul des propositions dans la transaction d'A7 quater, mise de côté des
  reclassements, partition par exercice au Détail et à-nouveau provisoire
  écarté d'A6 bis, gardés ensemble) et de `controles.service.ts` (traces des
  contre-passations annulées d'A5 bis, relevé des lignes lettrées d'A6 bis).
  Schéma identique à `main`.
- (887e46b) `avertissementExtourneManquante` compte une contre-passation
  DÉCLARÉE (A5 bis, `contrePassationDeclareeId`) comme faite, comme le
  portillon d'A5 bis (`motifContrePassationManquante`). Testé (doublure qui
  honore le filtre).
- B1 avec B-3 (83d7252) · `DevisesService.calculer` · un groupe de lettrage
  n'éteint une ligne que s'il tient TOUT ENTIER dans l'exercice, à la date de
  la réévaluation (`lectureDesGroupes`, `perimetre-reevaluation.ts`) ; sinon
  ses lignes de l'exercice se lisent ouvertes, celles en francs (écart
  réalisé passé sur le groupe) rangées dans la position de la devise du
  groupe. En N+1, le règlement compense l'à-nouveau · rien à doter. Un
  groupe à cheval DÉNOUÉ avant la date (aucune ligne postérieure) dont le
  réalisé n'est pas passé · ce reste sort de la valeur comptable et se nomme
  (« lettrage a · position dénouée », AUDCIF art. 55), jamais réévalué avec
  les autres factures de la devise. En N (B-3), une facture lettrée par un
  règlement de N+1 se réévalue (art. 54). Une disponibilité lettrée reste
  hors de la position, comme avant (A5 bis la relit ainsi). Groupe à cheval
  à plusieurs devises · ses lignes en francs ne se rangent pas, avertissement.
  Tests · `groupes-a-cheval-reevaluation.spec.ts` (Détail au coût historique,
  au payé avec écart passé, écart non passé, SOLDE partiel N et solde N+1,
  B2 50 000 et non 150 000 / charge 150 000 et non 250 000, réalisé non
  passé hors de la seconde facture, B-3 entier et partiel, groupe de N
  éteint, règle pure) ; huit tombent sur l'ancien `calculer`.

### Vraie base (a6bis_1, serveur compilé, port 8093, à travers la clôture de N)

SYSCOHADA, USD · cours 2 800 (10/11/N), 2 750 (01/12/N et 31/12/N), 2 700
(15/03/N+1 et 31/12/N+1). Trois factures de 1 000 USD à 2 800 en N ·
41110000 (A), 41120000 (B), 41150000 (C), comptes au SOLDE pour lettrer
entre exercices (règle 2), B repassé au DÉTAIL avant la clôture. B · 500 USD
encaissés en N par le règlement des tiers à 2 750 (52 1 375 000, 656
25 000, groupe partiel). N+1 · A encaissée au coût historique (52
2 700 000, 656 100 000, C 411 2 800 000), lettrée à la main avec la facture
de N ; B · solde de 500 USD (52 1 350 000, 656 50 000), groupe complété ;
C · encaissée au payé (2 700 000), lettrée en partiel, écart de 100 000
passé sur le groupe (656). H · 500 USD à 2 800 sur 41140000, ouverte.
Réévaluation de N passée APRÈS ces lettrages, clôture de N, contre-passation,
réévaluation de N+1.

| Compte | N attendu | N lu | N+1 attendu | N+1 lu |
|---|---|---|---|---|
| 41110000 | 2 750 000 | 2 750 000 | 0 | 0 |
| 41120000 | 1 375 000 | 1 375 000 | 0 | 0 |
| 41150000 | 2 750 000 | 2 750 000 | 0 | 0 |
| 41140000 | · | · | 1 350 000 | 1 350 000 |
| 52110000 | 1 375 000 | 1 375 000 | 8 125 000 | 8 125 000 |
| 47810000 | 125 000 | 125 000 | 50 000 | 50 000 |
| 49910000 | −125 000 | −125 000 | −50 000 | −50 000 |
| 65600000 | 25 000 | 25 000 | 250 000 | 250 000 |
| 65910000 | 125 000 | 125 000 | 0 | 0 |
| 75910000 | · | · | 75 000 | 75 000 |

Calcul de N · A −50 000, B (500 USD) −25 000, C −50 000 (B-3). Calcul de N+1
· H seule, −50 000 ; requise 50 000, en place 125 000, reprise 75 000.
MÊME SCÉNARIO SUR L'ANCIEN `calculer` (887e46b compilé) · la réévaluation
de N ne voit AUCUNE position (« Aucune position en devise à réévaluer ») ;
celle de N+1 réévalue les trois à-nouveaux (−100 000, −100 000, −50 000) et
H · provision 300 000 au lieu de 50 000, réalisé provisionné une seconde
fois.

## Reste

- Bloc du § 3 passé le 2026-10-03 sur 83d7252 · serveur tsc, construction ;
  jest 723 suites, 10 286 tests, deux en dépassement de 5 s sous charge
  (`restitution.spec.ts`, 25 sur 25 rejoué seul, hors de la ligne) ; client
  tsc, 211 fichiers, 1 725 tests, construction. Schéma inchangé (aucune
  dérive à contrôler). À l'intégration · relire le numéro du contrôle (35,
  le 34 étant celui d'A5 bis), relecture du deuxième tour.
- Non fait, renvoyé · le contrôle qui nommerait les réévaluations DÉJÀ
  passées que B-3 aurait changées (groupe, compte, montant en devise, issue
  · annuler et réévaluer, D6).
- Relevé · `lireLaReevaluation` (reglements) reconstitue « le compte tel
  qu'il était » sans la règle de B1 (lignes lettrées par un groupe à cheval,
  lignes en francs) · pour un groupe à cheval, la concordance avec une
  réévaluation passée sous la nouvelle règle peut manquer et l'écart passe
  avec un AVERTISSEMENT au lieu de rien (jamais un refus faux constaté).
  Un groupe à cheval dont la seule ligne de l'exercice est en francs n'est
  pas relu (aucune ligne en devise pour le trouver).

## Relevés (hors périmètre, non traités)

- Paire à cheval (m1) · une paire qui AJOUTERAIT au dû (au Solde, une
  facture de l'exercice lettrée avec un acompte antérieur) n'est pas lue ·
  le dû n'en est que minoré, jamais payé deux fois. La balance âgée et les
  notes par échéance (`ouverteALaCloture`) ne lisent pas la paire.
- Une ligne d'à-nouveau réglée EN PARTIE par une paire, payée par le
  règlement des tiers, laisse son lettrage partiel de la part que le groupe
  à cheval a réglée (les deux groupes ne se fondent pas).

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
- B2 (premier tour, consigne du coordinateur) · CONVENTION D'OMEGAX (second
  tour m7 · ce n'est pas une doctrine du CPCC, dont le § 2.3 dit que la
  clôture « autorise : le lettrage et le pointage » ; l'écart est écrit au
  § 3 de `docs/organisation-comptable-cpcc.md` et en tête de
  `lettrage.service.ts`) · « un règlement de mars qui solde une facture de
  décembre se lettre contre la ligne de REPORT À-NOUVEAU de l'exercice
  ouvert (MODE DÉTAIL des comptes de tiers) » · la règle vise le Détail, le
  SOLDE reste libre ; AUDCIF
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
- B2 (second tour) · AUDCIF art. 55 (« à la date de règlement [...] les
  pertes et gains de change [...] sont constatés ») et Titre VIII ch. 22
  § 2.3 · l'écart appartient au règlement qui dénoue ; le gel est une
  convention de Sage i7 (`gel-cloture.ts`), qui ne peut pas l'empêcher.
  AUDCIF art. 22, 4° · le dénouement daté dans une période close
  s'enregistre au premier jour non clôturé, date de valeur gardée, sur
  demande (arbitrage du 2026-09-24). AUDCIF art. 20 et « on ne peut pas
  modifier les enregistrements d'exercice clôturé » (Sage i7) · la ligne
  d'un exercice clôturé ne reçoit pas la lettre du groupe soldé.
- m2 · A6, D3 (« jamais un second passage ni un délettrage, qui ferait
  glisser le réalisé au 479 ») · l'issue n'est jamais de délettrer.
- m6 · la clôture refuse de remplacer un à-nouveau provisoire lettré
  (`ExerciceService`, « délettrez-les ») · l'à-nouveau provisoire ne se
  règle pas par le règlement des tiers ; l'issue reste ouverte (saisie au
  journal, lettrage avec l'à-nouveau définitif).

## Vérification

```bash
npx tsc --noEmit
npx jest src/modules/reglements src/modules/lettrage src/modules/relances src/modules/exercice src/modules/controles --maxWorkers=2
(cd client && npx tsc --noEmit && npx vitest run src/lib/ecart-change.spec.ts src/pages)
```
