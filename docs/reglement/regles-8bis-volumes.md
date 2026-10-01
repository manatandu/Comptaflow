# § 8 bis · Volumes et plafonds de fenêtre

> Détail déplacé de CLAUDE.md (jusque-là chargé à chaque session). Les règles JAMAIS de CLAUDE.md priment ; lire ce fichier quand on touche au sujet.

## 8 bis. Volumes et plafonds de fenêtre

La capacité du logiciel est **mesurée**, pas estimée · voir
`docs/capacite-mesuree.md` (banc du 2026-09-03, un million de lignes, tas de
460 Mio comme en production).

Ce qu'il faut en retenir : les états financiers sont agrégés par la base et ne
craignent pas le volume (une demi-seconde sur un million de lignes) ; les
écrans qui rapatrient des lignes une à une, eux, tuaient le serveur.

**Aucune route ne rend une collection sans borne.** Deux traitements, et la
différence est comptable, pas technique :

- un écran de TRAVAIL (le journal) peut ne montrer qu'une tranche, à condition
  de le DIRE (`tronque`, `total`) et de garder des totaux pris sur le
  périmètre entier ;
- un LIVRE OBLIGATOIRE (le grand livre) ne se tronque pas. Au-delà du plafond
  il se refuse, avec le chemin de rechange. Un livre amputé en silence est un
  document faux (AUDCIF art. 22, 6°).

**CE QUI PARCOURT TOUT UN EXERCICE LE LIT PAR TRANCHES** (2026-09-27, audit
final F185) · `common/lecture-par-lots.ts`, une seule écriture de la
pagination (`pageApres`, par identifiant, `skip: 1` sans quoi la ligne du
curseur est lue deux fois). Une somme se demande à la base (`aggregate`,
`groupBy`), jamais à une boucle sur des lignes rapatriées. Une liste
d'anomalies bornée dit son total (`Collecte`, `nombreSiTronque`), et un test
de structure exige le total de toute collecte servie.

