# Capacité réelle d'OmegaX · mesures du 3 septembre 2026

Jusqu'ici la capacité du logiciel était une estimation. Elle est maintenant
mesurée. Ce document dit comment, avec quels chiffres, et ce qui en découle.

## Le banc d'essai

- PostgreSQL 16 local, base neuve, les 58 migrations appliquées.
- Un dossier SYCEBNL, plan de comptes complet, **500 000 écritures** et
  **1 000 000 de lignes**, réparties sur 365 jours et 400 comptes d'imputation.
- Le serveur lancé avec `--max-old-space-size=460`, soit **la taille de tas
  d'un conteneur Cloud Run à 512 Mio**, celle de la production. Mesurer sur une
  machine de développement à 8 Gio n'aurait rien prouvé.
- Mesures par requêtes HTTP réelles, session ouverte, sérialisation comprise.

## Ce que pèse un dossier

| | |
|---|---|
| 500 000 écritures + 1 000 000 de lignes | **504 Mo** de base |
| dont données | 288 Mo |
| dont index | 205 Mo |
| par écriture (2 lignes, tout compris) | **~1 Ko** |

Un dossier d'ASBL ordinaire (disons 20 000 écritures par exercice) pèse donc
environ **20 Mo par exercice**. Le stockage n'est pas le sujet.

## Ce qui tient, et ce qui tombait

| Fenêtre | Temps | Verdict |
|---|---|---|
| Balance, tous comptes | 0,52 s | tient |
| Bilan | 0,52 s | tient |
| Compte de résultat | 0,50 s | tient |
| Tableau des flux de trésorerie | 0,51 s | tient |
| Grand livre d'UN compte (2 500 lignes) | 0,59 s | tient |
| Balance âgée | 6,7 s | lent, mais tient |
| Journal, 15 jours (41 000 lignes) | 6,2 s, 44 Mo de JSON | à la limite |
| Journal, 45 jours (123 000 lignes) | · | **serveur mort** |
| Grand livre complet | · | **serveur mort** |
| Liasse complète Excel | 61 s | **serveur mort** |

« Mort » se lit littéralement : `JavaScript heap out of memory`, le processus
s'arrête, et il emporte tous les autres dossiers servis par la même instance.
Cloud Run redémarre, mais toute requête en cours est perdue.

## Ce que la mesure enseigne

**Le plafond n'est pas le volume du dossier, c'est le nombre de lignes qu'UNE
fenêtre réclame d'un coup.** Les états financiers sont agrégés par la base
(`groupBy`) : un million de lignes leur coûte une demi-seconde, et dix
millions leur en coûteraient à peine plus. Ce sont les écrans qui rapatrient
des lignes une à une qui tombent.

Aucun test ne pouvait le voir : une doublure Prisma rend dix lignes. C'est le
même angle mort que celui du 2026-09-02 (voir `CLAUDE.md` §5) · ce que le
logiciel fait pour de vrai ne se déduit pas de ce qu'il fait en test.

## Ce qui a été posé

- `PLAFOND_ECRITURES_PAR_FENETRE = 2000` · la fenêtre Journal ne rend jamais
  plus, même si personne ne demande de limite, et elle **dit** qu'elle tronque
  (`tronque`, `total`). Les totaux, eux, restent ceux du journal ENTIER, pris
  par un agrégat SQL · c'est aussi ce qu'affiche Sage en pied de fenêtre.
- `PLAFOND_LIGNES_GRAND_LIVRE = 20000` · au-delà, le grand livre complet est
  **refusé**, pas tronqué. Un écran de travail peut ne montrer qu'une tranche ;
  un livre obligatoire amputé en silence est un document faux (AUDCIF art. 22,
  6° · reconstitution du chemin de révision).

Vérifié sur le même banc après correction : journal sur l'exercice entier,
2,0 s, 2 000 écritures sur 500 000 annoncées comme telles, totaux justes,
serveur vivant à 223 Mo de RSS.

## La liasse complète · le coupable n'était pas celui qu'on croyait

La première hypothèse était ExcelJS, qui construit tout le classeur en
mémoire avant de l'envoyer. Elle était fausse : le classeur produit ne pèse
que 148 Ko.

Les vrais coupables étaient DEUX calculs de notes annexes, qui chargeaient en
mémoire l'exercice entier :

- `chargerVentilationParNature` · toutes les écritures avec toutes leurs
  lignes, pour ventiler les provisions au prorata des contreparties ;
- `chargerEcheances` · toutes les lignes non lettrées, pour les répartir en
  « à un an », « à deux ans », « au-delà ». Sur un dossier dont rien n'est
  encore lettré, ce filtre ne retire RIEN.

Les deux lisent désormais par tranches de 5 000, curseur sur l'identifiant.
L'algorithme n'a pas bougé · seul le chemin de lecture. Sur le même banc,
après correction :

| | avant | après |
|---|---|---|
| Notes annexes | serveur mort | **200 en 43 s**, RSS 292 Mo |
| Liasse complète Excel | serveur mort à 61 s | **200 en 48 s**, RSS 335 Mo, 148 Ko |

Quarante-huit secondes pour une liasse annuelle d'un million de lignes est
long mais tenable. Le temps restant est celui de la lecture ligne à ligne ;
il tomberait en poussant la ventilation des échéances dans un agrégat SQL,
ce qui n'a pas été fait ce soir pour ne pas risquer de changer un montant
sans son propre test.

## Ce qui reste

Les exports de journal et de grand livre gardent leur refus au-delà de
50 000 lignes (`MAX_LIGNES_EXPORT`), eux construisent bien tout le classeur
en mémoire. Le `WorkbookWriter` en flux lèverait cette borne · c'est lui qui
rendrait de nouveau exportable le grand livre complet d'un gros dossier.

## Refaire la mesure

Le banc se remonte en une dizaine de minutes : un PostgreSQL local, les
migrations, un dossier semé, puis les lignes engendrées par `generate_series`.
Il n'a pas été gardé dans le dépôt · un jeu d'un million de lignes n'a rien à
faire dans les tests, qui doivent rester rapides. À refaire avant toute reprise
d'un dossier volumineux, et après tout changement des écrans Journal, Grand
livre ou Exports.
