# Plan des confrontations · texte par texte, article par article

**Verrouillé le 2026-09-13.** Ce document est la référence d'avancement de la
parenthèse ouverte par Manasse entre la fin de la gestion commerciale et la
reprise de la Phase I. On avance SUR SA BASE : chaque passe s'y déclare
terminée avant d'ouvrir la suivante, et l'ordre des passes ne se change pas en
cours de route sans le dire ici.

**Ce qui le rend nécessaire, en une phrase.** La question posée par Manasse le
2026-09-12 · « as-tu déjà confronté CHAQUE article des référentiels et des lois
fiscales contre le logiciel ? » · avait pour réponse honnête : les référentiels
comptables oui, la fiscalité jamais.

---

## 1. Ce qui A DÉJÀ été confronté article par article

`docs/releve-de-manques-referentiels.md`, 21 passes, refermé le 2026-09-05.
Méthode annoncée en tête : « relire le texte officiel dans les compétences,
article par article, et confronter chaque obligation au code ».

| Corpus | Couverture | Passes |
|---|---|---|
| Acte uniforme SYCEBNL | art. 1 à 28, les 28 | 1 |
| Cadre conceptuel SYCEBNL | intégral | 2, 3 |
| SYCEBNL, opérations spécifiques (Partie 3) | les 6 chapitres | 4 |
| AUDCIF, art. 1 à 113 | les 113 | 5, 6, 7 |
| AUDCIF, Titre VIII | les 41 chapitres | 8 à 21 |

Ces corpus NE SONT PAS rouverts par ce plan. Ce qui en subsiste est un carnet
de travaux tenu dans les passes elles-mêmes, plus cinq questions d'arbitrage
listées en fin de passes 17 à 21.

## 2. L'autre audit, et pourquoi il ne répond pas à la question

`docs/audit-citations-2026-09-06.md` a vérifié 7 961 lignes de citations, et
son verdict tient : sur les 89 références qui commandent un montant, une
échéance ou un seuil, aucun chiffre n'est faux.

**Mais il va dans le sens inverse.** Il part du CODE et remonte au TEXTE : il
répond à « les références qu'affiche le logiciel sont-elles justes », pas à
« quelles obligations du texte le logiciel ignore ». Un article qu'aucune ligne
de code ne cite lui est invisible par construction. Il déclare d'ailleurs
lui-même quatre corpus non indexés, dont « SYSCOHADA hors AUDCIF ».

Les deux exercices sont complémentaires et aucun ne remplace l'autre.

---

## 3. La preuve que ce plan était dû, trouvée en l'écrivant

**Le décret n° 23/10 du 3 mars 2023.** Il a été trouvé le 2026-09-13, en
inventoriant le corpus fiscal pour établir la liste des passes ci-dessous ·
avant même qu'une seule passe ne commence. Trois constats en sont sortis, tous
corrigés le jour même :

- le module de facturation affichait « aucune source lue ne décrit la procédure
  d'homologation ». **Faux.** L'art. 22 la nomme (attestation de conformité) et
  l'art. 3, 7° qualifie OmegaX de SFE ;
- les mentions obligatoires sont **douze** (art. 26), pas neuf (art. 100 de
  2011), et **dix** sont dues d'un document en tenant lieu. Le module en portait
  neuf, livrées la veille ;
- les art. 20 et 21 posent qu'un SFE doit être homologué pour être **vendu et
  utilisé** en RDC, ce qui dépasse la question de l'émission.

**LEÇON À RETENIR, ET ELLE EST NOUVELLE.** Une lacune DÉCLARÉE À TORT est aussi
fausse qu'une règle inventée. Le § 10 bis de CLAUDE.md visait le signalement qui
fabrique une anomalie ; celui-ci fabriquait une DISPENSE. Dire « aucun texte ne
prévoit » conclut le sujet et fait renoncer à une démarche due. Et rien dans les
tests ne peut l'attraper : une absence de source ne se vérifie que contre le
corpus entier. C'est exactement ce que ces passes font.

---

## 4. Méthode, identique pour chaque passe

Reprise de celle du relevé de manques, qui a fait ses preuves.

1. **Lire à la source**, article par article, dans la compétence. Jamais de
   mémoire (CLAUDE.md § 1).
2. **Confronter au code** : pour chaque obligation, chercher où elle vit, ou
   constater qu'elle ne vit nulle part.
3. **Classer par ce qu'une erreur coûte**, dans cet ordre : ce qui produit un
   état ou une déclaration **FAUX** · ce qui la produit **INCOMPLÈTE** · les
   **obligations de calendrier**, qui ne touchent aucun état mais une date
   opposable · le **confort**.
4. **Corriger dans la même passe** ce qui est corrigeable, avec le test qui
   l'aurait attrapé (§ 10) et une réinjection du défaut pour prouver que le test
   tombe.
5. **Écrire ce qui n'est pas corrigé** avec sa raison, et **ce qui appartient à
   Manasse** avec la question exacte à trancher.
6. **Ne jamais combler une lacune du texte** en inventant une règle, et **ne
   jamais déclarer une lacune sans avoir cherché dans tout le corpus** · les
   deux erreurs se paient au même prix, dans deux directions opposées.

### Qui conduit une passe · arbitré par Manasse le 2026-09-13

Chaque passe est conduite par un **workflow d'agents**, avec modèle et effort
réglés par étape. Ce n'est PAS une délégation : c'est une division du travail,
et elle tient à trois règles qui ne se négocient pas.

| Étape | Qui | Modèle · effort | Pourquoi |
|---|---|---|---|
| **Lecture** du texte, article par article | un agent par chapitre, **qui n'a pas accès au code** | Opus · `high` | L'indépendance est le seul vrai apport. Un lecteur qui connaît le code lit le texte à travers lui et ne voit plus que ce que le logiciel fait déjà |
| **Confrontation** de chaque obligation au dépôt | un agent par chapitre | Opus · `high` | Cherche où l'obligation vit, ou constate qu'elle ne vit nulle part |
| **Réfutation** de chaque manque annoncé | un agent par constat, payé pour DÉMOLIR | Opus · `xhigh` | Un constat qu'on n'a pas essayé de réfuter n'est qu'une impression |
| **Correction**, schéma, migrations, tests, déploiement | **la session principale, jamais un agent** | Opus · `high` | C'est la seule discipline qui a réellement attrapé des défauts : réinjection, garde-fous du dépôt, déploiement relu pas à pas |

**TROIS RÈGLES, ET « SANS ERREURS » N'EN FAIT PAS PARTIE.** Des agents
n'apportent pas la justesse · ils lisent et hallucinent comme la session
principale, et leur rapport revient sous forme de TEXTE, ce qui est pire : le
croire propagerait une citation fausse avec plus d'assurance que de l'avoir lue
soi-même. Ce qu'ils apportent est la COUVERTURE, l'INDÉPENDANCE et le TEMPS.
D'où :

1. **Aucun agent n'écrit dans le dépôt.** Ils lisent et rapportent.
2. **Tout constat est ancré** · citation exacte, fichier source, ligne. Rien
   n'entre dans le code sans que la session principale ait relu la ligne
   elle-même. C'est la règle n° 1 de CLAUDE.md, et elle ne se délègue pas.
3. **Une étape adverse est obligatoire.** Ce qui survit à la réfutation entre
   au relevé ; le reste est écrit comme écarté, avec sa raison.

**Journal d'avancement :** `docs/releve-de-manques-fiscal.md` pour les passes F,
`docs/releve-de-manques-ohada.md` pour les passes O, `docs/releve-de-manques-referentiels.md`
(existant, à compléter) pour les passes R.

---

## 5. LES PASSES, DANS L'ORDRE · c'est cet ordre qui est verrouillé

**ORDRE REVERROUILLÉ LE 2026-09-18 PAR MANASSE · du MOINS volumineux au PLUS
volumineux.** Le § 5 exige qu'un changement d'ordre soit dit ici : il l'est.

L'ordre verrouillé du 2026-09-13 suivait « le coût d'une erreur pour un client
du cabinet, pas la taille du corpus ». **Il est remplacé par l'ordre du volume
croissant**, mesuré au § 5 bis. Les quatre passes faites (F1 à F4) l'ont été
sous l'ancien ordre et ne sont pas rejouées.

**CE QUE LE CHANGEMENT DONNE.** Sept passes tiennent chacune en un run ou deux
et se referment vite · le bloc F cesse d'être une file d'attente où les textes
courts attendent derrière les longs. Et deux passes que l'ancien ordre plaçait
en queue remontent en tête, dont **F9, les sanctions fiscales et leur barème**,
qui était 26e sur 27 par le volume alors que c'est un des textes dont une
lacune se paie le plus vite chez un client.

**CE QU'IL COÛTE, ET IL FAUT LE SAVOIR.** Les deux passes les plus lourdes
passent en dernier, et ce ne sont pas des passes neutres. **O1 (AUSCGIE,
10 359 lignes) porte une contradiction de fenêtre que ce plan déclare
lui-même en attente d'arbitrage** · le jalon 16 contre les documents
obligatoires de l'art. 138. Elle attendra désormais vingt-cinq passes. Et
**F14 est de toute façon bloquée** tant que son périmètre n'est pas tranché
(§ 9, point 0), ce qui rend sa place en queue sans conséquence.

L'ordre ci-dessous est le seul qui fasse foi. Les fiches par bloc qui suivent
gardent l'historique de chaque passe · elles ne portent plus l'ordre.

### L'ordre d'exécution, verrouillé

| Rang | Passe | Corpus | Lignes | Runs prévus |
|---|---|---|---|---|
| **1** | **F10** | **FAITE le 2026-09-18** · loi n° 004/2003, Livre II, Titres V à VII, plus l'A.M. n° 013 du 11 mai 2015. 69 agents, 2 h 42, 75 obligations, 63 constats réfutés un à un, **50 écartés, 13 retenus dont 2 FAUX, 2 corrigés** (le report au premier jour ouvrable de l'art. 110 bis al. 2, qui faisait accuser d'un retard inexistant tout redevable dont l'échéance tombe un dimanche ; la consignation du dixième de l'art. 110 al. 2, prise pour un acompte insuffisant et renvoyée à l'amende de l'art. 98 bis dans le sens où rien ne manque). 79 % de réfutation · un texte adressé à l'Administration rend la plupart de ses articles à qui de droit. Journal : `docs/releve-de-manques-fiscal.md` | 384 | 1 |
| **2** | **F9** | **FAITE le 2026-09-18** · loi n° 004/2003, Livre II, Titre IV, le barème complet. 67 agents, 2 h 46, 65 obligations, 59 constats réfutés un à un, **22 écartés, 37 retenus dont 5 FAUX, 3 corrigés** (l'art. 97 bis ne vise pas le décret n° 23/10 que le dépôt lui prêtait · créé en 2013, il ne peut pas viser un décret de 2023 ; l'ENTREPRENANT se voyait annoncer 750 000 FC au lieu de 250 000, le code contredisant son propre commentaire ; l'art. 96 bis daté de son remplacement et non de son insertion). 37 % de réfutation, le plus bas de la série · vérifier ce que le dépôt AFFIRME rapporte plus que chercher ce qui manque. Journal : `docs/releve-de-manques-fiscal.md` | 396 | 1 |
| **3** | **F6** | **FAITE le 2026-09-18** · loi n° 23/053, Titres I et IV à VII. 216 agents, quinze blocs, deux regards par bloc et trois réfutateurs par constat. 62 constats bruts, **52 réfutés, 10 retenus dont 3 doublons, soit 6 écarts distincts, plus 2 trouvés par la session principale en relisant les sources · 8 corrigés** (l'écran des retenues annonçait l'impôt sur les SOCIÉTÉS à une entreprise individuelle et à un entreprenant, qui sont des personnes physiques ; l'affectation du résultat acceptait d'imputer une perte sur le compte « Écarts de réévaluation », ce que l'art. 133 al. 4 interdit, et le menu le proposait ; le contrôle de réévaluation mettait au compte de l'AUDCIF art. 65 une prohibition qu'il ne porte pas ; le prélèvement des capitaux mobiliers non-résidents était servi à des personnes physiques alors que son propre commentaire écrivait « ELLE NE VISE QUE LES SOCIÉTÉS » ; la mention du comptable de l'art. 141, 2° n'avait aucun porteur ; la note du cabinet énonçait l'arrondi de l'art. 150 en un temps au lieu de deux ; la mort de l'O.-L. n° 69/007 était annoncée sans sa borne du 1er janvier 2026 ; la loi était datée du 5 décembre au lieu du 30 novembre 2023). **84 % de réfutation, le plus haut de la série** · un texte de définitions et de renvois rend presque tout, et ce qui survit est dans du code déjà écrit. Leçon : une restriction écrite en toutes lettres dans un commentaire et non portée par le code est plus dangereuse qu'une restriction oubliée, parce qu'elle se relit comme faite. Journal : `docs/releve-de-manques-fiscal.md` | 415 | 1 |
| **4** | **F13** | **FAITE le 2026-09-24** · loi de finances n° 25/060 + IPM (O.-L. n° 71-087). 126 agents, 2 h 10, 286 obligations, 34 constats réfutés un à un, **10 écartés, 24 retenus soit 13 écarts distincts dont 2 FAUX, 12 corrigés** (le PV d'assemblée de l'art. 13 bis LPF servi aux ASBL et aux personnes physiques, que le texte ne vise pas ; l'amende de l'art. 74 al. 2 TVA donnée pour le triple au lieu des droits indûment déduits ; la simulation d'avant 2026 présentée comme base légale des acomptes ; le solde de l'IS au dépôt ; les art. 12 et 23 cités dans leur rédaction de 2023 ; l'art. 22 ter daté de sa modification). L'IPM ne rend rien : perçu par les chefferies, sans retenue confiée à l'employeur. Journal : `docs/releve-de-manques-fiscal.md` | 487 | 1 |
| **5** | **R4** | AUDCIF Titres XII et XIII · comptes consolidés et combinés (D4C) | 612 | 1 |
| **6** | **O7** | AUA + AUM + AUCTMR · les trois petits actes, ensemble | 919 | 2 |
| **7** | **O2** | AUDCG hors Livre 8 · commerçant, RCCM, bail, fonds de commerce, intermédiaires | 921 | 2 |
| 8 | F7 | Procédures fiscales, Titre 1 · obligations déclaratives | 1 061 | 2 |
| 9 | F5 | IRPP + les deux arrêtés de retenue | 1 185 | 2 |
| 10 | F12 | Le socle 2026 · sept arrêtés ministériels + `parametres-2026.md` | 1 308 | 2 |
| 11 | R3 | AUDCIF Titre XI · nomenclatures NAEMA et NOPEMA | 1 493 | 2 |
| 12 | O3 | AUS · sûretés | 1 623 | 2 |
| 13 | R6 | SYCEBNL Partie 4 · les trois jeux d'états et leurs notes | 1 715 | 2 |
| 14 | R2 | AUDCIF Titres IX et X · états financiers, Système normal et SMT | 1 888 | 3 |
| 15 | F11 | Impôts réels et cédulaires | 1 987 | 3 |
| 16 | R5 | SYCEBNL Partie 2 · cadre comptable et plan des comptes | 2 203 | 3 |
| 17 | F8 | Procédures fiscales, Titres 2 et 3 · contrôle et recouvrement | 2 794 | 4 |
| 18 | O6 | AUSCOOP | 3 033 | 4 |
| 19 | R1 | AUDCIF Titre VII · fonctionnement des comptes, classes 1 à 9 | 3 296 | 4 |
| 20 | O5 | AUPCAP · procédures collectives | 3 341 | 4 |
| 21 | O4 | AUPSRVE · recouvrement et voies d'exécution | 3 379 | 4 |
| 22 | D1 | Loi n° 004/2001 et son appareil | 3 541 | 4 |
| 23 | D4 | Code du numérique, ordonnance-loi n° 23/10 du 13 mars 2023 | 5 425 | 7 |
| 24 | D2 | Droit du travail congolais + CNSS | 5 875 | 7 |
| 25 | D3 | ONEC | 6 622 | 8 |
| 26 | O1 | AUSCGIE, art. 1 à 920 | 10 359 | 12 |
| 27 | F14 | Accises + TPI + recettes non fiscales · **périmètre à trancher avant de lancer** | 14 671 | 17 |

**LES SEPT PREMIÈRES SONT LANCÉES D'AFFILÉE**, décidé le 2026-09-18 · 4 094
lignes, six runs, et elles referment quatre passes du bloc F, la première du
bloc R et deux du bloc O. Chacune garde son cycle complet : corrections
relues ligne à ligne par la session principale, réinjection de défaut, tests,
journal, commit, et déploiement relu pas à pas quand `src/` est touché.

### Les fiches par passe · historique, et non plus ordre

### Bloc F · La fiscalité congolaise · JAMAIS CONFRONTÉE

Compétences `fiscalite-rdc` (132 fichiers, 36 951 lignes) et
`fiscalite-rdc-socle` (10 fichiers). Le sous-dossier `code-general-2026` est la
compilation DGI au 19 juillet 2026, en 26 fichiers · c'est LUI qui fait foi, les
autres sous-dossiers en étant des vues thématiques.

| Passe | Objet | Source |
|---|---|---|
| **F1** | **FAITE le 2026-09-13** · TVA, facture normalisée et dispositifs électroniques. 57 obligations lues, 30 constats, 25 réfutés, **5 retenus et corrigés** (adresse exacte des art. 26 a) et b), bornage au 3 mars 2023, art. 25 rendu exclusif à tort, volet importation nommé à moitié, arrêté de l'art. 25 hors corpus). Journal : `docs/releve-de-manques-fiscal.md` | décret n° 23/10 du 3 mars 2023 (29 art.), art. 14 du code général |
| **F2** | **TVA · l'ordonnance-loi n° 10/001**, champ, territorialité, fait générateur, exigibilité, base, taux, déductions, obligations, liquidation, remboursement. **EXÉCUTION SCINDÉE EN DEUX RUNS**, le plan inchangé, sa conduite seule · 1 754 lignes contre 306 pour F1, et à ce volume plus de cent réfutateurs à `xhigh`. **F2a FAITE le 2026-09-13** · chapitres I à IV, 159 agents, 19,0 M de jetons, 149 constats réfutés un à un, 93 écartés, **56 retenus, 4 corrigés et 6 lacunes nommées** (nature fiscale lue à la contrepartie et non au compte de TVA · art. 6 et 8 ; art. 26 al. 3 déclaré ; art. 25 borné à ses points 1 et 2 ; territorialité, bases particulières et cessions d'actifs nommées). **F2b FAITE le 2026-09-13** · chapitres V à X, 137 agents, 16,1 M de jetons, 125 constats réfutés un à un, 46 écartés, **79 retenus dont 17 de gravité FAUX, 3 corrigés et 11 lacunes nommées** (l'art. 41 était fermé au SYCEBNL sur une affirmation fausse, les produits pétroliers des art. 41, 3°, 3° bis et 3° ter comptés sans pourcentage inventé, un test qui bannissait « art. 63 » corrigé). **F2 EST CLOSE.** Journal : `docs/releve-de-manques-fiscal.md` | art. 10 du code général, 10 chapitres |
| **F3** | **TVA · le décret n° 011/42** d'exécution, les 12 chapitres. **EXÉCUTION SCINDÉE EN DEUX RUNS** · 3 525 lignes. **F3a FAITE le 2026-09-16** · chapitres I à III, 134 agents, 15,5 M de jetons, 124 constats réfutés un à un, **106 écartés, 18 retenus dont 7 FAUX, 6 corrigés** (le référentiel fermait la lecture de la contrepartie sur un motif périmé ; la location-vente rendue aux livraisons de biens ; la mention de l'art. 60 contrôlée ; « une association ne l'est pas de plein droit », affiché et faux ; le déclencheur faux de l'art. 41 ; les abonnements et les effets de commerce déclarés). 85 % de réfutation, le plus haut taux des quatre passes · effet de la consigne qui donne aux confronteurs le journal et le hors-scope. **F3b FAITE le 2026-09-17** · chapitres IV à XII, 183 agents, 20,1 M de jetons, 171 constats réfutés un à un, **134 écartés, 37 retenus dont 8 FAUX, 2 corrigés** (l'art. 100 réclame l'adresse exacte, que la correction de F1 avait niée en dérivant la branche antérieure, avec l'exclusion de déduction de l'art. 104 qui s'y attache ; le seuil de 10 000 FC de l'objet publicitaire, art. 107, que le module déclarait introuvable). Le conteneur a redémarré en cours de route et la reprise n'a pas rejoué le cache · sept heures refaites. **F3 EST CLOSE.** Journal : `docs/releve-de-manques-fiscal.md` | art. 11 à 13 du code général |
| **F4** | **Impôt sur les sociétés · loi n° 23/053, Titre 2**. **FAITE le 2026-09-17, EXÉCUTION SCINDÉE EN DEUX RUNS**, pour la DURÉE et non pour le volume. **F4a** · champ d'application et produits imposables, 85 agents, 3 h 55, 77 constats réfutés un à un, **30 écartés, 47 retenus dont 15 FAUX, 4 corrigés** (l'art. 5 discrimine par qualité de la personne et non par référentiel ; l'exemption dispense de la déclaration comme du paiement ; les ristournes bornées à l'art. 11, 3° ; le module fiscal borné au 1er janvier 2026 et la territorialité de l'art. 7 déclarée), 39 % de réfutation. **F4b** · charges déductibles et non déductibles, taux et liquidation, 119 agents, 127 obligations lues, 107 constats réfutés un à un, **44 écartés, 63 retenus dont 13 FAUX, 4 corrigés** (l'art. 57 affirmait le contraire du vrai sur le cas d'égalité ; le report déficitaire se comptait en lignes du dossier et non en exercices, art. 51 al. 1 ; la territorialité de F4a n'avait qu'un sens de correction là où l'art. 51 al. 3 en impose un second ; la doublure de `exercice.findMany` n'honorait pas la borne), 41 % de réfutation. Le taux de réfutation d'un texte vierge se stabilise autour de 40 %. Journal : `docs/releve-de-manques-fiscal.md` | art. 04 du code général |
| **F5** | **IRPP · loi n° 23/053, Titre 3** et les retenues (AM 2025 salaires, AM 008/2025 capitaux mobiliers) | art. 05 du code général + socle |
| **F6** | **Loi n° 23/053, Titres 1, 4 à 7** · dispositions générales, communes, abrogatoires, et l'art. 141 sur la tenue en français et en franc congolais | art. 03 et 06 |
| **F7** | **Procédures fiscales, Titre 1** · obligations déclaratives (dont l'art. 23 sur la facturation, déjà partiellement ouvert) | art. 17 et 22 |
| **F8** | **Procédures fiscales, Titres 2 et 3** · contrôle et recouvrement | art. 18, 19, 23, 24 |
| **F9** | **Procédures fiscales, Titre 4** · sanctions fiscales et pénales, et le barème complet | art. 20 |
| **F10** | **Procédures fiscales, Titres 5 à 7** · réclamations, délais, transitoires | art. 21, 25 |
| **F11** | **Impôts réels et cédulaires** · O.-L. 69/006 (foncier, véhicules, concessions), O.-L. 88/029, et ce qui survit de l'O.-L. 69/009 | art. 01, 02, 07, 08 |
| **F12** | **Le socle 2026** · les sept arrêtés ministériels de 2025 et `parametres-2026.md`, confrontés aux constantes du code | `fiscalite-rdc-socle` |
| **F13** | **Loi de finances n° 25/060** et l'IPM (O.-L. 71/087) | `lois-de-finances-annuelles`, art. 09 |
| **F14** | **Accises, taxe de promotion de l'industrie, parafiscalité sociale, recettes non fiscales** | 4 compétences ou sous-dossiers |

### Bloc O · Les actes uniformes OHADA non ouverts

| Passe | Objet | Volume |
|---|---|---|
| **O1** | **AUSCGIE** · art. 1 à 920. Le relevé le déclare lui-même non ouvert, et une contradiction de fenêtre y attend son arbitrage (jalon 16 contre documents obligatoires, art. 138) | 10 441 lignes |
| **O2** | **AUDCG** · art. 1 à 307. Le Livre 8 vient d'être lu pour le devis ; restent le statut de commerçant, le RCCM, les Fichiers, l'informatisation, le bail, le fonds de commerce, les intermédiaires | 963 lignes |
| **O3** | **AUS** (sûretés) · la réserve de propriété de l'art. 276 AUDCG y renvoie nommément, et le logiciel n'en tient rien | 1 669 lignes |
| **O4** | **AUPSRVE** (recouvrement et voies d'exécution) · le module de relances s'arrête à la lettre, le texte commence là | 3 445 lignes |
| **O5** | **AUPCAP** (procédures collectives) · ce qu'un dossier en cessation de paiements impose à sa comptabilité | 3 418 lignes |
| **O6** | **AUSCOOP** · le rapport de gestion à six sections de l'art. 108 est déjà servi, le reste ne l'est pas | 3 095 lignes |
| **O7** | **AUA, AUM, AUCTMR** · les trois petits, ensemble | 1 018 lignes |

### Bloc R · Le solde des référentiels comptables

Ce que les 21 passes n'avaient pas ouvert, et qui n'a servi qu'à CONSTRUIRE.

| Passe | Objet |
|---|---|
| **R1** | **AUDCIF Titre VII** · contenu et fonctionnement des comptes, classes 1 à 9, confrontés au plan semé et aux fiches `regles-comptes-syscohada.ts` |
| **R2** | **AUDCIF Titres IX et X** · états financiers du Système normal et du SMT, confrontés aux tables de correspondance |
| **R3** | **AUDCIF Titre XI** · nomenclatures NAEMA et NOPEMA, qui ne sont nulle part dans le logiciel |
| **R4** | **AUDCIF Titres XII et XIII** · comptes consolidés et combinés (D4C), face au module Groupe |
| **R5** | **SYCEBNL Partie 2** · cadre comptable et plan des comptes, face au semis |
| **R6** | **SYCEBNL Partie 4** · les trois jeux d'états et leurs 71 notes, face aux tables |

### Bloc D · Le droit congolais hors fiscal, déjà partiellement exploité

| Passe | Objet |
|---|---|
| **D1** | **Loi n° 004/2001** · art. 1 à 76. Le logiciel en porte déjà beaucoup (constitution, accord-cadre, exemption), jamais article par article |
| **D2** | **Droit du travail congolais et CNSS** · aucune paie dans le logiciel, mais les retenues et l'ONEM y sont · vérifier ce qui est affirmé |
| **D3** | **ONEC** · ce que l'Ordre impose à un cabinet qui tient des comptes, et ce que le logiciel prétend à sa place |
| **D4** | **Code du numérique · ordonnance-loi n° 23/10 du 13 MARS 2023**, à ne jamais confondre avec le décret n° 23/10 du 3 mars 2023 de la passe F1 (voir § 5 bis, constat 1). La réserve « OCR non collationné » portée ici jusqu'au 2026-09-18 **est périmée** · la compétence a été réextraite du PDF natif le 05/09/2026, sans erreur de reconnaissance de caractères. Reste entière l'autre moitié : la qualification juridique est due, et la passe établit ce qu'elle peut lire contre le logiciel, pas ce qu'un juriste seul peut trancher |

---

## 5 bis. Le volume des 27 passes restantes, MESURÉ · et ce que la mesure a trouvé

**Ajouté le 2026-09-18, à la demande de Manasse.** C'est cette mesure qui a
servi à reverrouiller l'ordre du § 5 le jour même, **en la prenant à l'envers** ·
le § 5 exécute du plus léger au plus lourd, cette section classe du plus lourd
au plus léger pour que le poids de ce qui reste se lise d'un coup d'œil. Les
deux tableaux portent les mêmes 27 passes et les mêmes chiffres, dans les deux
sens.

### Ce qui est mesuré, et pourquoi le nombre de lignes

**La mesure est le NOMBRE DE LIGNES DU CORPUS À CONFRONTER**, relevé fichier par
fichier avec `wc -l` dans les compétences, jamais estimé. C'est la seule grandeur
disponible AVANT d'ouvrir une passe : le nombre d'articles ne se connaît qu'après
lecture, et le nombre d'obligations qu'après la phase de lecture elle-même.

**Elle est imparfaite, et il faut savoir en quoi.** Une ligne de nomenclature ne
vaut pas une ligne de texte normatif. Mesurée sur les six runs faits, la DENSITÉ
d'obligations va de 0,07 à 0,19 obligation par ligne · le décret d'application
de la TVA est en bas de la fourchette, la loi sur l'impôt sur les sociétés en
haut (127 obligations pour 659 lignes à F4b). Le nombre de lignes borne donc le
coût par le haut, il ne le prédit pas.

### Ce qu'un run tient, mesuré sur les six runs faits

| Run | Lignes lues | Agents | Jetons | Durée |
|---|---|---|---|---|
| F1 | 306 | 1 lot | · | court |
| F2a | ~900 | 159 | 19,0 M | · |
| F2b | ~850 | 137 | 16,1 M | · |
| F3a | 1 807 | 134 | 15,5 M | · |
| F3b | 1 718 | 183 | 20,1 M | **> 7 h, conteneur perdu** |
| F4a | 393 | 85 | 10,9 M | 3 h 55 |
| F4b | 659 | 119 | · | · |

**LE PLAFOND EST LA DURÉE, PAS LE VOLUME**, et il a été payé une fois : F3b a
perdu sept heures parce que le conteneur a redémarré et que `resumeFromRunId`
n'a pas rejoué le cache. La borne de sûreté retenue est donc **environ 120
agents par run**, soit **600 à 900 lignes de texte normatif dense** et jusqu'à
**1 500 lignes de texte réglementaire ou de nomenclature**. Le découpage
prévisionnel ci-dessous applique 900 lignes par run · c'est une borne de travail,
à resserrer sur un texte dense et à relâcher sur une nomenclature.

### Le tri, du plus volumineux au moins volumineux

**27 passes, 80 933 lignes, environ 105 runs à 900 lignes.** Le total est la
donnée la plus utile de ce tableau : il dit que la parenthèse n'est pas à trois
passes de sa fin.

| Rang | Passe | Corpus | Lignes | Runs prévus |
|---|---|---|---|---|
| 1 | **F14** | Accises 2 028 + taxe de promotion de l'industrie 93 + recettes non fiscales 12 550 | **14 671** | 17 |
| 2 | **O1** | AUSCGIE, art. 1 à 920 | **10 359** | 12 |
| 3 | **D3** | ONEC · loi 15/002, règlement intérieur, règlement de stage, norme 2024-001, FORCO, programme UE1 à UE7 | **6 622** | 8 |
| 4 | **D2** | Droit du travail congolais 2 768 + CNSS 3 107 | **5 875** | 7 |
| 5 | **D4** | Code du numérique, ordonnance-loi n° 23/10 seule | **5 425** | 7 |
| 6 | **D1** | Loi n° 004/2001 et son appareil (le texte légal seul : 680 lignes) | **3 541** | 4 |
| 7 | **O4** | AUPSRVE · recouvrement et voies d'exécution | **3 379** | 4 |
| 8 | **O5** | AUPCAP · procédures collectives | **3 341** | 4 |
| 9 | **R1** | AUDCIF Titre VII · contenu et fonctionnement des comptes, classes 1 à 9 | **3 296** | 4 |
| 10 | **O6** | AUSCOOP · sociétés coopératives | **3 033** | 4 |
| 11 | **F8** | Procédures fiscales, Titres 2 et 3 · contrôle et recouvrement | **2 794** | 4 |
| 12 | **R5** | SYCEBNL Partie 2 · cadre comptable et plan des comptes | **2 203** | 3 |
| 13 | **F11** | Impôts réels et cédulaires · O.-L. 69/006, 88/029, survivances du 69/009 | **1 987** | 3 |
| 14 | **R2** | AUDCIF Titres IX et X · états financiers, Système normal et SMT | **1 888** | 3 |
| 15 | **R6** | SYCEBNL Partie 4 · les trois jeux d'états et leurs notes | **1 715** | 2 |
| 16 | **O3** | AUS · sûretés | **1 623** | 2 |
| 17 | **R3** | AUDCIF Titre XI · nomenclatures NAEMA et NOPEMA | **1 493** | 2 |
| 18 | **F12** | Le socle 2026 · sept arrêtés ministériels + `parametres-2026.md` | **1 308** | 2 |
| 19 | **F5** | IRPP 1 048 + arrêté retenue salaires 77 + AM 008/2025 capitaux mobiliers 60 | **1 185** | 2 |
| 20 | **F7** | Procédures fiscales, Titre 1 · obligations déclaratives | **1 061** | 2 |
| 21 | **O2** | AUDCG hors Livre 8 (déjà lu pour le devis) | **921** | 2 |
| 22 | **O7** | AUA 397 + AUM 193 + AUCTMR 329 | **919** | 2 |
| 23 | **R4** | AUDCIF Titres XII et XIII · comptes consolidés et combinés (D4C) | **612** | 1 |
| 24 | **F13** | Loi de finances n° 25/060 156 + IPM (O.-L. 71/087) 331 | **487** | 1 |
| 25 | **F6** | Loi n° 23/053, Titres 1, 4 à 7 | **415** | 1 |
| 26 | **F9** | Procédures fiscales, Titre 4 · sanctions fiscales et pénales | **396** | 1 |
| 27 | **F10** | Procédures fiscales, Titres 5 à 7 · réclamations, délais, transitoires | **384** | 1 |

### QUATRE CHOSES QUE LA MESURE A TROUVÉES, ET QU'AUCUNE PASSE N'AURAIT VUES

Le § 3 de ce plan notait que le décret n° 23/10 avait été trouvé en INVENTORIANT
le corpus, avant qu'une passe ne commence. Le même effet se reproduit ici :
compter les lignes oblige à ouvrir chaque dossier, et quatre choses en sortent.

**1 · LE NUMÉRO 23/10 PORTE DEUX TEXTES DE 2023, À DIX JOURS D'INTERVALLE.** Le
**décret n° 23/10 du 3 MARS 2023** règlemente la facture normalisée · c'est le
texte de la passe F1, et le module de facturation en vit. L'**ordonnance-loi
n° 23/10 du 13 MARS 2023** porte le Code du numérique · c'est le texte de la
passe D4. Même numéro, même année, deux instruments différents.

**Quatorzième occurrence du premier piège du dépôt, et la PREMIÈRE sur un numéro
de TEXTE** · les treize précédentes portaient sur un numéro de compte (192, 4181,
1061/1062, 38/37, 397, 70510000), un numéro d'article (les deux art. 11 des
revenus locatifs) ou une durée (les trois « trois exercices » du mandat). Le
dépôt est propre AUJOURD'HUI : les 25 occurrences de « 23/10 » dans `src/`
portent toutes « décret n° 23/10 du 3 mars 2023 ». Le risque naît le jour où D4
ouvre, et il est prophylactique · **toute citation du Code du numérique porte
« ordonnance-loi n° 23/10 du 13 mars 2023 » en entier, et un test gèle la
distinction dans les deux sens**, comme pour les deux articles 11 de
`retenues.spec.ts`. Décidé ici pour ne pas avoir à le découvrir là-bas.

**2 · LA RÉSERVE « OCR NON COLLATIONNÉ » DE D4 EST PÉRIMÉE.** Le § 5 décrit D4
comme « relevé comme OCR non collationné, à faire qualifier par un juriste ». La
première moitié ne vaut plus : le README de la compétence porte, daté du
**05/09/2026**, « remplace l'ancienne version OCRisée depuis le PDF fusionné de
873 pages par une extraction depuis le PDF natif du document seul. Pas d'erreurs
de reconnaissance de caractères ». La seconde moitié tient entièrement · la
qualification juridique reste due. **C'est une lacune déclarée à tort dans le
plan lui-même**, c'est-à-dire exactement ce que son § 3 pose comme aussi faux
qu'une règle inventée. Elle aurait fait renoncer à une passe lisible.

**3 · LA CNSS EST COMPTÉE DEUX FOIS.** Le § 5 met « parafiscalité sociale » dans
F14 et « CNSS » dans D2. C'est le même corpus, 3 107 lignes. Il est **rattaché à
D2** dans le tri ci-dessus, avec le droit du travail dont il est indissociable, et
retranché de F14. Deux passes sur le même texte auraient rendu deux relevés
plausibles et différents · c'est ce que le dépôt a déjà payé sur
`calculerPropositions` et sur `construireLigneTva`.

**4 · F14 N'EST PAS UNE PASSE, C'EST UN BLOC.** Elle pèse 14 671 lignes, soit
plus que O1 et près du cinquième du reste à faire. Et **12 550 de ces lignes sont
les recettes non fiscales**, dont 6 309 pour les deux seules nomenclatures des
ordonnances-lois 13/001 et 13/002 · des tables qui ÉNUMÈRENT des milliers de
droits, taxes et redevances sans énoncer d'obligation comptable. Les confronter
article par article produirait du volume, pas des constats.

**Elle doit être re-découpée avant d'être ouverte**, et le découpage est un
arbitrage de Manasse, pas une décision de passe : les accises (2 028 lignes, un
code avec ses obligations déclaratives) et la taxe de promotion de l'industrie
(93 lignes) sont du texte normatif ordinaire ; les recettes non fiscales
demandent d'abord de décider CE QU'ON Y CHERCHE · vraisemblablement les
procédures de l'O.-L. 13/003 (2 292 lignes, note de perception, ordonnancement,
recouvrement), et non les nomenclatures.

### Ce que ce tri décide, et ce qu'il ne décide pas

**IL DÉCIDE L'ORDRE, depuis le 2026-09-18 et sur décision de Manasse** · pris à
l'envers, il EST l'ordre d'exécution du § 5. Ce n'était pas le cas le matin même,
où il ne servait qu'à chiffrer : le § 5 suivait alors le coût d'une erreur chez
le client. Le motif retenu est désormais le volume croissant, et ce que
l'échange coûte est écrit en tête du § 5 plutôt que tu.

**IL NE DÉCIDE PAS CE QU'UNE PASSE TROUVE.** Une passe courte n'est pas une
passe légère : F1 pesait 306 lignes, la plus petite de toutes celles qui ont été
faites, et elle a rendu cinq constats dont l'adresse exacte de l'art. 26, qui
faisait rendre `conforme: true` à une facture non conforme. Le rang dans ce
tableau dit le COÛT DE LA PASSE, jamais la valeur de ce qu'elle rapporte.

**ET IL NE DÉCIDE PAS LE DÉCOUPAGE EN RUNS**, qu'il propose seulement. La
colonne « runs prévus » applique 900 lignes par run ; le vrai plafond est la
DURÉE, et la densité d'obligations varie du simple au triple selon qu'on lit un
décret d'application ou une loi d'assiette. Un run se resserre sur un texte
dense, se relâche sur une nomenclature, et se décide à l'ouverture de la passe.

---

## 6. Ce que ce plan NE fait pas

- **Il ne rouvre pas les 21 passes du relevé de manques.** Elles sont faites.
- **Il ne promet aucune « conformité ».** Une confrontation dit ce qui a été
  lu, contre quoi, et avec quel verdict. C'est un relevé, pas un certificat ·
  même réserve que l'audit des citations.
- **Il ne remplace pas un juriste** sur les points que les sources ne
  permettent pas de trancher, et ils sont nommés passe par passe.
- **Il n'ouvre aucun chantier de construction.** Une passe corrige ce qui est
  corrigeable dans son périmètre ; un manque qui demande un module entier
  devient un item du plan ordonné, pas un débordement de la passe.

## 7. La reprise de la Phase I

Quand les blocs F, O, R et D sont clos, **on reprend la Phase I exactement à son
point d'arrêt**, noté dans `docs/plan-ordonne-2026-09.md` :

> Gestion commerciale close le 2026-09-13 (facture I1, devis et commande I2).
> **La Phase I reprend aux STOCKS**, et à rien d'autre : ne pas recommencer la
> gestion commerciale, ne pas sauter à la paie. Suivent ensuite paie, OHADA vers
> IFRS, consolidation, RBAC fin.

Et l'avertissement du § 3.6 du plan de construction reste entier · le
multi-classification se décide à la CONCEPTION, `Compte`, `Journal` et
`Immobilisation` étant tous mono-classification.

---

## 8. Avancement

| Bloc | Passes | Faites | Reste |
|---|---|---|---|
| F · Fiscalité | 14 | **8** | 6 |
| O · OHADA | 7 | 0 | 7 |
| R · Référentiels, solde | 6 | 0 | 6 |
| D · Droit congolais | 4 | 0 | 4 |
| **Total** | **31** | **8** | **23** |

*Une passe scindée reste une passe : elle se compte quand son dernier run est
clos, pas quand le premier est poussé. F2 et F3 le sont.*

*ET UNE PASSE SE DÉCOUPE DÉSORMAIS POUR TENIR DANS UNE VIE DE CONTENEUR.* Le
second run de F3 a été tué par un redémarrage après près de sept heures, et la
reprise par `resumeFromRunId` n'a pas rejoué le cache : tout a été refait. Le
découpage d'une passe se règle donc sur la durée, pas seulement sur le nombre
de lignes du texte.

*Tenir ce tableau à jour à la fin de chaque passe. Une passe n'est « faite »
que lorsque son verdict est écrit dans son journal et que les corrections
qu'elle emporte sont poussées et déployées.*

## 9. Ce qui attend Manasse, ouvert par ce plan

0 ter. **DEUX TEXTES À VERSER AUX COMPÉTENCES**, fournis ou trouvés le 2026-09-18 et désormais codés. (a) L'**ordonnance n° 23-042 du 30 mars 2023** fixant la liste des jours fériés légaux, que vous avez fournie · elle n'est dans aucune compétence installée, et le logiciel en porte maintenant les dix dates. (b) Le **décret n° 24/09 du 17 février 2024**, art. 1er, qui fixe l'horaire des services publics du lundi au vendredi · il EST au corpus, dans `administration-publique-rdc`, et c'est moi qui ne l'avais pas cherché là. Les deux commandent désormais toutes les échéances fiscales du logiciel. Tant que la première n'est pas versée à une compétence, la seule trace de sa source est le commentaire de `retenues/jour-ouvrable.ts` · une passe future qui relirait le corpus ne la retrouverait pas.

0 bis. **UN FICHIER DE COMPÉTENCE EST TRONQUÉ**, trouvé par la passe F10 le 2026-09-18. `fiscalite-rdc/code-general-2026/references/25-mesures-execution-reclamations-recours-am013-2015.md` s'arrête à la ligne 71, EN PLEIN MILIEU de la phrase de l'article 7 de l'arrêté : « La décision de clôture d'instruction du recours gracieux n'est pas susceptible ». La suite manque, et c'est elle qui dit quelles voies de recours restent ouvertes après un rejet gracieux · exactement la phrase qu'un cabinet a besoin de lire avant de conseiller la voie gracieuse, qui fait renoncer aux autres recours. Rien ne peut être codé là-dessus tant que le fichier n'est pas complété.

0. **LE RE-DÉCOUPAGE DE LA PASSE F14**, ouvert par la mesure du 2026-09-18 (§ 5 bis, constat 4). Elle pèse 14 671 lignes, la plus lourde des 27, et 12 550 d'entre elles sont les recettes non fiscales, dont 6 309 de pures nomenclatures énumérant des milliers de droits et taxes sans énoncer d'obligation comptable. Les confronter article par article produirait du volume et aucun constat. **La question à trancher n'est pas comment la découper, mais ce qu'on cherche dedans** · vraisemblablement les procédures de l'O.-L. 13/003 (note de perception, ordonnancement, recouvrement, 2 292 lignes), et non les nomenclatures. Tant que ce n'est pas tranché, F14 reste une passe qu'on ne peut pas lancer.

1. **L'homologation d'OmegaX comme SFE** (décret n° 23/10, art. 20 à 23). La
   procédure existe et porte un nom ; l'arrêté qui en fixe les modalités n'est
   dans aucune source lue. C'est une démarche auprès de la DGI, pas une lecture.
   Les art. 20 et 21 la lient à la VENTE du logiciel en RDC, pas seulement à
   l'émission d'une facture · c'est le point à trancher en premier.
