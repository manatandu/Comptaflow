# Analytique, budget et contrôles : ce que disent les manuels Sage, et ce qu'on en retient

Note de conception rédigée le 29/08/2026, **après lecture des manuels Sage du Drive**
et non par déduction. Elle sert de référence aux chantiers « comptabilité analytique »,
« budget » et « contrôles » d'OmegaX.

## 1. Sources réellement lues

| Source | Ce qu'elle apporte |
|---|---|
| `771175338-MANUEL-SAGE-COMPTABILITE-i7-EDM.pdf` | **Le document décisif.** C'est un guide Sage 100 i7 écrit pour une ONG (« Enfants Du Monde »), donc pour exactement notre cas d'usage. Il montre le paramétrage analytique et budgétaire réellement retenu par une organisation non lucrative |
| `667067001-Sage-comptabilite-i7.pdf` | Manuel de référence 8.50 : brouillard, clôture des journaux (3 types), modèles de saisie et d'abonnement, extourne, rapprochement, TVA débit/encaissement |
| `184929657-Support-compta-formation-sage-comptabilite.pdf` | Sommaire fonctionnel complet des 9 domaines (générale, auxiliaire, rapprochement, fin d'exercice, analytique, budgétaire, devises, IAS/IFRS, révision) |
| `744696676-Sage-Comptabilite-100.pdf` | Rappel / relevé / relance préventive, brouillard de saisie, balance âgée |

Non couverts par ces sources : **l'import paramétrable** et les **cycles de révision**
n'y sont décrits nulle part en détail. Ces deux chantiers devront être conçus sans
appui documentaire Sage, ou attendre une source complémentaire.

## 2. Ce que les manuels disent, littéralement

**Analytique.** « Jusqu'à 11 plans analytiques. Création de plan analytique structuré.
Saisie des OD analytiques. Interrogation analytique. Bilan et compte de résultat
analytique. États analytiques : balance, grand-livre, états inversés. » Les sections
analytiques ont un **type Détail ou Total**, exactement comme les comptes : « Détail
pour les sections utilisables dans les affectations et Total pour les sections de
totalisation dans les états ».

**Le paramétrage retenu par l'ONG.** Un seul plan analytique, nommé **PROJETS**, qui
« sera en même temps le plan budgétaire ». La case à cocher qui le permet est
« Gérer les budgets sur les sections analytiques ». Autrement dit : chez une
organisation non lucrative, **le plan analytique EST le plan budgétaire**. Il n'y a pas
de « poste budgétaire » distinct.

**La saisie.** La ventilation ne se fait pas dans un écran séparé : elle est une
**colonne de la grille de saisie**. Le guide ONG la décrit ainsi : « Dans la septième
colonne, saisir ou sélectionner la **ligne budgétaire** concernée par l'opération en
cours. Cette zone est seulement active lorsqu'un compte d'immobilisation (classe 2),
de charges (classe 6) ou de produits (classe 7) est utilisé. » La huitième colonne
« fonctionne exactement comme la précédente, seulement ici la sélection se fera sur
les **codes projets** ». Deux axes, donc, saisis en ligne.

**Le budget.** « Dans la zone Montant de la ligne Exercice, saisir le montant budgétisé
pour ce poste pour l'exercice en cours. Une **répartition homogène du montant annuel
est effectuée sur les périodes mensuelles**. Il est possible de modifier la dotation
d'une période. »

**Les états budgétaires.** « Comparatif entre les prévisions budgétaires et leurs
réalisations comptabilisées », avec deux options notables : imprimer ou non les
**budgets totalisateurs**, et imprimer ou non les **comptes non budgétisés** mais
mouvementés (une dépense engagée hors budget doit se voir).

**Le contrôle des cumuls.** État dédié : « les cumuls généraux et les cumuls
analytiques » avec « écart débit général et analytique, écart crédit général et
analytique ». Et une option « Inclure les écritures générales sans répartition »,
qui liste les écritures qui auraient dû être ventilées et ne l'ont pas été.

**La caisse.** Règle de clôture explicite : « Il est impossible de clôturer un journal
de caisse s'il a été **créditeur pour un jour de la période** ; afin d'éviter cela, il
est impératif d'enregistrer les écritures d'approvisionnement avant les dépenses. »

**Le brouillard.** « Un brouillard est un document qui permet de conserver une trace
écrite des saisies faites sur une période ou un journal. » La colonne « Position du
journal » affiche son état : brouillard, édité, clôturé. Et : « le programme refuse de
clôturer un journal non imprimé ».

**Rappels.** Trois états distincts, pas un seul : **Relance préventive** (avant
échéance), **Rappel** (« lettres de rappel sur l'ensemble des écritures non lettrées en
retard de paiement ») et **Relevé** (« relevé de toutes les écritures dues »).

## 3. Ce qu'on en retient, et ce qu'on écarte

Le tableau ci-dessous est la partie qui engage OmegaX. À gauche le mécanisme Sage tel
que les manuels le décrivent ; à droite ce qu'il devient chez nous, et pourquoi. Rien
n'est repris parce que Sage le fait : chaque ligne est justifiée par le SYCEBNL ou par
le contexte congolais.

| Mécanisme Sage | Ce qu'OmegaX en fait |
|---|---|
| Jusqu'à 11 plans analytiques | **Deux axes livrés d'office : Projet et Bailleur.** Le guide ONG lui-même n'en utilise qu'un. Onze axes sont un outil de contrôle de gestion industriel ; une EBNL a deux questions, « quel projet » et « quel financeur », et le modèle reste ouvert si un troisième axe s'impose |
| Sections Détail / Total | **Repris tel quel.** C'est déjà la logique de nos comptes (`TypeCompteDetailTotal`) : un projet a des sous-projets, un bailleur a des conventions successives |
| Ventilation active sur les classes 2, 6, 7 | **Reprise, plus la classe 9.** Le SYCEBNL loge en classe 9 les contributions volontaires en nature (900 à 914). Une journée de bénévolat affectée à un projet financé se rapporte au bailleur au même titre qu'une dépense : l'exclure de l'analytique amputerait le rapport d'exécution |
| Budget porté par les sections analytiques | **Repris, et c'est la décision structurante.** Pas de modèle « poste budgétaire » séparé : chez une EBNL le budget est celui du projet. Cela supprime un chantier entier de la feuille de route |
| Répartition homogène du budget annuel sur 12 mois | **Adaptée.** Un budget de bailleur ne suit pas l'année civile mais la durée de la convention. La section porte donc `dateDebut`/`dateFin`, et la répartition ne couvre que les mois de l'exercice réellement inclus dans la convention. Répartir sur douze mois un financement de huit mois fausserait tous les écarts |
| États budgétaires prévu / réalisé / écart | **Repris, avec une finalité que Sage n'a pas** : ils alimentent la **note annexe 35** (exécution budgétaire, associations) et le **tableau d'exécution budgétaire** des projets de développement, aujourd'hui remplis à la main. L'option « comptes non budgétisés mais mouvementés » est reprise : une dépense hors budget est précisément ce qu'un bailleur veut voir |
| État de contrôle des cumuls | **Repris, et rendu central.** C'est lui qui prouve que le total ventilé par projet égale le total comptable. Sans cette preuve, un rapport bailleur n'est pas défendable en audit |
| Caisse non créditrice, contrôlée à la clôture du journal | **Repris et renforcé.** En RDC la caisse espèces porte une part réelle de l'activité associative. Le contrôle ne doit pas attendre la clôture : il tourne en continu et signale le jour exact où le solde passe sous zéro |
| Journal non imprimé = clôture refusée | **Remplacé par la règle SYCEBNL, plus contraignante.** La Partie 2 ch. 2 impose que « les données des documents auxiliaires sont centralisées **au moins chaque semaine** dans le journal ou le grand-livre ». OmegaX signale donc tout brouillard de plus de sept jours, au lieu de se contenter d'exiger une impression |
| Extourne, bouton de la saisie | **Scindé en deux usages, dont l'un est interdit.** L'extourne comme correction d'erreur est proscrite par l'article 20 (« exclusivement par l'inscription en négatif »), et nous la refusons déjà. L'extourne reste légitime pour contre-passer à l'ouverture les écritures de régularisation de la clôture précédente : ce n'est pas une correction, c'est le second temps d'un mécanisme prévu. Les deux ne doivent jamais partager le même bouton |
| Rappel / relevé / relance préventive « clients » | **Repris dans sa structure à trois états, avec le vocabulaire du référentiel.** Une EBNL ne relance pas des clients en retard mais des **adhérents dont la cotisation appelée n'est pas payée** (compte 411), et accessoirement des clients-usagers (412). La lettre de rappel d'une association n'a pas la tonalité d'une mise en demeure commerciale |
| Devises, écarts de change, réévaluation avec reprise N+1 | **Repris, calé sur la RDC.** Couple CDF / USD, cours de la Banque Centrale du Congo, et alimentation des postes « Écart de conversion » actif et passif du bilan SYCEBNL, aujourd'hui affichés à zéro faute de mécanisme |
| Plan comptable, natures de compte, TVA à 7 types, IAS/IFRS, Sage Direct, portail fiscal | **Écartés.** Nomenclature française ou marocaine, régimes de taxe sans équivalent, obligations déclaratives d'un autre pays. Le plan SYCEBNL, la TVA congolaise à 16 / 5 / 1 / 0 % et les états de l'Acte uniforme les remplacent intégralement |
