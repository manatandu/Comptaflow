# Relevé de manques · les Actes uniformes OHADA hors comptabilité

Journal des passes O1 à O7 du plan `docs/plan-confrontations.md`. Même méthode
que les relevés fiscal et référentiels · lecture sans le code, confrontation,
réfutation d'un constat par un agent payé pour le démolir, correction par la
session principale seule, après relecture de la ligne source.

---

## Passe O7 · AUA, AUM et AUCTMR (2026-09-28)

Trois petits actes lus ensemble, en un run · l'Acte uniforme relatif au droit
de l'arbitrage (397 lignes), l'Acte uniforme relatif à la médiation (193) et
l'Acte uniforme relatif aux contrats de transport de marchandises par route
(329). 6 agents, 7 minutes, **219 obligations extraites** (46, 79, 94),
**aucun constat**. Rien n'est corrigé, et c'est le résultat attendu · la
consigne de la passe demandait des « rien à faire » motivés.

**LE DÉPÔT NE CITE AUCUN DES TROIS TEXTES.** Aucun article, aucun délai, aucune
règle de responsabilité ne leur est prêté · il n'y avait donc rien à vérifier
de ce que le dépôt AFFIRME, qui est d'ordinaire là que les passes trouvent.
Les « arbitrages » du code sont des choix de lecture ou le statut ARBITRAGE des
campagnes d'inventaire ; les prescriptions citées viennent de l'AUDCG (art. 259,
devis), jamais de l'AUCTMR (art. 25).

**CE QUE LE LOGICIEL RENCONTRE DE CES TEXTES, IL LE SERT PAR SES VOIES
GÉNÉRIQUES, sans rien présumer.** Huit points relevés servis :
- le registre des provisions (nature LITIGE) enregistre l'objet et le statut
  sans évaluer ni poster · compatible avec une sentence, un recours en
  annulation encore ouvert (AUA art. 25 et 28) ou un accord de médiation
  (AUM art. 12 et 16), dont c'est l'écrit qui fonde l'ajustement ;
- les rubriques « Actif / Passif éventuel · Litiges » des notes annexes, et le
  litige tranché rangé parmi les événements postérieurs qui ajustent ;
- les documents attachés aux tiers, qui conservent la convention d'arbitrage,
  la sentence (AUA art. 31) et les pièces d'une médiation (AUM art. 22) ;
- l'exclusion de relance motivée par un litige, qui porte sur le courrier et
  jamais sur la créance · elle couvre l'engagement de ne pas agir pendant une
  médiation (AUM art. 33) ;
- le contrôle `TIERS_ANCIEN_NON_LETTRE`, qui ne présume jamais une créance
  prescrite.

**CE QUI EST SANS OBJET, ET POURQUOI.** Constitution et récusation du tribunal
ou du médiateur, contradictoire, forme de la sentence, exequatur, lettre de
voiture, réserves, droit de disposition, plafond d'indemnisation par
kilogramme, délais d'avis, transporteurs successifs · tout cela règle les
rapports entre parties, arbitres, médiateurs, transporteurs et juges. Aucune
de ces règles ne prescrit d'écriture, de compte ni de mention d'état, et les
délais qu'elles fixent dépendent de faits hors des livres. Les calculer
fabriquerait des signalements plausibles et faux (CLAUDE.md § 10 bis). Les
stocks en cours de route restent régis par le Titre VII de l'AUDCIF et les
fiches du SYCEBNL, que leurs contrôles citent déjà.

---

## Passe O2 · AUDCG hors Livre 8 (2026-09-28)

Livres 1 à 7 de l'Acte uniforme relatif au droit commercial général ·
commerçant et entreprenant, RCCM, Fichiers, bail et fonds de commerce,
intermédiaires. Le Livre 8 (vente) avait été lu pour le devis et n'est pas
reconfronté. 12 agents, 16 minutes, **321 obligations**, 8 constats réfutés un
à un, **2 écartés, 6 retenus, tous corrigés**. Chaque constat a été relu à sa
ligne source (art. 14, 35, 59, 62, 64, 138 et 140) avant correction.

### Corrigés

| Constat | Gravité | Ce qui était faux | Ce qui est fait |
|---|---|---|---|
| S18 | INCOMPLET | Les livres de commerce exportés (journal, grand livre, balances) ne portaient pas le numéro RCCM, que l'art. 14 exige. Le dépôt citait la règle, et ne l'appliquait qu'à la liasse. | `IdentiteEtat.immatriculation`, dans la coiffe et le pied de chaque état · le numéro, ou « RCCM non renseigné », jamais un blanc. |
| S67 | INCOMPLET | La mention RCCM des pièces ne passait que par la ligne de l'AUSCGIE art. 17, réservée aux cinq sociétés · un commerçant, un GIE, une succursale émettaient sans RCCM, et la liste des manques était vide. | `tenant/mentions-immatriculation.ts` (art. 59) et `mentionsEmetteur`, qui réunit les deux règles · factures, devis, en-têtes d'impression, ordres de virement et signature des relances. |
| S70 | INCOMPLET | L'entreprenant n'avait qu'un champ « RCCM », imprimé comme un numéro d'immatriculation, alors que l'art. 64 lui interdit d'être immatriculé et que l'art. 62 lui fait porter son numéro de déclaration et la mention « Entreprenant dispensé d'immatriculation ». | `Tenant.numeroDeclarationActivite` · refusé aux autres formes, le RCCM refusé à l'entreprenant ; la migration déplace ce qu'il avait saisi ; la liasse le nomme comme tel. |
| B65 | INCOMPLET | La qualité de locataire-gérant (art. 140, sanction pénale) n'avait aucun porteur. | `Tenant.locataireGerantFonds` (null = pas encore dit), refusé à l'entreprenant (art. 138) et à une EBNL ; la qualité s'imprime en tête, avec le RCCM. |
| S43 | FAUX | L'aide, les types et le service attribuaient à l'art. 2 la liste des assujettis au RCCM · l'art. 2 définit le commerçant, la liste est à l'art. 35, 1°, et le schéma en tronquait la citation. | Aide, source affichée, commentaires et schéma alignés sur l'art. 35, 1°. |
| (jumeau) | INCOMPLET | L'avertissement des pièces ne se disait que sur une ligne non vide · un commerçant sans RCCM, sans ligne, ne voyait rien. | `avertissementArticle17` dit le manque dès qu'il y en a un, et nomme l'AUDCG quand c'est lui. |

### Écartés par la réfutation

F9 (les art. 75 et 87 visent le Fichier national et les greffes, pas un
logiciel comptable), I39 (la règle du mandataire appliquée au commissionnaire,
qui agit en son propre nom · la source dit l'inverse).

### Ce que la passe apprend

**UNE RÈGLE ÉCRITE DANS UN COMMENTAIRE ET APPLIQUÉE À UN SEUL ENDROIT.** Le
dépôt écrivait que « l'AUDCG art. 14 impose d'en porter le numéro sur les
livres de commerce », et ne le faisait que sur la liasse. Même famille que la
restriction écrite et non codée de la passe F6 · le jumeau se cherche par la
RÈGLE (tous les livres), pas par le fichier où la phrase est écrite.

**UNE LISTE DE MANQUES VIDE SE LIT COMME CONFORME.** La ligne de l'art. 17
rendait `manquantes: []` hors des sociétés, ce qui disait « rien ne manque » à
un commerçant qui n'avait pas de RCCM. Une règle hors de son périmètre doit
rendre « pas de réponse », et c'est à une autre règle de parler.

## Passe O3 · Acte uniforme portant organisation des sûretés (2026-09-28)

L'AUS révisé du 15 décembre 2010 confronté au dépôt, en quatre blocs (titre
préliminaire et sûretés personnelles ; inscription, rétention et réserve de
propriété ; gage, nantissement et privilèges ; hypothèques et distribution).
25 agents, 20 obligations servies, 21 constats réfutés un à un, **11 écartés,
10 retenus (7 écarts distincts, A1 et D1, B1 et C1, C4 et D5 visant le même
défaut) dont 2 FAUX, tous traités**.

### Corrigés

| Constat | Gravité | Ce qui était faux | Ce qui est fait |
|---|---|---|---|
| A1, D1 | FAUX | Les colonnes Hypothèques, Nantissements et Gages/autres de la NOTE 1 « Dettes garanties par des sûretés réelles » se disaient « en saisie » et ne l'étaient pas, aux deux référentiels · un blanc se lisait « aucune sûreté ». | La cellule LIBRE d'une rubrique chiffrée se saisit (`cellules-libres-en-saisie.ts`), totaux et colonne « Note » exclus, écran et liasse ; jumeaux ouverts (nature du contrat, régime fiscal, échéances) et liste fermée des colonnes laissées vides, chacune avec son motif. |
| B1, C1 | FAUX (commentaire) | Le tableau des engagements financiers disait que « hypothèques, nantissements, gages » « n'a que des hypothèques en 9023/9063 ». | Réécrit · 9028 et 9068 portent le gage et le nantissement, la classe 9 est facultative, la réserve de propriété est aux 9043 et 9083 ; la ligne reste en saisie. |
| B2 | INCOMPLET | Le ch. 9 § 3 (AUDCIF Titre VIII) veut en Notes annexes quatre montants frappés de réserve de propriété ; seul le montant clients était servi. La passe 9 avait conclu « rien ne manque ». | Contrôle `RESERVE_PROPRIETE_A_MENTIONNER` (information, SYSCOHADA Système normal) sur les soldes des 4016, 4116, 4816, 9043 et 9083 ; conclusion de la passe 9 rectifiée. |
| B4 | INCOMPLET | Au SYCEBNL, un bien corporel crédité au 48161 (réserve de propriété, incorporelles) était admis et proposé. | Listes par référentiel · 48161/48181 incorporels, 48162/48182 corporels ; le SYSCOHADA garde 4816/4818, non subdivisés au semis. |
| C4, D5 | CONFORT | VMG-ENG-1 ignorait les sûretés réelles ; la classe 9 du SYSCOHADA était dite « celle de la comptabilité analytique ». | Objet ajouté (fiche du compte 16, NOTE 1) ; engagements hors bilan (90-91) et analytique (92-99) nommés, au code et à CLAUDE.md. |
| B6 | CONFORT | Le plan disait que le logiciel « ne tient rien » de la réserve de propriété. | État exact écrit. |

### Lus et sans objet comptable (B8)

Inscription au RCCM (art. 50 à 66, formalités au greffe), droit de rétention
(art. 67 à 70), réserve de propriété après défaut (art. 75 à 78, traitée par
l'AUDCIF ch. 9 et le Guide, Application 40), cession de créance à titre de
garantie (art. 80 à 86, aucune source comptable lue ; la ligne « créances
cédées » est en saisie), transfert fiduciaire d'une somme d'argent (art. 87 à
91, qualification du cabinet), privilèges généraux du Trésor, des douanes et
de la sécurité sociale (acte du comptable public). Le rang et la réalisation
des sûretés ne se traduisent par aucune écriture propre.

### Écartés par la réfutation

A2, A3, B3, B5, B7, C2, C3, C5, D2, D3, D4 · chacun parce que le dépôt servait
déjà l'information, que le texte ne visait pas la comptabilité, ou que la
correction aurait inventé une règle (rapprochement forcé avec la classe 9,
pacte commissoire traité comme une procédure, lignes HAO absentes des deux
maquettes officielles).

### Ce que la passe apprend

**UNE RÈGLE ÉCRITE À LA RUBRIQUE CACHAIT UN MANQUE À LA CELLULE.** « Une
rubrique rattachable n'est jamais en saisie » était juste pour les montants,
et empêchait de saisir le texte que la maquette place à côté d'un montant ·
les commentaires affirmaient une saisie que la règle interdisait.

**UNE CONCLUSION « RIEN NE MANQUE » SE RELIT QUAND UN AUTRE TEXTE RENVOIE AU
MÊME OBJET.** La passe 9 avait lu le principe du ch. 9, pas sa section 3.
