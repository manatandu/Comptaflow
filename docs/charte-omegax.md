# Charte graphique OmegaX

**Version 2 · 5 septembre 2026.** Propriété de VMG Consulting.
Elle remplace la note `marque-omegax.md`, dont le signe était tracé au compas
et le mot composé en texte.

Cette charte n'est pas un document de présentation : c'est la RÈGLE. Chaque
prescription y est chiffrée, et la plupart sont tenues par un test
(`client/src/components/chrome/marque.spec.ts`). Une charte dont les règles ne
sont vérifiées nulle part se défait au troisième prestataire.

---

## 1. Le parti

OmegaX tient la comptabilité d'entités qui rendent des comptes. La marque dit
ce que fait le logiciel, pas ce que veut dire son nom.

L'oméga est la dernière lettre de l'alphabet grec : en comptabilité, c'est la
**clôture**. Sa forme est une arche posée sur deux pieds, séparés par un vide.
En partie double, ces deux pieds sont le **débit** et le **crédit**, et le vide
entre eux est la **ligne de partage** du journal. L'arche est l'équilibre qui
les referme.

Rien d'autre n'est ajouté. Pas de globe, pas de graphique ascendant, pas de
coche : ce sont les trois images que toute la concurrence emploie, et aucune ne
dit ce que fait précisément ce logiciel-ci.

---

## 2. Le signe

### 2.1 Ce qu'il est

Le signe est l'**oméga capital d'IBM Plex Sans SemiBold, recoupé** : ses pieds
sont allongés vers l'extérieur de 75/1000 d'em de chaque côté, et rien d'autre
n'est touché.

L'allongement suffit à faire passer la lettre au rang de signe. Elle prend une
assise que la lettre n'a pas, sa boîte devient plus large que haute
(767 × 710 unités, rapport 1,080), et elle cesse de se lire comme un oméga dans
un mot grec.

### 2.2 Pourquoi il est recoupé, et non dessiné

Une première version le traçait au compas : une arche d'épaisseur constante sur
deux barres. Elle était juste géométriquement et fausse typographiquement,
parce qu'un tracé au compas ignore les corrections optiques qu'un dessinateur
de caractères applique sans y penser.

Deux modifications ont été essayées et **rejetées**, chacune sur le rendu :

| Essai | Verdict |
|---|---|
| Épaissir les pieds à l'épaisseur du fût (140 unités contre 116) | Les 116 unités sont la compensation optique horizontale/verticale du dessinateur : une barre horizontale de même épaisseur qu'un fût vertical **paraît** plus lourde. Épaissir alourdit la base et fait apparaître un ressaut là où la jambe rejoint le pied. |
| Élargir la partition à une épaisseur de fût | Déplacer le bord intérieur du pied sans déplacer la courbe de la jambe qui le surmonte ouvre une encoche à l'angle rentrant. |

Ces deux essais sont conservés ici parce qu'ils sont séduisants sur le papier
(« tout dans le signe vaut un trait ») et faux à l'œil. Quelqu'un les
reproposera.

### 2.3 Les proportions figées

| Mesure | Valeur | Ce qu'elle porte |
|---|---|---|
| Hauteur | 710 unités/em | hauteur de capitale + dépassement optique |
| Largeur | 767 unités/em | rapport 1,080 · plus large que haut |
| Épaisseur du fût | 140 unités | 20,1 % de la hauteur de capitale |
| Épaisseur des pieds | 116 unités | plus fine que le fût, à dessein |
| Partition centrale | 102 unités | 14,4 % de la hauteur · elle tient à 16 px |

**Une asymétrie d'une unité, et elle n'est pas corrigée.** L'oméga d'IBM Plex
porte un pied gauche de 258 unités contre 257 à droite, la panse étant décalée
d'une demi-unité du même côté. C'est un arrondi du dessin d'origine, invisible
à toute taille : à 512 px il vaut un demi-pixel. Aligner les pieds seuls les
poserait sur un axe que la panse ne partage pas, et redresser la panse
voudrait dire redessiner la lettre. Le test de symétrie porte donc une
tolérance de deux unités sur mille, et cette ligne existe pour que personne ne
la prenne pour un relâchement.

---

## 3. Le logotype

« OmegaX », en **IBM Plex Sans SemiBold**, approche resserrée à **-15/1000
d'em**.

Le mot est figé en **contours**, jamais composé en texte. Les quatorze chartes
professionnelles dépouillées pour ce travail fixent toutes leur logotype :
aucune ne le laisse dépendre des polices installées sur le poste du lecteur.
Une police absente ferait rendre la marque dans une autre, et une marque qui
change de police n'est plus une marque.

L'approche a été choisie sur épreuve : à 0, le mot flotte ; à -30, la paire
« ga » se soude et le « aX » se touche.

**Le X ne se met jamais en valeur.** Ni couleur, ni graisse, ni capitale
détachée. Le nom se dit d'un seul tenant, et la capitale interne suffit à le
signer. Corollaire : **OMEGAX** en capitales forcées est interdit · les
capitales effacent la seule particularité du nom et lui donnent l'allure d'un
acronyme.

---

## 4. Les compositions

Trois compositions, et trois seulement. Elles ne se recomposent pas : leurs
rapports sont dans le script qui les engendre.

### 4.1 Bloc horizontal · la composition principale

Signe et mot alignés sur la **ligne de pied**, dans ce rapport :

| Rapport | Valeur | Pourquoi celle-là |
|---|---|---|
| Hauteur du signe | **1,12** × hauteur de capitale du mot | à 1,00 le signe se lit comme une septième lettre ; à 1,25 il écrase le mot |
| Écart signe/mot | **0,42** × hauteur de capitale | à 0,30 le pied droit du signe touche le O ; à 0,55 le bloc se disloque |
| Alignement | ligne de pied commune | les pieds du signe SONT une ligne de pied ; les poser ailleurs ferait flotter la marque |

Boîte : 4961,7 × 993,8 unités, rapport **4,993**.

### 4.2 Bloc vertical · les formats étroits

Signe au-dessus du mot, tous deux centrés. Le signe y monte à **2,2** fois la
hauteur de capitale, et non 1,12 : empilé au-dessus de six lettres, un signe à
1,12 ne fait plus que 22 % de la largeur du mot et se lit comme un accent. À
2,2 il en fait 44 %, et l'empilement tient. Écart 0,34 × hauteur de capitale.

Boîte : 3772,0 × 2682,9 unités, rapport **1,406**.

### 4.3 Signe seul et logotype seul

Le **signe seul** est admis dans une liste fermée, et nulle part ailleurs :

1. l'icône de l'application (barre des tâches, écran d'accueil, onglet) ;
2. l'avatar d'un compte sur un réseau ou dans un annuaire ;
3. une barre de titre ou un bandeau où le nom « OmegaX » est **déjà écrit à
   côté**, en toutes lettres ;
4. un filigrane de gabarit interne, à condition qu'un bloc complet figure
   ailleurs sur le même document.

Hors de ces quatre cas, le signe seul n'identifie rien : un lecteur qui ne
connaît pas encore OmegaX voit un oméga.

Le **logotype seul** sert là où le signe est déjà présent sur la même ligne :
le répéter dans le bloc complet le ferait figurer deux fois.

---

## 5. Zone de protection

Autour de toute composition, un rectangle libre dont la marge vaut **la moitié
de la hauteur de la composition**, sur les quatre côtés.

Rien n'y pénètre : ni texte, ni filet, ni image, ni bord de page, ni bord de
pavé coloré.

**Ce rectangle sert aussi de cartouche.** Quand la marque doit être posée sur
un fond qui ne lui offre pas le contraste exigé au § 7, on ne la recolorie pas :
on remplit ce rectangle en blanc (ou en encre, pour la version blanche) et on
pose la marque dedans. Le cartouche est alors la SEULE forme dans laquelle la
zone de protection peut être occupée, puisqu'elle l'est par un aplat neutre.

---

## 6. Taille minimale, et taille maximale

| Composition | Écran | Impression |
|---|---|---|
| Bloc horizontal | **18 px** de haut | **7 mm** de haut |
| Bloc vertical | 40 px de haut | 15 mm de haut |
| Signe seul | **16 px** de haut | 5 mm de haut |
| Logotype seul | 14 px de haut | 5 mm de haut |

**Sous le plancher du bloc**, on ne réduit pas : on passe au signe seul, ou au
logotype seul, selon lequel des deux la place autorise.

**Sous le plancher du logotype**, le nom « OmegaX » est **composé** en IBM Plex
Sans SemiBold, approche -0,015 em (classe `font-marque`) plutôt que tracé.
Même dessin, même approche, autre technique. C'est le cas de la barre de titre
de l'espace de travail, à 12 px. **Le nom ne s'écrit jamais dans une autre
police que celle du logotype.**

**Taille maximale.** Sur un document, la marque n'excède jamais **1/6 de la
plus grande dimension du format**. Une marque plus grande que cela cesse d'être
une signature et devient une illustration : c'est le défaut le plus fréquent
des documents faits en interne.

---

## 7. Couleurs

### 7.1 La couleur de la marque

**Encre OmegaX · `#142F6B`** · jeton `--a-900` dans `client/src/index.css`.

Ce n'est pas une nuance de plus dans l'échelle des bleus : c'est la couleur du
logo, et le logo ne se recolorie pas.

### 7.2 Les quatre rendus autorisés, et pas un cinquième

| Rendu | Fichier | Emploi |
|---|---|---|
| Encre sur fond clair | `logo-omegax.svg` | le cas normal |
| Blanc en réserve | `logo-omegax-blanc.svg` | fond sombre, photo dense |
| Noir | `logo-omegax-noir.svg` | télécopie, tampon, gravure, état imprimé en noir |
| Couleur héritée | `logo-omegax-courant.svg` | dans l'interface, pour suivre la couleur du texte |

**Aucune version tramée, dégradée, en niveaux de gris, ni en aplat d'une autre
couleur de la palette.** Une marque qui existe en huit teintes n'est plus
reconnue : elle est simplement vue.

Corollaire : **il n'y a pas de version filigrane du logo.** Pour marquer un
fond de document, employer le filet de clôture (§ 9), qui est fait pour ça.

### 7.3 Fonds autorisés et fonds interdits

| Fond | Encre | Blanc | Noir |
|---|---|---|---|
| Blanc `#ffffff` | **oui** · 12,74:1 | non · 1,00:1 | oui · 21,00:1 |
| `--surface-alt` `#f5f7fa` | **oui** · 11,87:1 | non | oui |
| `--bg` `#eceff4` | **oui** · 11,05:1 | non | oui |
| `--n-200` `#d3dae4` | oui · 9,05:1 | non | oui |
| Encre `#142f6b` | non · 1,00:1 | **oui** · 12,74:1 | non |
| Barre de titre `#1d2a3f` | non · 1,13:1 | **oui** · 14,43:1 | non |
| Noir `#000000` | non · 1,65:1 | **oui** · 21,00:1 | non |
| Photographie, texture, dégradé | non, sauf cartouche (§ 5) | non, sauf cartouche | non |

Les rapports sont **mesurés**, pas estimés (formule de luminance relative
WCAG 2.1). Le seuil retenu pour la marque est **4,5:1**, celui du texte
courant : un logo moins contrasté qu'un paragraphe se lit moins bien que lui.

### 7.4 Les couleurs de l'interface, et leur contraste mesuré

| Couple | Rapport | Niveau |
|---|---|---|
| `--text` sur `--surface` | 17,46:1 | AAA |
| `--text` sur `--bg` | 15,15:1 | AAA |
| `--text-dim` sur blanc | 5,30:1 | AA |
| `--text-dim` sur `--surface-alt` | 4,94:1 | AA |
| `--text-dim` sur `--bg` | 4,60:1 | AA |
| `--sel` sur blanc | 6,37:1 | AA |
| Blanc sur `--sel` | 6,37:1 | AA |
| `--positive` sur blanc | 5,36:1 | AA |
| `--warning` sur blanc | 5,42:1 | AA |
| `--danger` sur blanc | 6,21:1 | AA |
| `--chrome-text` sur barre de titre | 12,50:1 | AAA |
| `--chrome-text-dim` sur barre de titre | 6,55:1 | AA |

**Ne pas changer la couleur d'un texte de l'interface :** ces couples sont
approuvés pour l'accessibilité, et la table ci-dessus est ce qui l'établit.

> **Correction du 5 septembre 2026.** À `#6b7688`, `--text-dim` donnait
> **4,28:1** sur `--surface-alt` et **3,98:1** sur `--bg` · sous le plancher AA
> de 4,5:1 pour du texte courant. Le défaut ne se voyait nulle part : le texte
> restait lisible pour un œil valide, et aucun test ne mesurait. Le pas
> `--n-500` est passé à `#626c7d`, deux points de clarté plus bas, teinte et
> saturation inchangées. C'est cette table, et rien d'autre, qui l'a trouvé.

### 7.5 La marque n'a pas de couleur d'accent

Le vert, l'ocre et le rouge de la palette sont des couleurs de **signal** :
elles disent positif, avertissement, erreur. Elles ne sont jamais employées
pour décorer.

Dans un logiciel comptable, une couleur qui n'a pas de sens en vole une qui en
a. C'est pourquoi la marque s'en tient à l'encre, au blanc et à l'échelle des
gris.

---

## 8. Typographie

### 8.1 Les polices

| Rôle | Police | Graisses |
|---|---|---|
| Marque, titres, surfaces de marque | **IBM Plex Sans** | 400, 500, 600 |
| Chiffres, numéros de compte, codes journaux | **IBM Plex Mono** | 400, 500 |
| Texte dense de l'interface (grilles, menus) | pile système | celles du système |

Les deux Plex sont servies **depuis notre propre origine**
(`client/public/polices/`), jamais depuis un service tiers. Ce n'est pas une
préférence : l'en-tête `Content-Security-Policy` du site pose
`font-src 'self'`, qui interdit toute police externe. Une charte qui nommerait
une police que le logiciel ne peut pas charger serait une charte de papier.

Plex Mono était nommée dans la configuration depuis longtemps **sans être
chargée nulle part** : chaque poste retombait sur la monospace du système, et
la promesse du code était fausse. Elle est réelle depuis le 5 septembre 2026.

### 8.2 Pourquoi le texte dense reste sur la pile système

C'est une décision, pas un oubli. OmegaX se présente comme un logiciel
installé, pas comme un site : ses grilles, ses menus et ses barres empruntent
la police d'interface native de chaque plateforme, et le passage à une police
de marque changerait la chasse de chaque colonne sur trente-deux pages à grille
fixe. Le risque de débordement horizontal l'emporte sur le gain.

La règle est donc : **la marque a sa police, l'établi garde la sienne.** Ce que
la charte interdit, c'est le troisième cas · une police qui ne serait ni l'une
ni l'autre.

### 8.3 Le sous-ensemble latin ne suffit pas au français

Le sous-ensemble « latin » d'IBM Plex ne porte pas le **Ÿ**, qui existe en
français dès qu'on écrit en capitales (L'HAŸ-LES-ROSES, AŸ). Sans le
sous-ensemble latin-ext, il tomberait dans une police de repli au milieu d'un
mot, sans que rien ne le signale. Les deux sous-ensembles sont donc chargés,
séparés par `unicode-range` pour que le second ne descende que s'il sert.

### 8.4 Licence

IBM Plex est sous **SIL Open Font License 1.1**.

Deux conséquences, et elles ne se confondent pas :

- **Le logo** tiré des contours de la fonte n'est PAS soumis à l'OFL. La FAQ
  officielle traite le cas nommément : créer un logo à partir d'une fonte OFL
  est autorisé sans permission supplémentaire, et l'œuvre graphique qui en
  résulte n'hérite pas de la licence.
- **Le fichier de fonte** redistribué, lui, reste sous OFL et doit être
  accompagné de sa licence. D'où `client/public/polices/OFL.txt` et
  `client/scripts/fontes/OFL.txt`. Un test le vérifie : c'est le genre
  d'obligation qui part au premier nettoyage de dossier.

Ce qui reste interdit : publier une fonte MODIFIÉE sous le nom « IBM Plex »
(nom réservé par la licence). OmegaX ne modifie aucun fichier de fonte · il
n'en extrait des contours que pour son logo.

---

## 9. Le filet de clôture

Le seul élément graphique dérivé de la marque : un **trait interrompu en son
milieu**, dont le vide reprend la proportion de la partition du signe, soit
**13,3 % de la longueur du filet**, plafonné à 24 px.

Il sert de séparateur de section dans l'interface et sur les documents. C'est
lui, et non un filigrane du logo, qui marque un fond.

Il n'est jamais employé comme cadre, ni doublé, ni incliné.

---

## 10. Cosignature avec VMG Consulting

OmegaX est un produit du cabinet VMG Consulting. Trois postures, et il faut
choisir laquelle avant de composer :

| Posture | Ce qu'elle dit | Composition |
|---|---|---|
| **Produit** | OmegaX parle en son nom | marque OmegaX seule ; VMG en mention de pied, en texte |
| **Cautionnement** | VMG répond du produit | OmegaX à gauche, filet vertical d'un trait, VMG à droite, hauteurs de logotype égales |
| **Édition** | VMG parle, OmegaX est cité | marque VMG en tête, OmegaX en signature de pied, à la moitié de sa hauteur |

Dans la posture de cautionnement, les deux marques sont séparées par la somme
de leurs deux zones de protection, jamais moins. Elles ne se touchent jamais,
et aucune n'est enfermée dans un cartouche que l'autre n'a pas.

---

## 11. Usages interdits

Aucun de ces gestes ne casse un rendu : c'est pourquoi ils figurent ici.

1. Étirer, comprimer, incliner, faire pivoter, ou mettre en perspective.
2. Recolorier, tramer, dégrader, mettre en niveaux de gris, ajouter un contour.
3. Ajouter une ombre portée, un reflet, un biseau, une lueur.
4. Détourer le signe du mot pour les recomposer à d'autres proportions.
5. Écrire **OMEGAX** en capitales forcées, ou **Omega X** en deux mots, ou
   **OmégaX** avec accent.
6. Mettre le X en couleur, en graisse, ou en capitale détachée.
7. Poser la marque sur un fond qui ne lui offre pas 4,5:1, sans cartouche.
8. Recomposer le mot dans une autre police, si proche soit-elle.
9. Enfermer la marque dans une forme (rond, écusson, bulle) autre que le carré
   de l'icône.
10. Employer le signe seul hors des quatre cas du § 4.3.

---

## 12. Les fichiers

Tous sont **engendrés** par `client/scripts/engendrer-marque.py`. Ils ne se
retouchent pas : on corrige le script et on régénère. Un test relance le script
et compare, pour qu'une retouche à la main ne survive pas à un commit.

| Fichier | Contenu |
|---|---|
| `logo-omegax.svg` | bloc horizontal, encre |
| `logo-omegax-blanc.svg` | bloc horizontal, blanc |
| `logo-omegax-noir.svg` | bloc horizontal, noir |
| `logo-omegax-courant.svg` | bloc horizontal, couleur héritée |
| `logo-omegax-vertical.svg` | bloc vertical, encre |
| `logo-omegax-mot.svg` | logotype seul, encre |
| `logo-omegax-mot-courant.svg` | logotype seul, couleur héritée |
| `logo-omegax-signe.svg` | signe seul, encre |
| `logo-omegax-signe-blanc.svg` | signe seul, blanc |
| `logo-omegax-signe-courant.svg` | signe seul, couleur héritée |
| `icone.svg` | signe en réserve dans le carré d'encre |
| `icone-192.png`, `icone-512.png` | icônes de la PWA |
| `icone-maskable-512.png` | icône « maskable » d'Android, dessin dans les 80 % centraux |
| `avatar-omegax-1024.png` | avatar de réseau et d'annuaire |

**Quel format pour quel usage :**

| Usage | Format |
|---|---|
| Écran, web, interface | SVG |
| Document bureautique, présentation | SVG si l'outil l'accepte, sinon PNG à 3 fois la taille d'emploi |
| Impression offset, sérigraphie, gravure | SVG, remis tel quel à l'imprimeur |
| Réseau social, annuaire | `avatar-omegax-1024.png` |

Aucun JPEG, jamais : la compression salit les bords d'un aplat.

---

## 13. Ce que la charte ne couvre pas

Dit franchement, pour que personne ne l'invente :

- **Pas de mode sombre.** L'interface n'en a pas aujourd'hui. Le jour où elle
  en aura un, chaque couple du § 7.4 devra être remesuré : un rapport de
  contraste ne se transpose pas d'un fond clair à un fond sombre.
- **Pas de charte de marque VMG Consulting.** Le § 10 dit comment cosigner ;
  il ne dit pas comment se dessine la marque VMG, qui n'existe pas ici.
- **Pas de photographie, pas d'illustration, pas d'icônographie de marque.**
  L'iconographie de l'interface suit ses propres règles (`icons.tsx`).
- **Pas de déclinaison animée.** Une marque qui s'anime doit d'abord tenir
  immobile.

---

## 14. Régénérer

```bash
pip install fonttools brotli pillow
cd client && python3 scripts/engendrer-marque.py
```

Les deux fichiers de fonte dont le script a besoin sont versionnés dans
`client/scripts/fontes/`, avec leur licence. Le script n'est jamais exécuté à
la construction ni au démarrage : le logiciel ne sert que les fichiers produits.
