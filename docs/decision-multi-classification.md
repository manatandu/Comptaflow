# Décision de structure · multi-classification de `Compte`, `Journal` et `Immobilisation`

Tranchée le 2026-09-23. Question ouverte par `plan-de-construction.md` § 3.6 et
reprise en avertissement dans `plan-ordonne-2026-09.md`, Phase I : « le
multi-classification se pose à la CONCEPTION. `Compte`, `Journal` et
`Immobilisation` sont tous mono-classification, et la migration renchérit
chaque mois. »

**Décision · on ne touche pas à la structure.** Les trois modèles restent
mono-classification. IFRS et consolidation, le jour où ils seront construits,
viendront en COUCHES posées à côté du grand livre légal, qui le lisent et n'y
écrivent jamais.

L'avertissement reposait sur deux prémisses. Aucune n'avait été vérifiée, et
les deux sont fausses pour la bonne architecture.

## 1. Ce que le droit demande vraiment

Le § 3.6 venait de Sage, pas d'un texte. Le texte dit autre chose.

- **AUDCIF, art. 73-1** · « Les entités dont les titres sont inscrits à une
  bourse de valeurs et celles qui sollicitent un financement dans le cadre d'un
  appel public à l'épargne doivent déposer, **EN SUS** des états financiers de
  synthèse SYSCOHADA, leurs états financiers établis selon les normes IFRS ».
  Les états IFRS s'AJOUTENT aux états SYSCOHADA, ils ne les remplacent pas. Le
  grand livre légal reste SYSCOHADA dans tous les cas.
- **AUDCIF, Titre V (cadre conceptuel), repris par le skill** · les états IFRS
  « ne servent pas de base au calcul du bénéfice distribuable ». Les autres
  entités d'intérêt public non cotées peuvent les établir SUR OPTION, toujours
  en sus.
- **AUDCIF, ch. XII-3, consolidation** · les comptes consolidés se bâtissent
  par **retraitement des comptes individuels** : homogénéisation, éliminations
  de nature fiscale, éliminations intra-groupe, changements de méthode. La
  consolidation part donc des comptes individuels tels qu'ils sont tenus, et
  les retraite à côté.
- **SYCEBNL** · une ASBL ou une ONG n'a ni titres cotés ni appel public à
  l'épargne. L'art. 73-1 ne la vise pas.

Les deux chantiers que le § 3.6 voulait préparer sont donc, en droit OHADA,
des jeux d'états SUPPLÉMENTAIRES, calculés à partir du jeu légal. Aucun des
deux ne demande qu'un compte, un journal ou une immobilisation porte deux
classifications dans le grand livre.

## 2. Ce que coûterait la mauvaise architecture · mesuré

La manière « Sage » de faire du multi-normes est de marquer chaque écriture
de la norme à laquelle elle appartient (une colonne de type `norme` sur
`Ecriture`), et de filtrer partout. Mesure du 2026-09-23 :

| | |
|---|---|
| Lectures de `ecriture` / `ligneEcriture` dans `src/` (hors specs) | **97** |
| Fichiers concernés | **30** |

Chacune de ces 97 lectures devrait porter le filtre. **Une seule qui
l'oublie mélange des retraitements IFRS dans le bilan SYSCOHADA déposé**, et
rien ne le signale : la balance boucle toujours, puisque chaque retraitement
est équilibré. C'est la famille de défaut la plus grave du dépôt, « ce qui
casserait en silence », et c'est exactement celle que l'extension de
cloisonnement a été écrite pour fermer côté `tenantId`. Ouvrir une seconde
famille du même type pour un besoin qu'aucun client n'a aujourd'hui serait
une faute.

## 3. « La migration renchérit chaque mois » · faux dans les deux cas

- **Côté données**, ajouter une colonne à valeur par défaut constante ne
  réécrit pas la table depuis PostgreSQL 11 (Neon tourne en 18). Le coût ne
  dépend pas du nombre de lignes.
- **Côté code**, ce qui grossit, ce sont les 97 lectures ci-dessus. Mais ce
  coût n'existe que pour l'architecture de la colonne, que la présente décision
  écarte.
- **L'architecture retenue**, des tables posées à côté, est purement ADDITIVE :
  aucune ligne existante n'est migrée, aucune des 97 lectures n'est touchée. Son
  coût ne bouge pas d'un mois sur l'autre.

## 4. La forme que prendront IFRS et la consolidation

Le jour où un dossier en aura besoin, et pas avant :

- **Une table de correspondance** `compte du dossier → poste IFRS`, à côté du
  plan de comptes. C'est le « compte reporting » de Sage (§ 3.5), sans toucher
  à `Compte`.
- **Une table de retraitements**, avec ses propres écritures équilibrées,
  rattachées à un exercice et à un motif (homogénéisation, élimination
  intra-groupe, écart de norme). Le jeu IFRS ou consolidé = la balance légale +
  les retraitements, projetés par la correspondance.
- **Pour une immobilisation**, un plan d'amortissement IFRS en table fille,
  quand la durée d'utilité ou la base diffère. La fiche et son plan SYSCOHADA
  ne changent pas.
- **Un invariant à tenir alors par un test** : aucune ligne de retraitement
  n'est lue par les états légaux. Il sera facile à écrire, puisque les états
  légaux ne connaissent pas la table.

`Journal` n'est concerné par aucun des deux chantiers.

## 5. Ce qui rouvrirait la question

Un signal client, pas une date :

- un dossier dont les titres sont cotés ou qui fait appel public à l'épargne
  (art. 73-1) ;
- ou un groupe qui doit publier des comptes consolidés, et pas seulement la
  combinaison que le module groupe produit déjà.

Ces deux signaux décident de la PRIORITÉ du chantier, pas de sa structure.

## 6. Conséquence pour la Phase I

La gestion commerciale (bon de livraison, avoir, relance, statistiques) peut
démarrer sans attendre : elle écrit dans des modèles qui ne changeront pas de
forme.
