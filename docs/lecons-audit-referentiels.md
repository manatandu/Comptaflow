# Ce que l'audit des deux référentiels a appris

Document de capitalisation, écrit pendant l'audit OHADA d'OmegaX (septembre
2026), quand le logiciel a dû servir un second référentiel comptable après
avoir été bâti pour un seul.

Il ne raconte pas ce qui a été corrigé · le journal git le fait déjà. Il note
les FORMES que prennent ces défauts, parce qu'elles se répètent, qu'elles ne
sont propres ni à OmegaX ni à la comptabilité, et qu'un prochain logiciel les
rencontrera à l'identique dès qu'il servira deux régimes, deux pays, deux
versions d'une norme ou deux types de client.

Chaque section donne la forme, un exemple réel, et le garde-fou qui l'attrape.

---

## 1. La catégorie de bug qui domine tout : un texte faux compile

C'est la leçon centrale, et toutes les autres en découlent.

Sur les 116 constats retenus de l'audit, la grande majorité ne provoquait
AUCUNE erreur. Pas d'exception, pas de test rouge, pas de ligne de log. Une
définition fausse s'affiche exactement comme une vraie, s'imprime aussi bien,
et se recopie dans un rapport avec la même autorité.

Exemples vécus, tous silencieux :

- le registre fiscal annonçait à une société commerciale qu'elle bénéficiait
  d'une exemption d'impôt sur les sociétés qui ne vise que les associations ;
- la clôture écrivait « Excédent de l'exercice » au livre-journal d'une
  entreprise, dont le compte s'appelle « Résultat net : bénéfice » ;
- le plan des tiers indiquait de rattacher les clients à un compte d'effets à
  recevoir ;
- un transporteur voyait chaque cession de véhicule en hors activités
  ordinaires, ce qui sortait de son résultat d'exploitation un flux qui EST
  son exploitation.

**Conséquence pratique** · dans un logiciel qui produit des documents opposables
(comptables, juridiques, médicaux, fiscaux), le texte affiché doit être testé
comme du code. Pas seulement « la fonction rend le bon montant », mais « la
phrase servie à ce profil ne contient pas le vocabulaire de l'autre ».

**Garde-fou** · des tests qui lisent les fichiers source et cherchent des motifs
interdits par profil. Ils paraissent grossiers, ils attrapent ce qu'aucun test
de comportement ne peut voir. Voir §11 pour leur écriture.

---

## 2. Le même identifiant, pas le même sens

La forme la plus vicieuse. Deux régimes partagent un identifiant (un numéro de
compte, un code, une clé) mais lui donnent un contenu différent. Tout code qui
manipule l'identifiant fonctionne ; tout code qui l'AFFICHE ment.

Relevé sur ce projet :

| Identifiant | Régime A | Régime B |
|---|---|---|
| compte 131 / 139 | Excédent / Déficit | Résultat net : bénéfice / perte |
| compte 41 | Adhérents, clients-usagers | Clients et comptes rattachés |
| compte 412 | Clients-usagers | Clients, effets à recevoir en portefeuille |
| compte 4451 | TVA récupérable (générique) | TVA récupérable sur IMMOBILISATIONS |
| compte 654 | Dons en nature à distribuer | Valeurs comptables des cessions courantes |
| compte 17 | Fonds reportés | Dettes de location acquisition |
| compte 46 | Bailleurs, fonds d'administration | Apporteurs, associés et groupe |
| classe 9 | Contributions volontaires en nature | Engagements hors bilan |

Le cas du 412 est le plus instructif : la liste des relances étiquetait
« Client-usager » un compte qui, dans l'autre plan, porte des effets à recevoir
en portefeuille. Un effet en portefeuille n'est pas un impayé · le logiciel
présentait comme un retard de paiement ce qui n'en était pas un.

Et le cas du 654 est le plus dangereux : y écrire une cession sur le mauvais
régime porterait une cession dans le compte des dons reçus.

**Garde-fou** · une table de libellés PAR RÉGIME, jamais un libellé unique, dès
qu'un identifiant est partagé. Et un test qui confronte chaque libellé au
libellé réellement semé dans le plan cible · si le semis change, le libellé
d'écran doit changer avec lui.

---

## 3. Le cloisonnement fait d'un seul côté

Trois variantes, toutes rencontrées :

**a) La route est fermée, le CHAMP reste ouvert.** Le registre des bailleurs
était refusé au régime B par un garde sur son contrôleur. Mais `bailleurId`
restait accepté sur deux routes légitimement ouvertes aux deux : le plan de
comptes et les sections analytiques. Le refus doit porter sur le champ, pas
sur la route, quand la route a de bonnes raisons de rester ouverte.

**b) L'écran masque, le serveur accepte.** La forme juridique, les identifiants
légaux, le type de tiers « adhérent » : dans les trois cas l'écran filtrait
bien, et un appel direct à la route passait. Masquer n'est pas refuser.

**c) La porte est fermée dans un sens seulement.** `modifierFormeSyscohada`
refusait un dossier du régime A ; son pendant `modifierFormeJuridique`
n'existait pas en refus. Le commentaire annonçait pourtant « et
symétriquement » · la symétrie était écrite, pas codée.

**Garde-fou** · pour chaque refus posé, écrire le test du sens inverse dans le
même commit. C'est la moitié qu'on oublie.

---

## 4. Le défaut d'énumération qui fuit

Toute colonne à valeur par défaut devient une porte dérobée dès qu'un second
régime apparaît.

Ici : `formeJuridique` valait `ASSOCIATION` par défaut en base, POUR TOUS LES
DOSSIERS, y compris ceux du régime commercial. Un filtre écrit `formes: [ONG]`
paraissait donc suffisant · il ne l'était pas, puisqu'une entreprise pouvait
porter cette forme. Il fallait ajouter le filtre par régime ET fermer la route
qui permettait de poser la forme.

**Garde-fou** · quand un second régime arrive, lister toutes les colonnes à
défaut non nul et se demander, pour chacune : que vaut-elle sur un dossier de
l'autre régime, et qui la lit ?

---

## 5. Le « tronc commun » qui n'en est pas un

Un module annonçait « les dix étapes sont indépendantes du référentiel et sont
reprises telles quelles ». C'était vrai de leur INTITULÉ et faux de leur
contenu : sept étapes sur dix portaient dans leur détail et dans leur source le
vocabulaire et les articles d'un seul des deux régimes.

La phrase de commentaire faisait écran. Elle avait été écrite de bonne foi
quand il n'y avait qu'un régime, et personne ne l'a relue quand le second est
arrivé.

**Garde-fou** · à l'arrivée d'un second régime, chercher les commentaires qui
affirment une neutralité (« indépendant de », « commun aux deux », « quel que
soit ») et les VÉRIFIER un par un. Ce sont eux qui empêchent de voir.

---

## 6. La citation d'article : vérifier l'article, pas seulement la règle

Le code de ce projet cite ses sources en commentaire, ce qui est bien. Mais une
citation peut être fausse alors que la règle est juste, et c'est pire qu'une
absence de citation : elle envoie le lecteur au mauvais endroit.

Trouvés :

- le prorata temporis de la première annuité d'amortissement était attribué à
  « l'arrêté n° 013/2025, art. 30 ». L'arrêté ne porte que les taux ; l'art. 30
  est celui de la LOI, où il pose le linéaire comme régime de droit commun · la
  règle du prorata est à l'art. 34. La même citation fautive était dupliquée
  dans le schéma de base de données ;
- l'article qui impose le relevé trimestriel des sommes versées à des tiers
  était attribué à la loi de finances 2026, alors qu'il vient de celle de 2025 ;
- une règle sur la correspondance des bilans d'ouverture et de clôture était
  citée sous son article du régime A, servie à des dossiers du régime B où elle
  porte un autre numéro.

**Garde-fou** · la règle interne « jamais un article écrit de mémoire, toujours
lu à la source à l'instant » (CLAUDE.md §1 de ce projet) est la bonne, et elle
doit couvrir aussi les corrections. Une citation dupliquée dans deux fichiers
doit être corrigée dans le même geste, sinon la fausse survit à la correction.

---

## 7. Les seuils et les délais servis au mauvais régime

Trois trouvés, tous de même forme : une constante en dur, correcte pour le
régime d'origine, appliquée aux deux.

- délai de centralisation du brouillard · sept jours pour l'un, un mois pour
  l'autre. Une entreprise voyait signalées « en retard » des écritures qui ne
  l'étaient pas, trois semaines avant de l'être ;
- seuils de désignation d'un contrôleur des comptes · non seulement les
  montants diffèrent, mais la LOGIQUE diffère : trois critères ALTERNATIFS
  (un seul suffit) d'un côté, DEUX SUR TROIS de l'autre, avec en plus une forme
  juridique qui y est soumise sans condition de taille. Le logiciel alertait
  une entreprise bien en deçà de son obligation réelle, et l'aurait laissée
  tranquille si elle avait franchi la sienne autrement ;
- date de reprise d'une écriture différée · imposée à la clôture par un régime,
  recommandée à l'ouverture par l'autre.

Le deuxième cas est le plus riche d'enseignement : **on cherche spontanément
les seuils qui diffèrent, on oublie que la RÈGLE DE COMBINAISON des seuils peut
différer aussi.**

**Garde-fou** · typer la règle, pas seulement ses paramètres. Ici, un type somme
`{ALTERNATIF} | {DEUX_SUR_TROIS} | {TOUJOURS} | {AUCUNE_REGLE_LUE}` a rendu la
divergence impossible à ignorer, et le quatrième cas force à déclarer qu'on ne
sait pas plutôt qu'à emprunter la règle du voisin.

---

## 8. L'observation qui interroge une porte fermée

Un planning affichait des jalons enrichis de ce que le logiciel sait observer
tout seul (« 12 écritures encore au brouillard »). Une de ces observations
comptait des rapports d'activité, dont la route est réservée à un régime.

Résultat sur l'autre régime : le jalon affichait « Aucun rapport d'activité
établi », passait « en retard », et ne pouvait JAMAIS être satisfait. Une tâche
impossible à cocher, présentée comme un manquement.

**Garde-fou** · un indicateur automatique n'a de sens que si la donnée qu'il lit
est atteignable par le profil à qui on le montre. À vérifier explicitement,
c'est-à-dire à tester.

---

## 9. Le compte inventé, et la convention qui l'empêche

Deux fois, du code a manipulé un identifiant qui n'existe dans aucune
nomenclature officielle : un compte « 13000000 » fictif à la clôture, et la
tentation d'un « 65400000 » pour les cessions courantes.

Ce qui a sauvé la seconde fois est une CONVENTION DE SEMIS explicite : un
compte terminal est complété à droite par des zéros jusqu'à huit chiffres, un
compte qui a des subdivisions est semé non complété. La question « ce compte
existe-t-il ? » devient donc « la forme à huit chiffres est-elle dans le
fichier de semis ? », qui se répond par un test.

**Garde-fou** · se donner une règle mécanique qui rend l'existence d'un
identifiant DÉCIDABLE par lecture, et tester contre le fichier de référence
plutôt que contre sa propre mémoire.

---

## 10. Le décompte figé dans un commentaire

« les 44 comptes principaux à 2 chiffres », « les 76 en-têtes de division ».
Ces chiffres ne correspondaient à aucun des deux plans, et auraient de toute
façon vieilli à la première régénération.

**Garde-fou** · une règle s'énonce par sa CONVENTION, pas par un décompte. Et si
un décompte doit figurer, il se compte dans un test à partir du fichier, jamais
à la main dans un commentaire.

---

## 11. Écrire des tests sur du texte

C'est le garde-fou transversal, et il a pris trois formes utiles.

**a) Le motif interdit par profil.** Lire les fichiers, extraire les libellés
réellement servis à un profil, chercher les mots de l'autre. Bête, efficace.
Piège rencontré : une première rédaction embarquait le motif cherché dans le
message d'échec, si bien que l'assertion se mordait la queue et passait
toujours.

**b) La table reliée aux autres tables.** Le meilleur test écrit pendant cet
audit relie TROIS choses que rien ne reliait : le registre qui dit quel écran
est servi à quel régime, les identifiants d'aide réellement posés dans chaque
écran, et le texte que la fonction de résolution rendrait. Aucune des trois ne
suffisait seule.

**c) Le garde-fou du garde-fou.** Un test qui déduit une liste d'un fichier
(par expression régulière) doit d'abord vérifier que la liste n'est pas vide.
Sinon un changement de format la vide et le test passe sans rien vérifier.

Et une vérification que je recommande systématiquement : **casser exprès le
code pour voir le test échouer**. Fait une fois ici, en retirant une entrée du
lexique · le test a bien listé les deux écrans concernés. Sans cette
vérification, on ne sait pas si le test teste.

---

## 12. Ne pas trancher une contradiction du texte officiel en silence

Un référentiel se contredit sur le jeu d'états d'un de ses systèmes : son
article de tête en annonce quatre documents, son titre spécialisé en décrit
trois. Le logiciel suit le titre spécialisé, parce que c'est lui qui décrit les
tracés à remplir.

Ce choix est maintenant ÉCRIT dans le code, avec les deux références et la
raison. Sans cela, il aurait l'air d'un oubli au prochain lecteur, qui
l'aurait « corrigé ».

**Garde-fou** · toute anomalie de la source se signale sur place et ne se
corrige jamais en silence. Un écart documenté est une décision ; un écart
silencieux est un bug en attente.

---

## 13. Vérifier l'auditeur aussi

L'audit qui a produit ces constats était lui-même faillible, et quatre de ses
recommandations ont dû être écartées ou corrigées après lecture des sources :

- il proposait d'écrire qu'un article « exclut expressément les entités à but
  non lucratif ». L'article n'exclut personne · un autre inclut au contraire les
  activités exercées « dans un but lucratif OU NON » ;
- il proposait de réserver à un régime deux articles que l'autre régime
  n'exclut pas de sa liste d'exclusions · les réserver aurait créé la fuite
  inverse ;
- il proposait de garder un libellé pour un régime alors que ce libellé était
  faux pour les DEUX ;
- il lisait une tension juridique à l'envers : la réserve rédigée pour un
  profil laissait entendre à l'autre que son assujettissement était douteux,
  alors qu'il est la cible même du texte.

**Garde-fou** · un rapport d'audit est une piste, pas une source. La source est
la source. Les quatre corrections ci-dessus n'ont coûté que quelques minutes de
lecture chacune, et deux d'entre elles auraient introduit une erreur nouvelle.

---

## 14. Ce qu'il faut faire AVANT d'ajouter un second régime

Rétrospectivement, l'ordre qui aurait évité le plus de travail :

1. **Lister les points de divergence AVANT de coder**, en lisant les deux
   sources côte à côte : identifiants partagés au sens différent, seuils,
   délais, règles de combinaison, vocabulaire d'interface, obligations
   déclaratives. Cette liste est le vrai cahier des charges.
2. **Rendre le régime OBLIGATOIRE dans les signatures** des fonctions qui
   produisent du texte ou choisissent un identifiant. Un paramètre optionnel
   avec défaut reconduit silencieusement l'ancien régime partout.
3. **Poser une fonction de résolution unique** (ici `entreeLexique`,
   `libellesResultat`, `regleAuditeur`) plutôt que des conditions dispersées.
   Un seul endroit à tester, un seul endroit à corriger.
4. **Écrire les tests de cloisonnement en premier**, ils échoueront massivement
   et donneront la liste du travail.
5. **Relire tous les commentaires qui affirment une neutralité.**

Le coût de l'ordre inverse, mesuré ici : environ 200 constats d'audit, dont 116
retenus après vérification adverse, et une dizaine de sessions de correction.

---

*Écrit pour VMG Consulting, à partir de l'audit du chemin SYSCOHADA d'OmegaX.*
