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
