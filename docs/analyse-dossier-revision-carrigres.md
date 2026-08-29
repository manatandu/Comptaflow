# Ce qu'un dossier de révision réel apprend au logiciel

Note d'analyse, 29 août 2026. Source : dossier CARRIGRES sur le Google Drive
(`Carrières / CARRIGRES 09-2025` et `CARRIGRES 12-2025`), soit une balance
générale, deux grands livres, un fichier de préparation de liasse et deux
fichiers de reporting, plus une arborescence de travail par cycle.

CARRIGRES est une carrière, pas une EBNL : elle relève du SYSCOHADA et tient
ses comptes en euros. **Rien de sa nomenclature n'a été repris.** Ce qui a été
repris, c'est la façon dont un dossier de révision est organisé et lu, qui ne
dépend ni du référentiel ni du secteur.

## 1. Ce que dit l'arborescence

Le dossier est rangé par **cycle**, pas par mois ni par nature de fichier :

```
CARRIGRES 12-2025/
  Balance générale & Reporting     Fisc              RH
  Clients                          Fournisseurs      Stock
  Autres tiers                     Immo & amortissement
  État & organismes sociaux        Trésorerie        Revenu
  Fichier prépa liasse.xlsx
```

C'est exactement le découpage des chapitres 3 à 5 des notes de cours du CPCC
(bureau Fournisseurs, bureau Clients, bureau Caisse et banques, bureau Paie).
Deux sources indépendantes, la même organisation : ce n'est pas une habitude
locale, c'est la structure du métier.

OmegaX range ses écrans par verbe (Saisie, Traitement, État) et non par cycle.
Ce n'est pas à changer, la barre de menus de Sage fait de même. Mais cela
désigne une brique manquante, notée au § 5.

## 2. La balance à six colonnes, corrigée

La balance CARRIGRES porte :

| Solde débit avant période | Solde crédit avant période | Débit | Crédit | Débit cumulé | Crédit cumulé |
|---|---|---|---|---|---|

L'export d'OmegaX n'en montrait que trois : total débit, total crédit, solde.
Or `EcritureService.balance()` **calculait déjà** la scission report /
mouvements, utilisée par les notes annexes 5A à 5F. L'export la jetait.

Conséquence concrète : sur un compte d'immobilisation, le total englobe le
report à-nouveau, et un bâtiment détenu depuis 2020 y est indiscernable d'une
acquisition de l'exercice. Un réviseur devait retourner au grand livre pour une
information que le logiciel avait en mémoire.

Corrigé : l'export de la balance porte désormais les six colonnes plus le
solde, avec les libellés « à l'ouverture » et « mouvements » qui disent ce
qu'ils sont.

## 3. L'évolution mensuelle, construite

C'est l'apport principal du reporting CARRIGRES. Presque tout le fichier est
bâti sur une seule forme : **un compte par ligne, un mois par colonne**, du
salaire de base aux ventes de grès par calibre, en passant par les carburants
et lubrifiants.

```
carburants   17,447.66  17,242.36  15,944.70  17,770.49  13,557.77 ...  170,731.39
lubrifiants   6,903.38   6,411.03   5,381.60   5,147.65   5,886.46 ...
```

C'est ainsi qu'on voit ce qu'aucun cumul ne montre : une charge qui double en
juillet, un produit qui disparaît en septembre, une régularisation passée deux
fois. OmegaX donnait le cumul de l'exercice et la comparaison N/N-1 ; entre les
deux, il n'y avait rien.

`ControlesService.evolutionMensuelle()` produit cette vue, avec trois décisions
prises en la construisant :

- **Les colonnes se déduisent de l'exercice**, pas de l'année civile. Un
  premier exercice ouvert au 1er septembre en compte quatre, pas douze.
- **Le report à-nouveau est tenu à part.** Sans cela, janvier porterait tout le
  passé du compte et écraserait la lecture de l'année entière.
- **Un mois par colonne, en net signé**, et non deux colonnes débit/crédit par
  mois : vingt-quatre colonnes ne se lisent pas.

S'y ajoute un signalement que le tableur ne fait pas : le **mois le plus
éloigné de la moyenne** des mois mouvementés du compte est surligné, à partir
de trois mois mouvementés et d'un écart d'au moins 100 %. En dessous, ce serait
du bruit : un loyer payé deux fois dans l'année n'a pas de mois aberrant.

## 4. Les comptes dormants, construits

Le grand livre CARRIGRES porte, à côté de chaque compte, sa date de création et
celle de son dernier mouvement. On y lit :

```
461310  O N E M              08-janv.-63   00-janv.-00
469150  DEBITEUR DIVERS      26-juin-84    29-juin-12
470020  COMPTE D'ATTENTE A JUSTIFIER ...
```

Des comptes ouverts en 1963 et 1984, dont l'un n'a plus bougé depuis 2012, tous
toujours dans le plan. Et un « compte d'attente à justifier » qui porte bien
son nom.

OmegaX savait mettre un compte en sommeil (`Compte.estActif`) sans jamais dire
lesquels le méritaient. `ControlesService.comptesDormants()` le dit, avec deux
distinctions qui comptent :

- un compte **jamais mouvementé** n'est pas dormant, il n'a jamais servi : les
  deux appellent des décisions différentes ;
- un compte dormant **à solde non nul** passe en tête de liste. C'est celui qui
  pose une question comptable, pas seulement un problème de propreté du plan.

## 5. Ce que le dossier désigne et qui reste à faire

**Le dossier de révision par cycle.** CARRIGRES range ses justificatifs par
cycle et par exercice. OmegaX produit des états mais n'a pas de notion de
dossier de travail : il ne sait pas dire « le cycle Fournisseurs est justifié,
le cycle Stock ne l'est pas ». La brique manquante est un état d'avancement par
cycle, adossé aux comptes de chaque cycle, que le planning de clôture pourrait
observer comme il observe déjà le brouillard.

**La table de regroupement, et ses `#N/A`.** Le fichier de préparation de
liasse est une recherche depuis la balance vers une table de correspondance
maintenue à la main, et les comptes non trouvés y apparaissent en `#N/A`. Il y
en a des dizaines. OmegaX produit déjà une feuille « comptes non rattachés »
dans ses exports d'états financiers, ce qui est la bonne réponse ; ce dossier
confirme surtout l'ampleur du problème en pratique et vaut d'être rappelé à
l'utilisateur avant l'arrêté, pas seulement dans un onglet d'export.

**Le budget contre le réel, par rubrique.** Le reporting s'ouvre sur un
« EBIT Budget » comparé au réalisé, rubrique par rubrique, avec l'écart. OmegaX
a la matière (`BudgetSection`, comptabilité analytique) et un écran d'états
budgétaires ; le rapprochement à la maille des rubriques de gestion, lui, reste
à construire.

**La tenue en devise étrangère.** CARRIGRES tient ses comptes en euros. C'est
courant en RDC, et cela heurte l'article 141 de la loi n° 23/053, qui impose
une comptabilité « exprimée en Franc congolais ». OmegaX porte une monnaie de
tenue par dossier (`Tenant.devise`, CDF par défaut) et gère les opérations en
devise ; il ne dit rien de cette tension. À trancher avec un praticien avant de
coder quoi que ce soit : c'est une question de droit, pas de logiciel.

## 6. Ce qui n'a pas été repris, et pourquoi

**La nomenclature.** Comptes 101000 CAPITAL, 711100 CONCASSES 2/8-4/6, 651100
SALAIRE DE BASE : c'est du SYSCOHADA d'entreprise industrielle. Une EBNL n'a ni
capital, ni ventes de granulats. Le plan SYCEBNL d'OmegaX reste seul.

**Les niveaux d'agrégation à cinq étages** (`45, 451, 4514, 45140, 451400`).
OmegaX agrège par racine avec des comptes de type Total, ce qui couvre le
besoin sans imposer une hiérarchie fixe.

**Les artefacts du tableur** (`##########`, colonnes vides en série, formules
cassées). Ils rappellent seulement pourquoi ce travail ne devrait pas se faire
dans un tableur.
