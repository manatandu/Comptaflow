# § 9 bis et § 9 ter · La marque, l'interface

> Détail déplacé de CLAUDE.md (jusque-là chargé à chaque session). Les règles JAMAIS de CLAUDE.md priment ; lire ce fichier quand on touche au sujet.

## 9 bis. La marque

La charte graphique est `docs/charte-omegax.md`, et elle est OPPOSABLE : la
plupart de ses règles sont tenues par `client/src/components/chrome/marque.spec.ts`.

Trois choses à ne pas défaire :

- **le signe et le logotype sont des TRACÉS**, engendrés par
  `client/scripts/engendrer-marque.py` depuis les contours d'IBM Plex Sans
  SemiBold. Ni l'un ni l'autre ne se compose en texte : une police absente du
  poste du lecteur ferait rendre la marque dans une autre, sans qu'aucune
  erreur ne le dise. Le fichier `marque-geometrie.ts` est ENGENDRÉ · corriger
  le script, jamais le fichier ;
- **les polices sont servies depuis notre origine** (`client/public/polices/`),
  avec leur licence (`OFL.txt`). L'en-tête `font-src 'self'` interdit toute
  police tierce, et l'OFL exige que la licence accompagne le fichier de fonte
  redistribué ;
- **un rapport de contraste se MESURE**, il ne s'estime pas. La table du § 7.4
  de la charte a trouvé un `--text-dim` à 3,98:1 sur le fond de l'application,
  sous le plancher AA, que personne n'avait vu en deux ans.

## 9 ter. L'interface · le modèle est Sage, pas une invention

Décidé par Manasse le 2026-09-25 : « réfère-toi aux logiciels qui existent
vraiment ». Deux références, et la seconde prime pour le RENDU. La
DISPOSITION vient des manuels de Sage 100 i7 (Drive, captures de la saisie
des journaux) ; le RENDU vient de Sage Active et de Sage 100 Expérience, les
versions web actuelles de Sage, que Manasse a retenues (« c'est exactement ce
rendu de Sage moderne que je veux »). Les couleurs sont celles de la charte
OmegaX, JAMAIS le vert de Sage.

- **Police de 12 px** (Segoe UI 9 pt, celle de Windows et de Sage), posée sur
  `body` ; les tailles explicites des écrans restent entre 10,5 et 13 px.
- **Bandeau à l'encre de la marque.** La barre de titre, la barre verticale de
  l'accueil et la barre de titre de la fenêtre ACTIVE sont `--bandeau`
  (`--a-900`), texte et symbole en blanc (logo blanc prévu par la charte sur
  fond sombre). La barre de menus est blanche, survol bleu clair.
- **Grille blanche, en-tête plein.** Les tableaux sont blancs sur la fenêtre
  (`--fenetre`, gris bleuté très clair), l'en-tête est plein en `--a-700`
  texte blanc, les lignes séparées par un filet, sans quadrillage vertical ni
  zébrure, total sur `--a-50` (`index.css`, bloc TABLEAUX). Le bouton
  principal (`bg-sel`) est une pilule, comme le « + Créer » de Sage Active.
- **Aucun titre de page.** La barre de titre de la fenêtre porte le titre ; un
  fil d'Ariane ou un `<h1>` qui le répète est retiré. Les titres de CADRE
  (bloc, onglet, tableau) restent.
- **Aucun historique législatif à l'écran** (décision du 2026-09-26). Ce qui
  a été abrogé, remplacé ou renommé (IBP, IPR, Système allégé, INSS…) ne
  s'affiche pas · l'utilisateur lit la règle en vigueur et, pour un exercice
  antérieur, sa borne de date. L'histoire vit dans le code et les commentaires.
- **Aucun paragraphe explicatif à l'écran.** Sage n'en a pas. L'explication,
  la citation du texte et le « pourquoi » vont dans la bulle `Aide` (« ? »).
  Restent à l'écran : erreurs, refus, résultats, avertissements portant sur
  une DONNÉE du dossier, et les mentions qu'un test gèle, raccourcies à une
  ligne. Numéros et codes en police d'interface, pas en chasse fixe.
- **Un échec de lecture se dit, et null n'est pas vide** (audit final F179,
  F181, F183, F184, F207, F248, F254, F255). Une liste part de `null`, un
  refus s'affiche avec son motif, et « aucun » ne se dit que sur une liste
  LUE · « Aucune caisse sans procès-verbal » ou « Aucun mandat » sur un échec
  sont la réponse favorable à la question que l'écran pose. Le contexte
  d'exercice aussi · `lireLesExercices` ne lève jamais, le chargement se
  referme, et l'erreur s'affiche à la barre d'état et dans la fenêtre
  Exercices.
- **Un montant s'écrit par `lib/montants.ts`** (audit final F256) · deux
  décimales fixes, arrondi au centime, une absence rendue « · » et jamais lue
  comme zéro. Une quantité et un cours ne sont pas des montants et gardent
  leur précision. `montants.spec.ts` refuse toute copie du formatage.
- **« À propos » dit ce qui est installé** (F180) · version, révision et date
  de construction posées par `vite.config.ts`, et la date du paquet sur site ;
  ce qui manque se dit, rien n'est inventé.
- **L'accueil est la fenêtre principale de Sage i7**, lue dans ses manuels
  (« Ergonomie et fonctions communes i7 ») · une BARRE VERTICALE à gauche,
  groupes thématiques dont un seul est ouvert (« cliquez sur son intitulé »),
  et l'INTUISAGE à trois onglets, Accueil, Favoris, Indicateurs. Les favoris
  sont une préférence du poste (navigateur), jamais une donnée du dossier.
- **Titres formels, jamais une référence juridique** (décision du
  2026-09-28, « façon logiciel professionnel »). Aucun titre de cadre,
  onglet, en-tête de colonne, légende, groupe d'options, libellé de bouton
  ou de champ ne s'écrit « Article 212 » ni « (§ 116 c) » · il nomme ce que
  la section contient (« Contrôle des contrats »). La référence ne disparaît
  pas : infobulle `title` ou bulle `Aide`. Deux specs relisent les titres
  (`titres-formels.spec.ts`, `titres-formels-pages-m-z.spec.ts`).
- **Le mouvement sert la compréhension**, 120 à 280 ms, transform et
  opacité seules, et TOUT se coupe sous `prefers-reduced-motion` par une
  règle universelle (`mouvement-reduit.spec.ts`). Un compteur de montant
  finit sur la valeur exacte de `lib/montants.ts` (`lib/compteur.ts`). Les
  couleurs de la charte passent par des canaux RGB (`--x-rgb`), sans quoi
  `border-danger/30` ne produisait aucun CSS (`canaux-couleurs.spec.ts`).
- **Ce que l'écran montre dépend du dossier et du rôle, jamais les droits.**
  Modules activables par dossier (`tenant/modules-optionnels.ts`, paie,
  révision, gestion commerciale, consolidation, IFRS · un dossier neuf part
  sans eux, les existants et la vitrine les ont tous) ; accueil par métier
  (`lib/accueil-par-metier.ts`) ; démarrage guidé d'un dossier sans
  écriture (`lib/demarrage-guide.ts`, état lu par `GET /dossier/demarrage`).
  Masquer n'est pas refuser · le serveur tient seul les droits.

