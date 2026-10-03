# Avancement · ligne A10

Caisse comptée après le 31 décembre · solde lu au livre-journal à la date du
comptage et reconstitution vers la clôture dans le PV de caisse (AUDCIF
art. 16 ; fiche du compte 57) · relevé CPCC C6, décision de Manasse du
2026-10-02. Branche de sauvegarde `travail/a10`.

## Fait

1. Serveur · `src/modules/inventaire/solde-caisse-au-comptage.ts` (lecture du
   solde au livre-journal à la date du comptage, reconstitution vers la
   clôture, refus nommés), branché dans `InventaireService.etablirPvCaisse` ;
   le solde n'est plus reçu de l'écran (`EtablirPvCaisseDto.soldeComptable`
   retiré, refusé par la liste blanche). Quatre colonnes figées sur
   `ProcesVerbalComptageCaisse` (migration écrite à la main
   `20270120000000_pv_caisse_reconstitution`). `consulter` sert les PV de
   caisse (`presenterPvCaisse` · espèces reconstituées à la clôture,
   `reconstitutionManquante` pour un PV d'avant la règle) ; route de lecture
   `GET /inventaire/pv-caisse/:pvId/mouvements` (lignes telles que le PV les a
   lues, tranche de 500 avec `total` et `tronque`, `concorde` contre les
   totaux figés). Tests · `solde-caisse-au-comptage.spec.ts` (doublure qui
   honore les filtres), doublures des trois specs existants complétées.

2. Écran · `InventairePage.tsx` · la saisie du solde est retirée (mention
   « Solde comparé · livre-journal au jour du comptage » et bulle `Aide`) ;
   `BlocPvCaisse` montre les PV établis, même campagne close · solde à la
   clôture, encaissements, paiements, solde au jour du comptage, espèces
   comptées, espèces reconstituées à la clôture, écart ; PV d'avant la règle
   signalé ; bouton « Mouvements intercalés » (échec dit, tranche dite,
   discordance dite). Types `ProcesVerbalCaisse`,
   `MouvementsReconstitutionCaisse`. Tests ·
   `inventaire-pv-caisse-reconstitution.spec.ts`, route ajoutée à
   `inventaire-gestes-a-lecran.spec.ts`.

3. Bloc du § 3 passé des deux côtés (2026-10-03). Serveur · `tsc` vert,
   `npm run build` vert, `npx jest --maxWorkers=2` · 701 suites, 9 537
   tests ; 24 suites tombées par processus tués (manque de mémoire, trois
   agents en parallèle) ou délai de 5 s dépassé, relancées seules en
   `--runInBand` · toutes vertes. Client · `tsc`, 204 fichiers et 1 661
   tests verts, `npm run build` vert.

## Seconde passe (corrections du premier tour, 2026-10-03)

4. Serveur · B1 caisse en devises (unité DEVISE si toutes les lignes lues
   portent une seule devise, écarts de réévaluation A5 écartés ; sinon
   FRANCS_COURS_HISTORIQUES, sans refus, mention sur le PV), migration
   réécrite (enum ModeComparaisonCaisse, deviseId, mouvementsValeurAvantCloture),
   (a) aperçu GET :id/pv-caisse/apercu, (b) lecture et création dans une
   transaction, P2002 en 409 nommé, (c) concordance du solde à la clôture
   relu et saisies depuis le PV, (d) opérations de N+1 à date de valeur
   antérieure à la clôture isolées, (e) date AAAA-MM-JJ (@Matches et
   lireDateComptage), (f) bilan importé dans N+1 prouvé écarté, (g) mentions
   servies par le serveur (mentionsDuPv).
5. Écran · aperçu affiché avant « Établir le PV » (bouton fermé tant que
   l'aperçu n'est pas favorable), unité de la caisse sur les espèces et les
   coupures, mentions du serveur, (i) réponses périmées jetées au changement
   de campagne (`campagneAffichee`), (j) `scope`, (k) écart dit par un mot,
   (l) tests de structure (clés du corps envoyé, garde découpée par
   équilibrage), (m) dates du bloc en UTC.

## Reste

- Rien côté construction · relecture adverse et intégration.

## Décisions, avec leur article

- **Le solde comparé est celui du livre-journal à la DATE DU COMPTAGE**, lu
  par le serveur · fiche du compte 57 (AUDCIF Titre VII ; SYCEBNL Partie 2
  ch. 3), « Le solde du compte caisse doit toujours correspondre exactement à
  la somme disponible réellement » ; AUDCIF art. 16, al. 4, « la valeur de
  chacun d'eux à la date de l'inventaire ». Vaut aussi pour un comptage
  ANTÉRIEUR à la clôture (son solde à SA date, sans reconstitution) · le
  solde saisi à la main, proposé sur l'exercice entier brouillard compris,
  était un montant reçu du client.
- **Reconstitution vers la clôture quand le comptage la suit** · AUDCIF
  art. 42 (« À la clôture de chaque exercice […] recensement ») ; art. 16,
  al. 5 (« organisées et conservées de manière à justifier ») ; CPCC, § VI
  « Le comptage des espèces a-t-il eu lieu au 31 décembre ? » et « Y a-t-il
  un chevauchement avec l'exercice en cours sur le solde d'ouverture ? ».
  Solde au comptage = solde à la clôture + encaissements − décaissements
  postérieurs ; espèces à la clôture = espèces comptées − encaissements +
  décaissements, même écart. TOTAUX FIGÉS sur le PV, LIGNES servies à la
  lecture pour le chemin de révision (art. 22, 6°) · aucun texte n'exige le
  détail sur le PV même. Témoin, non source · ISA 501 § 5.
- **Livre-journal seul** (art. 22, 2°) · une ligne au BROUILLARD sur la
  caisse, à prendre en compte, REFUSE le PV (même règle que le rapprochement
  de la campagne, audit final F6).
- **Report à-nouveau des exercices suivants écarté** (validé ou provisoire) ·
  il reprend la clôture, déjà lue sur l'exercice de la campagne.
- **Date de valeur** (art. 22, 4° ; art. 16, al. 2, « dans l'ordre de leur
  date de valeur comptable ») · une opération reportée au premier jour d'une
  période ouverte se lit à sa date de valeur.
- **Exercice suivant non ouvert, ou trou entre exercices** · solde NON
  calculable, refus nommé (ouvrir l'exercice, saisir et valider les
  mouvements), jamais « aucun mouvement ».
- **Ouverture provisoire de l'exercice de la campagne** · refus nommé (elle
  ne se valide jamais, clôturer l'exercice précédent).
- **Date du comptage** avant l'ouverture de l'exercice de la campagne, ou
  future (jour de Kinshasa) · refusée.
- **Le livre-journal n'a pas d'heure** · le solde est celui de la journée du
  comptage entière ; un mouvement du jour postérieur à l'heure du comptage
  s'explique en observation (ajout de l'éditeur, comme l'heure).

## Ce que le corpus ne tranche pas

- La forme de la reconstitution sur le PV (ligne à ligne ou total) · aucun
  texte lu ne la fixe ; totaux figés, lignes servies.
- Une caisse en devises (5712 au SYSCOHADA, 572 au SYCEBNL) · le corpus ne
  dit pas dans quelle monnaie se compare un comptage ; la fiche du compte 57
  exige l'égalité avec « la somme disponible réellement », comptée dans sa
  monnaie, et le Titre VIII ch. 22, section 4 ne régit que la conversion au
  cours de clôture (réévaluation, A5). Tranché · comparaison dans la devise
  quand toutes les lignes la portent, francs au cours historique sinon, dit.
  Le ch. 22 § 4 rattache cette conversion à « l'article 58 », que l'AUDCIF
  lu consacre à la position globale de change · anomalie de renvoi, écrite
  dans le code.

## Vérification

```bash
npx tsc --noEmit && npx jest && npm run build
(cd client && npx tsc --noEmit && npm test && npm run build)
npx jest src/modules/inventaire
```
