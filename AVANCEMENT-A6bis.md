# AVANCEMENT · ligne A6 bis (défauts de production de l'écart de change réalisé)

Branche de sauvegarde · `travail/a6bis`, partie de `origin/main` 5d388c0.
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
  au journal avec devise et cours).
- B2 · `lettrage/lettrages-a-cheval.ts`. (1) Un groupe ne mêle jamais deux
  exercices · refus nommé au lettrage manuel, au complément, à la confirmation
  du pré-lettrage ; le lettrage automatique et le pré-lettrage jouent
  exercice par exercice ; l'écart de change n'est pas proposé sur un groupe à
  cheval (motif · délettrer), donc `passerEcartChange` le refuse. (2) Groupes
  DÉJÀ en base · jamais réécrits ; la clôture et l'à-nouveau provisoire les
  refusent par un message nommé (groupe, compte, exercices, issue) au lieu du
  500, AVANT la garde D3 ; D3 ne lit plus les groupes à cheval et dit à part
  que ceux-là seuls se délettrent ; le délettrage reste possible tant que les
  exercices sont ouverts (testé). Contrôle 34 · `LETTRAGE_A_CHEVAL_D_EXERCICES`
  BLOQUANT (la clôture refuse), `LETTRAGE_A_CHEVAL_FIGE` INFORMATION (figé par
  un exercice clôturé, ne fausse rien, aucun geste). Tests · lettrage (six),
  module (onze, dont la reproduction du report déséquilibré, la clôture, le
  provisoire et le câblage du contrôle).
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
  chacun de son côté, sans lien (test de `lignesReportANouveau`). Le
  règlement en devise se borne · (1) au dû des factures choisies moins les
  règlements, acomptes et avoirs REPORTÉS par l'à-nouveau hors de tout
  groupe (colonne du règlement, signe compris · une inscription en négatif
  annule), refus nommé avec l'issue (régler au plus le reste, compléter le
  lettrage avec la ligne d'à-nouveau, ou la lettrer d'abord avec son autre
  facture) ; (2) au reste dû du COMPTE dans la devise (lignes non soldées de
  l'exercice, groupes partiels compris). Tests · six (vérification du
  report, fournisseur et client, clôture et provisoire, lettrée ou annulée,
  compte entier, requête).

## Reste

- Rien dans la ligne. Bloc du § 3 passé le 2026-10-03 sur 9b553b7 ·
  serveur `tsc`, `jest --maxWorkers=2` (709 suites, 9 962 tests),
  `npm run build` ; client `tsc`, `npm test` (206 fichiers, 1 687 tests),
  `npm run build`. Restent la relecture, l'intégration sur `main` et les
  tests navigateur.

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
- B2 · doctrine CPCC (ch. 6, en tête de `lettrage.service.ts`) · le règlement
  de N+1 se lettre contre la ligne d'à-nouveau ; AUDCIF art. 20 · les groupes
  existants ne sont pas réécrits ; gravité BLOQUANT du contrôle pour les
  groupes que la clôture refuse (même sens que les autres BLOQUANT ·
  « la clôture refuse »), INFORMATION pour les figés qui ne faussent rien.
  Non tranché par le texte · un groupe SOLDÉ figé par un exercice clôturé
  et dont la part de l'exercice n'est pas nulle (atteignable seulement si le
  compte a changé de mode de report après coup) · refus nommé, aucune issue
  dans OmegaX, dit tel quel.
- M6 · aucun lien ne relie une ligne d'à-nouveau à sa facture d'origine
  (`report-a-nouveau.ts` ne recopie ni groupe ni référence) · la borne est
  PROTECTRICE (lecture du § 10 bis) · tout règlement reporté non lettré est
  lu contre la facture réglée, l'issue étant de le lettrer d'abord avec la
  sienne. Aucune migration (le schéma ne bouge pas).
- M4 · écart à la consigne · l'« ordre de `ligneIds` » n'est gardé nulle
  part, D4 ne pourrait pas le rejouer ; l'identifiant de ligne, si.

## Vérification

```bash
npx tsc --noEmit
npx jest src/modules/reglements src/modules/lettrage src/modules/exercice --maxWorkers=2
(cd client && npx tsc --noEmit && npx vitest run src/lib/ecart-change.spec.ts)
```
