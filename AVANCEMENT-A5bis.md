# Ligne A5 bis · la contre-passation ne touche pas les disponibilités

Branche de sauvegarde · `travail/a5bis`. Part de `main` (8e15ce7).

## Défaut

`DevisesService.extourner` contre-passait à l'ouverture de l'exercice suivant
TOUTES les lignes de l'écriture des écarts, y compris celles des
disponibilités en devise (52, 53, 55, 57, 58) et de leur contrepartie
676 / 776.

## Lu (règle n° 1)

- AUDCIF art. 54 · créances et dettes, écarts au 478 / 479, latents.
- AUDCIF art. 57 · disponibilités, « les écarts constatés sont inscrits
  directement dans les produits et charges de l'exercice comme gains ou
  pertes de change ».
- Titre VIII ch. 22 § 2.2 · disponibilités exclues de la position globale,
  « les écarts de change étant comptabilisés immédiatement en résultat » ;
  section 4 · « inscrit directement dans les produits et charges financiers
  de l'exercice clos ».
- Fiche du compte 676 (AUDCIF Titre VII et SYCEBNL Partie 2 ch. 3) · écarts
  négatifs sur disponibilités = « pertes de change supportées », 676 « ne
  doit pas être confondu avec le compte 478 ».
- Fiche des comptes 478 / 479 (AUDCIF et SYCEBNL) · « pertes et gains
  latents », « entre créances et dettes en devises ».
- Guide SYSCOHADA, Partie 2 ch. 22 · Application 84 (contre-passation au
  01/01/N+1 : 411 · 4781, 4791 · 411), Application 85 (4793 · 4812),
  Application 86 (disponibilités · 676
  / 5215, « sans écart de conversion », aucune contre-passation).

Décision · ne se contre-passent que l'écart de conversion (478, 479 et le
compte de tiers qu'il ajuste) ; rien des disponibilités.

## Fait

1. `extourner` ne contre-passe que l'écart de conversion · partage par la
   RACINE (`ecarts-disponibilites.ts`, `partagerLignesDEcarts` · 52, 53,
   55, 57, 58 et 676 / 776 restent), deux parts équilibrées sinon refus
   nommé ; réévaluation des seules disponibilités · refus nommé (rien à
   contre-passer).
2. La banque part en N+1 de sa valeur de clôture de N · l'écart de chaque
   disponibilité est gardé (`Reevaluation.ecartsDisponibilites`, migration
   `20270124000000`) et `calculer` l'ajoute à la valeur comptable par
   `ecartsReportesDesDisponibilites`, en remontant les reports d'OmegaX
   (SOLDE et DÉTAIL), jamais par libellé. Réévaluation antérieure sans
   écart gardé · relu sur son écriture (une seule devise sur le compte, ou
   cours gardé D5 et somme au centime), sinon réserve et passage refusé.
   À-nouveau provisoire antérieur à la validation de l'écart · réserve.
   Ancien régime (contre-passation qui a inversé la banque) · rien reporté,
   total juste (gain N+1 net de la contre-passation).
3. `reevaluerSousVerrou` refuse tant que la réévaluation de l'exercice
   précédent porte un 478 / 479 non contre-passé (Applications 84 et 85),
   issue nommée.
4. Contrôle 34 (A13 tient le 32 et le 33) `CONTRE_PASSATION_DE_DISPONIBILITE` (INFORMATION) · les
   anciennes contre-passations qui ont inversé une banque ou une caisse,
   issue selon l'exercice de la réévaluation (D6 si ouvert ; sinon au
   cabinet, sans repasser la ligne de la banque à la main).
5. Commentaire de `report-a-nouveau.ts` mis à jour.

Décision non tranchée par le texte, retenue · la valeur de la banque en
N+1 se lit par la chaîne des réévaluations, l'à-nouveau ne portant pas
l'écart sur la ligne de sa devise (écart passé sans devise, F55).

6. Rattachée à main 5d388c0 (A11, A13, A10) par un merge · doublures
   `reevaluation.findMany` posées aussi dans les specs d'A13 ; migration
   renumérotée `20270124000000` ; `prisma migrate diff` sur base jetable ·
   « No difference detected ». A13 reconnaît la contre-passation par
   liaison, elle ne porte simplement plus de ligne de banque.

## Premier tour de relecture (2026-10-03) · corrigé

- M4 · citations · Application 84 (« 411 · 4781 »), 85 (« 4793 · 4812 »),
  86 ; anomalie « Selon l'article 58 » de la section 4 signalée (la règle
  est à l'art. 57).
- B1 · une réévaluation antérieure n'enferme plus le dossier · (a) devise
  nulle en devise ET en francs ignorée ; (b) à défaut du cours gardé, cours
  de la table à sa date, vérifié au centime ; (c) à défaut, VENTILATION
  DÉCLARÉE par devise avec sa source (`POST
  /devises/reevaluations/:id/ventilation-disponibilites`, update unitaire au
  journal d'audit, sous le verrou, ouverte même sur exercice clos, refusée
  si la ligne se relit, figée dès qu'une réévaluation postérieure l'a lue) ;
  (d) la réserve nomme la déclaration, l'annulation seulement si l'exercice
  est ouvert. Relecture du compte TEL QU'IL ÉTAIT (saisi avant elle, sauf
  l'à-nouveau du début ; lignes alors ouvertes).
- M5 · sommes par `groupBy` (compte, devise, sens), comme
  `lireComptesDuReport`.
- M3 · « relancez l'à-nouveau provisoire, ou clôturez l'exercice
  précédent » ; « validez » seulement si l'écriture des écarts est au
  brouillard.
- `extourner` n'écrit plus `ecartsDisponibilites` · nul = ancien régime.
- M1 · `extourner` n'accepte que l'exercice qui suit IMMÉDIATEMENT ; le
  portillon vérifie que la contre-passation est dans l'exercice réévalué ;
  issue d'une contre-passation mal placée · `POST
  /devises/reevaluations/:id/contre-passation/annuler` (motif, réservée au
  comptable, brouillard supprimé filtré sur le statut, validée en négatif,
  update unitaire, trace `annulationsContrePassation`) ; le report ne tient
  une inversion pour faite que dans l'exercice qui suit.
- B3 · `reporterAuPremierJourOuvert: true` (art. 22, 4°), dit au portillon.
- B2 · exercice suivant réévalué sous l'ancien régime · contre-passation
  INTÉGRALE imposée, dite au libellé et dans la réponse
  (`contrePassationIntegrale`) · banque N+1 1 505 000 et non 1 605 000,
  gain N+1 41 000 et non 141 000 (test chiffré).
- M2 · écriture qui ne se partage pas · contre-passation intégrale à
  demander (`integrale`), refusée ailleurs.
- M6 · `extourner` sous le verrou, lien par update unitaire.
- M7 · contrôle 34 · phrase de l'exercice clos seulement s'il l'est ;
  préalables de D6 nommés ; intégrale par exception dite.
- M8 · Devises · « Rien à contre-passer » pour les seules disponibilités,
  bouton vers l'exercice qui suit immédiatement (servi par le serveur,
  `contrePassationAPasser`, `exerciceDeContrePassation`), bulle (art. 57),
  « Annuler la contre-passation », « Ventiler l'écart des disponibilités ».

Migration `20270124000000` complétée (six colonnes, non encore sur main) ;
`prisma migrate diff` · « No difference detected » ; formes de requête
éprouvées sur base jetable (filtre JSON DbNull, update à filtre étendu,
groupBy à référence de champ).

Rattachée à main f4ab9bb. Bloc du § 3 passé après le second tour · serveur 10005
tests (`npx jest --maxWorkers=2`), client 1698, typages et constructions.

## Second tour de relecture (2026-10-03) · corrigé

- B-I · l'inversion de la banque par une contre-passation se lit dans TOUT
  exercice traversé depuis la cible (`parcourus`), pas dans le seul
  exercice qui suit · contre-passation de N posée en N+2, ou N+1 clôturé
  sans réévaluation · banque de N+2 à 1 600 000 et non 1 500 000 (deux
  variantes chiffrées). Contrôle 34 · plus de « le résultat net en sort
  juste » · le résultat cumulé, une fois la réévaluation passée.
- B-II · `cibleDeContrePassation` · l'exercice qui suit immédiatement s'il
  est ouvert, sinon le premier ouvert après des clôturés (la
  contre-passation du 478, du 479 et des tiers ne touche que le bilan) ;
  `extourner`, la liste, `lib/contre-passation.ts` et Devises s'y alignent.
  Le portillon lit la DERNIÈRE réévaluation non annulée antérieure, à
  travers les exercices sans réévaluation, nomme la cible, et tient une
  contre-passation pour à sa place au plus tard dans l'exercice réévalué
  sans exercice ouvert entre la réévaluation et elle · 411 à 2 600 000 (et
  non 3 100 000), 479 à −600 000 (et non −1 100 000). B2 se lit sur
  l'exercice qui reçoit la contre-passation.
- m1 · la ventilation ne porte que les devises lues sur le compte, toutes
  déclarées ; chaque montant borné par ce que le calcul permet (valeur du
  signe du montant en devise, cours positif ; devise soldée · l'opposé de
  ses francs), rien au-delà (cours d'alors non gardé, aucun texte), dit ;
  l'écran montre le cours implicite.
- m2 · l'issue du contrôle 34 se règle sur l'exercice qui PORTE la
  contre-passation (ouvert · « Annuler la contre-passation » puis la
  repasser ; clôturé · la phrase d'avant).
- m3 · le contrôle 32 écarte la contre-passation annulée et son négatif,
  nommés par `annulationsContrePassation`.

## Troisième tour (2026-10-03) · corrigé

Relu · compétence `syscohada`, Partie 2 ch. 22 · « Écarts de conversion à
la clôture (478 actif / 479 passif), contrepassés à la réouverture » ;
Application 84 (« Contrepassation de l'écart au 01/01/N+1 : 411 · 4781 »,
« 4791 · 411 »), Application 85 (« 4793 · 4812 »), Application 86 (aucune
contre-passation des disponibilités). Cité tel quel dans le module.

- BLOQUANT · le portillon juge TOUTES les réévaluations non annulées
  antérieures (cinquante au plus, tri stable, dépassement dit avec la
  réévaluation passée) par la même règle · écart de conversion non
  contre-passé, ou contre-passation hors de sa place. Le refus nomme
  l'exercice, la date et les montants à contre-passer, et les deux issues.
  Scénario s11 chiffré · N+2 refusé en nommant N ; N contre-passée dans
  N+2 · 411 à 2 600 000, 479 à −600 000.
- PORTE · une contre-passation faite à la main se DÉCLARE (`POST`, `DELETE`
  `/devises/reevaluations/:id/contre-passation-manuelle`, réservées au
  comptable ; candidates proposées par `GET .../candidates`, bornées). Le
  serveur vérifie · inversion exacte au centime de chaque compte de l'écart
  de conversion (autres comptes admis) ; place (exercice après la
  réévaluation, aucun ouvert entre les deux) ; ni liée à une réévaluation,
  ni déjà déclarée, ni neutralisée, ni engendrée par la clôture ; même
  dossier. Au journal d'audit (motif, date, auteur), écriture RETENUE
  (`detenteurs-ecriture.ts`, RESTRICT). Couverte, la réévaluation est
  contre-passée pour le portillon, le contrôle 34 (banque inversée par
  l'OD déclarée, compte par compte) et `calculer` (banque revenue au coût
  historique, compte par compte). Retrait tant qu'aucune réévaluation d'un
  exercice commençant au plus tôt avec celui de l'écriture ne s'y appuie.
  `extourner` et l'annulation D6 refusent une réévaluation déclarée, issue
  nommée. Écran · « Déclarer une contre-passation manuelle » et « Retirer la
  déclaration » sous `peutValider`. Migration `20270124000000` complétée.
- Mineur 1 · une réévaluation sans écart de conversion n'est plus jugée sur
  sa place ; contrôle 34 · « rien à repasser » au lieu de « repassez-la ».
- Mineur 2 · un champ vide de la ventilation est refusé avant l'envoi
  (`lib/ventilation-disponibilites.ts`), « tapez 0 ».
- Mineur 3 · traces des contre-passations annulées lues dans un ordre
  stable ; le contrôle 32 dit la lecture bornée.

## Reste

- Relectures (silent-failure-hunter, typescript-reviewer, react-reviewer)
  à l'intégration.
- `reglements/reevaluation-et-ecart-realise.ts` (avertissement
  d'extourne manquante, A6) ne lit que `ecritureExtourneId` · une
  contre-passation déclarée n'y compte pas encore pour faite. Laissé à
  A6 bis, qui touche ce fichier et `calculer`.
- Contrôle 32 · une OD manuelle déclarée qui inverse aussi la banque compte
  comme une opération de banque (dernière ligne d'un compte fermé) · non
  traité (l'OD peut grouper de vraies opérations de banque).
- Un bilan d'ouverture SAISI qui aurait déjà retiré l'écart de N n'a pas
  d'écriture à déclarer · le portillon demanderait une contre-passation
  qui n'a pas lieu d'être. Cas non rencontré, à trancher si un dossier repris
  le présente (même risque qu'avant ce tour pour la dernière réévaluation).
- A10 (`uniteDeLaCaisse`) écarte les écritures d'écarts de réévaluation,
  pas la part reportée en francs par l'à-nouveau · une caisse en devise
  réévaluée en N se lit « mêlée » en N+1 (déjà le cas avant A5 bis, la
  contre-passation étant elle aussi en francs). Non traité ici.

## Vérification

```bash
npx tsc --noEmit
npx jest src/modules/devises src/modules/controles/contre-passation-de-disponibilite.spec.ts
cd client && npx vitest run src/lib/contre-passation.spec.ts src/lib/reevaluation-cloture.spec.ts
```
