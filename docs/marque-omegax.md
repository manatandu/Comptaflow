# La marque OmegaX

Charte d'emploi du logo. Elle suit les rubriques conventionnelles d'une charte
professionnelle · zone de protection exprimée en fonction d'un élément du logo
lui-même, taille minimale distincte pour l'écran et l'impression, variantes par
fond, usages interdits, formats livrés. Aucune charte existante n'est reprise :
un logo et sa charte appartiennent à leur titulaire.

## 1. Le parti

OmegaX tient la comptabilité d'entités qui rendent des comptes. La marque dit
donc ce que fait le logiciel, pas ce que veut dire son nom.

L'oméga est la dernière lettre : en comptabilité, c'est la **clôture**. Sa forme
naturelle est une arche posée sur deux pieds, et en partie double ces deux pieds
sont le **débit** et le **crédit**. L'arche est l'équilibre qui les referme.

Trois éléments, et rien d'autre :

| Élément | Ce qu'il porte |
|---|---|
| Une arche d'épaisseur constante, tracée au compas | la précision, seule vertu qu'un comptable demande à un outil |
| Deux pieds à arêtes vives, qui s'écartent vers l'extérieur | les deux colonnes |
| Entre eux, un vide calibré | la ligne de partage du journal |

Le vide central n'est pas un espace résiduel : sa largeur est posée, et c'est
lui qui fait lire les deux pieds comme deux colonnes plutôt que comme deux
pattes. C'est la raison pour laquelle les pieds ont des **arêtes vives** quand
l'arche a des **bouts ronds** · un vide aux bords arrondis se lit comme un
intervalle, pas comme une ligne.

## 2. Une seule source, tous les formats

`client/scripts/engendrer-marque.py` est la source unique. Il produit :

| Fichier | Emploi |
|---|---|
| `client/src/components/chrome/marque-geometrie.ts` | la géométrie que l'interface dessine en SVG en ligne |
| `client/public/logo-omegax.svg` | le symbole sur son carré d'encre |
| `client/public/logo-omegax-symbole.svg` | le symbole seul, en `currentColor` |
| `client/public/logo-omegax-mono.svg` | variante monochrome |
| `client/public/icone.svg` | la favicon |
| `client/public/icone-192.png`, `icone-512.png` | les icônes de la PWA |
| `client/public/icone-maskable-512.png` | la variante que le masque d'Android rogne |

Ne jamais retoucher un de ces fichiers à la main : deux dessins tenus
séparément divergent toujours, et l'écart ne se voit qu'une fois la marque
imprimée. Corriger le script, puis relancer :

```bash
cd client && python3 scripts/engendrer-marque.py
```

## 3. Le mot n'est pas dessiné, et c'est délibéré

Un logotype se trace normalement en courbes : une police absente du poste du
lecteur ferait rendre la marque dans une autre. Mais tracer six lettres à la
main sans fonderie ni outil de vectorisation donne des lettres approximatives,
et une marque à lettres approximatives est pire qu'une marque sans lettres.

Parti retenu, qui est celui de beaucoup d'éditeurs : le **symbole** est
vectoriel et figé ; le **mot** est composé par l'interface, en texte véritable
(`BlocMarqueOmegaX`), graisse 600, interlettrage resserré à -0,015 em. Il reste
sélectionnable, lisible par un lecteur d'écran, et net sur tout écran.

Le jour où le cabinet fait dessiner un logotype par un typographe, il remplace
`BlocMarqueOmegaX` et rien d'autre.

**Le nom s'écrit `OmegaX`**, jamais `OMEGAX` ni `Omegax`. Les capitales forcées
effacent la capitale interne du X, qui est la seule particularité du nom, et
donnent au mot l'allure d'un acronyme.

## 4. Zone de protection

Autour du symbole, réserver de tous les côtés **la moitié de sa hauteur**. Rien
n'entre dans cette zone : ni texte, ni filet, ni bord de page, ni photo.

La mesure est exprimée en fonction du logo lui-même, et non en pixels, pour
qu'elle reste juste à toutes les tailles.

## 5. Taille minimale

| Support | Minimum |
|---|---|
| Écran | **16 px** de côté |
| Impression | **6 mm** de côté |

En dessous, l'ouverture de l'arche se referme et le signe devient une tache.
L'épaisseur du trait est posée à 13,1 % du côté précisément pour tenir à 16 px ·
en dessous de 10 %, l'oméga se bouche à cette taille.

## 6. Couleurs

| Rôle | Valeur |
|---|---|
| Encre (le carré) | `#142f6b` |
| Signe sur l'encre | `#ffffff` |
| Signe seul | la couleur du texte héritée (`currentColor`) |

Sur un fond quelconque, le signe doit conserver **4,5:1** de contraste avec ce
fond. En dessous, employer la variante sur carré d'encre plutôt que de forcer
le signe seul.

## 7. Usages interdits

- L'étirer, le comprimer, le pencher, le faire pivoter.
- Lui ajouter une ombre portée, un dégradé, un contour, un effet de relief.
- Recolorer l'arche et les pieds différemment · un premier jet l'a essayé, les
  pieds se détachaient en étagère sous l'arche et la lettre cessait de se lire.
- Le poser sur une photo chargée sans le carré d'encre.
- Remplacer l'oméga par le caractère typographique « Ω » d'une police
  d'interface · ce n'est pas la même lettre, et son dessin change d'un poste à
  l'autre.
- Écrire le nom en capitales, ou séparer le « X » du reste.

## 8. Ce qui reste à faire

Le logotype dessiné (voir § 3) et le dépôt de la marque, qui relèvent tous deux
d'une décision de VMG Consulting.
