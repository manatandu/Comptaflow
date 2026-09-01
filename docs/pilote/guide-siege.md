# Guide du siège · gérer un groupe de cellules dans OmegaX

*Pour le service comptable du siège (la « maison mère »). À utiliser avec la
formation VMG Consulting. Le guide du trésorier de cellule est un document
séparé, à distribuer.*

## Le principe en trois phrases

Votre organisation est UNE seule personne morale : les cellules sont ses
établissements, pas des entités distinctes. Chaque cellule tient son propre
dossier OmegaX (les petites en trésorerie simple, les grandes en Système
normal), et le siège voit tout, ne modifie rien, puis réunit tout à la
clôture en une seule liasse officielle. La discipline qui fait tenir
l'ensemble : tout transfert d'argent entre dossiers passe par le compte 58
« Virements internes », des deux côtés.

## 1 · Créer une cellule

Menu **État → Balance agrégée du groupe**, bouton **Nouvelle cellule**.

- **Nom** : votre nomenclature, librement (« Cellule Ngaliema 12 »).
- **E-mail du responsable** : celle du trésorier si la cellule travaillera
  directement dans OmegaX · un alias de votre comptable (par exemple
  `compta+ngaliema12@votredomaine`) si la cellule déposera des canevas et
  que c'est VOUS qui tiendrez son dossier.
- **Tenue des comptes** : Système minimal de trésorerie pour une petite
  cellule, Système normal pour une grande.
- Le **mot de passe s'affiche UNE SEULE FOIS** : notez-le immédiatement et
  remettez-le en main propre. À sa première connexion, le titulaire sera
  obligé d'en choisir un autre, que vous ne connaîtrez pas · c'est voulu.

Le dossier naît complet (plan de comptes, journaux, exercice) et déjà
rattaché au groupe. Le nombre de cellules que vous pouvez créer est borné
par votre licence · au-delà, contactez VMG Consulting.

## 2 · La règle d'or : le compte 58

Chaque fois que de l'argent circule entre le siège et une cellule (ou entre
deux cellules), l'ÉMETTEUR et le RECEVEUR l'enregistrent tous les deux, par
le compte 58 Virements internes (rubrique « Transfert… » du canevas).

Pourquoi c'est non négociable : à l'agrégation, tous les 58 du groupe
doivent s'annuler. S'ils ne s'annulent pas, OmegaX vous donne l'écart
exact · c'est un transfert enregistré d'un seul côté, et vous savez
immédiatement où chercher. Sans cette règle, les totaux du groupe seraient
gonflés et invérifiables.

## 3 · La supervision (votre tableau de bord hebdomadaire)

Menu **État → Balance agrégée du groupe**, onglet **Supervision**. Une
ligne par cellule :

| Colonne | Ce qu'elle vous dit | Réagir si… |
|---|---|---|
| Dern. écriture | Date de la dernière saisie | « jamais » ou une date ancienne : cellule dormante, appelez |
| Écrit. / Brouil. | Volume saisi, et ce qui attend validation | Brouillard qui s'accumule : validation en retard |
| Trésorerie | Solde caisse + banque de la cellule | Négatif ou invraisemblable : à vérifier |
| 58 (liaison) | Position des virements internes | Voyant orange : transfert enregistré d'un seul côté |
| Statut | PRÊTE / EN COURS / SANS EXERC. | Tout doit être PRÊTE avant l'agrégat |

Le bouton **Balance** ouvre la balance d'une cellule en LECTURE : vous
voyez tout, vous ne touchez à rien. Une correction se demande au trésorier,
qui la passe lui-même · c'est ce qui garde une piste d'audit propre (on
sait toujours qui a écrit quoi).

## 4 · Les cellules à canevas

- **Canevas** (bouton sur la ligne de la cellule) : télécharge le fichier
  Excel officiel, prérempli au nom de la cellule et de son exercice.
  Transmettez-le au trésorier avec son guide.
- **Déposer** : importe le canevas rempli. L'import est TOUT OU RIEN : la
  moindre ligne fausse est refusée avec son numéro et sa raison · renvoyez
  la liste au trésorier, il corrige, vous redéposez. Le même fichier ne
  peut pas être compté deux fois.
- Les lignes importées arrivent **en brouillard** dans le dossier de la
  cellule : votre comptable les relit puis les valide là-bas (c'est lui qui
  opère ce dossier). La validation est votre acte de contrôle · ne la
  déléguez pas à l'habitude.

## 5 · La clôture annuelle, dans l'ordre

1. **Calendrier** : donnez aux cellules à canevas une échéance PLUS PRÉCOCE
   qu'aux autonomes (elles ont un maillon de plus). Le siège clôture en
   dernier.
2. **Inventaire des cellules qui en ont besoin** : une petite cellule n'a
   en général rien à faire · mais une dette de décembre payée en janvier,
   un stock, une immobilisation propre, se traduisent par quelques
   écritures d'inventaire (classe 4, classe 3, dotations calculées par le
   module Immobilisations). Pour une cellule défaillante, le siège peut
   passer ces écritures dans SON propre dossier · l'agrégat réunit tout,
   peu importe où vit le retraitement.
3. **Supervision toute verte** : chaque cellule PRÊTE (équilibrée, plus de
   brouillard, au moins une écriture).
4. **Onglet Balance agrégée** : vérifiez les trois contrôles · tous les
   dossiers équilibrés, les 58 neutralisés, aucune cellule sans exercice.
   Tant qu'un voyant est rouge, l'agrégat vous le dit · ne forcez jamais.
5. **Exporter (Excel)** : le classeur contient la balance agrégée, le
   détail par dossier, et les contrôles.
6. **La liasse officielle** : dans le dossier de combinaison (un dossier
   dédié, créé une fois depuis la console VMG), menu Fichier → Importer des
   données → type Balance → la feuille « Balance agrégée » du classeur.
   Puis État → États financiers → la liasse complète. C'est CE document,
   unique pour toute l'entité, qui se dépose.

## 6 · Ce qui reste chez VMG Consulting

Votre licence (et celle de toutes vos cellules, alignées sur la vôtre), le
plafond de cellules, la création du dossier de combinaison, et l'assistance.
Un seul contact, un seul contrat.
