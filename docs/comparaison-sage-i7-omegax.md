# Sage 100 Comptabilité i7 contre OmegaX · les dix activités à traiter

Relevé du 2026-09-25. La liste des fonctions vient du manuel de formation
« Sage 100 comptabilité i7 » (Drive, chaîne « Le Formateur », dix activités).
Chaque statut d'OmegaX a été lu dans le code (routes, DTO, schéma, écrans),
jamais déduit. OUI = même fonction ; AUTREMENT = le besoin est couvert par un
autre chemin ; PARTIEL = une partie manque ; NON = absent.

Règle de lecture : un pattern Sage est un point de comparaison, pas une
prescription (skill `sage-i7`). Plusieurs écarts ci-dessous sont VOULUS et
tiennent à un texte OHADA ; ils sont signalés comme tels.

## Constats d'ensemble

- **Aucune suppression de structure.** Comptes, journaux, tiers et taux n'ont
  pas de route de suppression. Seule la mise en sommeil (`estActif`) existe.
- **Le sommeil d'un compte se confirme à la saisie** (tranché le 2026-09-25,
  règle de Sage « confirmation requise en saisie »). Le serveur refuse une
  saisie sur un compte en sommeil tant qu'elle n'est pas confirmée ; la
  clôture et les modules ne sont pas concernés.
- **Impression des listes de structures** · faite au point 18 (liste à
  plat, périmètre dit).
- **Les à-nouveaux ne naissent qu'à la clôture définitive de N.** Pas de
  « nouvel exercice » à la mode Sage avec à-nouveaux provisoires.

## Activité par activité

| Activité Sage i7 | OmegaX | Ce qui diffère |
|---|---|---|
| 1. Lancement, barre verticale, barres d'outils | PARTIEL | Barre verticale sur l'accueil seulement, non masquable. Pas de mode assistant, pas de barres personnalisables (retirées volontairement). |
| 2. Nouveau fichier, identification, natures de compte, mot de passe | AUTREMENT / PARTIEL | Assistant en 8 étapes, création réservée à la console VMG. Manquent capital, courriel et site de la société. Natures de compte codées par préfixe, non paramétrables. Cinq rôles fixes au lieu d'un mot de passe de fichier. |
| 3. Plan comptable, journaux, tiers, taux de taxes | PARTIEL | Détail/Total, sommeil, types de journaux, compte de trésorerie : OUI. Suppression avec refus « mouvementé » : NON. Option « contrepartie à chaque ligne » : NON. Tiers : un sous-compte de classe 4 par tiers, pas de compte collectif + auxiliaire. Taux : une fiche porte les deux comptes (443 et 445), sans champ « sens ». |
| 4. Saisie des écritures | PARTIEL | Saisie journal + mois, F4 sur les comptes, suppression refusée si lettrée ou pointée (et en plus si validée) : OUI. TVA proposée au clic, net à payer par « Équilibrer » : pas automatiques. Saisie par lot, OD analytiques, import d'extraits bancaires, réimputation : NON. |
| 5. Interrogation et lettrage, recherche | PARTIEL | Lettrage complet (manuel, automatique, pré-lettrage) : OUI. Recherche d'écritures sur le libellé seul. Historique des rappels : écran depuis le point 17. |
| 6. États | OUI pour l'essentiel | Brouillard, journal, grand livre, balance, échéancier, balance âgée, taxes, bilan, analytique, contrôles, révision : OUI. États personnalisés : OUI depuis le point 20. Export des listes de structures : NON. |
| 7. Modèles de saisie | PARTIEL | Modèles par journal, appelés depuis la saisie. Les fonctions de ligne (Répéter, Incrémenter, Équilibrer, Calculer) et l'appel par F4 manquent. |
| 8. Fin d'exercice | AUTREMENT | Clôture qui solde 6 à 8 sur le 13 et génère le report à-nouveau (Solde ou Détail). Comptes 131/139 du plan OHADA, et non 1191/1199 du plan français · écart VOULU. Pas de report des budgets, pas de suppression du plus ancien exercice. |
| 9. Fusion des structures | NON | Aucune fusion de comptes, tiers ou journaux. |
| 10. Clôture des journaux | AUTREMENT | Partielle, totale et par période existent, et verrouillent par DATE. La modification est tenue par la validation (AUDCIF art. 22, 2°), écart VOULU. Le lettrage et l'analytique restent ouverts après une clôture totale, contrairement à Sage. |

## Manques classés par importance pour un cabinet

**Usage quotidien**
1. ~~Import des extraits bancaires et rapprochement automatique~~ · FAIT le
   2026-09-25 : import CSV/XLSX, correspondances proposées au montant exact
   puis confirmées, lignes « à comptabiliser ». Sans tolérance ni écriture
   d'ajustement, écart voulu avec Sage (CLAUDE.md § 6).
2. ~~Règlement des tiers à partir des échéances~~ · FAIT le 2026-09-25 : une
   pièce par tiers, lettrage immédiat, partiel admis, excédent refusé.
3. ~~Suppression des structures avec refus si mouvementée ou utilisée~~ ·
   FAIT le 2026-09-25, toutes les références comptées, lues dans le schéma.
4. ~~TVA et net à payer calculés d'office sur les journaux Achats et Ventes~~ ·
   FAIT le 2026-09-25, d'office pour un dossier déclaré assujetti, proposée sinon.
5. ~~Journal de trésorerie avec contrepartie à chaque ligne~~ · FAIT le
   2026-09-25, option par journal de trésorerie, refusée ailleurs.
6. ~~Modèles de saisie à fonctions (Répéter, Incrémenter, Équilibrer, Calculer)~~ ·
   FAIT le 2026-09-25 : Saisir, Répéter, Calculer (TVA), Équilibrer, modèle
   rattaché à un type de journal, appelé par F4. Incrémenter et Fonction non
   repris (CLAUDE.md § 6).
7. ~~Saisie par lot, saisie par pièce, OD analytiques~~ · FAIT le 2026-09-25 :
   saisie par pièce (date libre, Précédent / Suivant), OD analytiques
   équilibrées reprises par les états analytiques. Le lot n'a pas de stockage
   propre : l'import d'écritures au brouillard en tient lieu (CLAUDE.md § 6).

**Importants**
8. ~~Recherche d'écritures multicritère (montant, compte, pièce)~~ · FAIT le
   2026-09-25 : compte (par racine), montant exact ou fourchette, pièce,
   référence, libellé, dans le panneau du journal et son export.
9. ~~Réimputation d'écritures~~ · FAIT le 2026-09-25, depuis la recherche
   filtrée sur un compte : compte changé au brouillard, inscription en négatif
   puis enregistrement exact sur une ligne validée (AUDCIF art. 20 et 22, 2°).
10. ~~Fusion de comptes, tiers et journaux~~ · FAIT le 2026-09-25 pour les
    comptes (réimputation des exercices ouverts, puis sommeil) et les tiers
    (fiche absorbée, rien au journal). Les journaux ne se fusionnent pas : leurs
    pièces validées ne changent ni de journal ni de numéro (AUDCIF art. 22).
11. ~~Nouvel exercice avec à-nouveaux provisoires, report des budgets~~ · FAIT
    le 2026-09-25 : report provisoire au brouillard, relançable, remplacé par
    le définitif à la clôture ; budgets reportés sans rien écraser.
12. ~~Clôture totale qui fige aussi lettrage et analytique~~ · FAIT le
    2026-09-25 : la clôture totale, la clôture de période et la clôture
    d'exercice figent le lettrage (manuel, automatique, pré-lettrage,
    règlements) et la ventilation analytique ; la partielle les laisse
    ouverts, comme le dit le manuel i7. La clôture totale porte sur un
    journal jusqu'à une date (« pour le mois de janvier »), plus sur toute sa vie.
13. ~~Compte collectif et comptes auxiliaires de tiers~~ · FAIT le 2026-09-25,
    choix de Manasse : un compte individuel par tiers, créé tout seul sous le
    collectif de son type ; balance générale regroupable par collectif, le
    détail restant à la balance auxiliaire.
14. ~~Natures de compte paramétrables~~ · FAIT le 2026-09-25 : les sept natures
    du manuel i7, une fourchette de racines chacune, qui donnent leur mode de
    report et leur lettrage aux comptes créés ensuite ; les comptes dont le
    report contredit leur nature sont listés et s'alignent à la demande.
15. ~~Droits d'accès fonction par fonction~~ · FAIT le 2026-09-25 : profil de
    fonctions par utilisateur (seize fonctions), qui restreint ce que le rôle
    permet d'écrire et n'élargit jamais rien ; l'administrateur n'est jamais
    restreint. Source : support Sage X3 (profils de fonctions), les manuels i7
    du corpus ne décrivant qu'un mot de passe de fichier.

**Secondaires**
16. ~~Capital, courriel et site dans l'identification~~ · FAIT le 2026-09-25 :
    les trois champs de l'exemple i7. Le capital n'est pas décoratif · l'AUSCGIE
    art. 17 l'impose à côté de la dénomination, avec la forme, le siège et le
    RCCM, sur tout document destiné aux tiers (art. 891-1, 2°, sanction
    pénale ; « à capital variable », art. 269-2). La ligne s'imprime sous la
    dénomination et ses mentions manquantes sont dites ; refusé à une EBNL et
    à une personne physique.
17. ~~Fenêtre des journaux de saisie ; écran de l'historique des rappels~~ ·
    FAIT le 2026-09-25 : la saisie s'ouvre sur la grille journal × mois de
    Sage, chaque case dans son état (Brouillard, Journal, Clôturé ; « Non
    imprimé » non servi, OmegaX ne trace pas l'impression), un double clic
    ouvre le journal du mois. L'historique des rappels est un onglet de Rappel
    et relevé, par période et par compte, montant figé à l'émission, tranche
    dite ; frais d'impayé et pénalités de Sage non servis, OmegaX n'en
    calcule aucun.
18. ~~Éditions des structures (plan, tiers, journaux, taux, paramètres)~~ ·
    FAIT le 2026-09-25 : chaque fenêtre imprime sa liste À PLAT, avec
    l'en-tête du dossier, et dit son périmètre (liste complète ou sélection
    exacte, nombre de lignes) ; les paramètres s'impriment en fiche complète.
    Le manuel i7 ne fait que nommer ces commandes · les colonnes sont celles
    d'OmegaX. Trouvé au passage : toute impression sortait aussi les fenêtres
    ouvertes derrière la fenêtre active ; corrigé.
19. Banques, libellés, collaborateurs, plan reporting · PARTIEL le 2026-09-25.
    ~~Banques~~ et ~~libellés~~ FAITS : établissement et RIB (IBAN contrôlé
    ISO 13616, un RIB par journal de banque, jamais sur une caisse) ;
    libellés pré-enregistrés proposés au fil de la frappe en saisie.
    COLLABORATEURS et PLAN REPORTING NON FAITS, faute de source · le corpus ne
    les décrit nulle part (« collaborateurs » n'y paraît que comme exemple
    d'axe analytique, que les plans analytiques couvrent déjà), et les
    inventer serait écrire une règle Sage de mémoire.
20. ~~États personnalisés et reporting~~ · FAIT le 2026-09-25 : états définis
    par le cabinet (rubriques de racines de comptes, « 70 -709 » = 70 sauf 709,
    mesure solde ou mouvement, sens, totaux « A+B-C » sur lignes
    précédentes), enregistrés dans le dossier, calculés sur un à cinq
    exercices côte à côte depuis la balance générale, imprimables. Sage ne
    fait que nommer les « états libres » ; les cinq exercices viennent de
    l'historique de l'Édition pilotée. Ni état financier ni document déposé.
    Le cube de données de l'Édition pilotée n'est pas repris ; le simulateur
    l'est depuis le 2026-09-26 (priorité 6 ci-dessous).
21. ~~Documents attachés aux tiers~~ · FAIT le 2026-09-25 : volet Documents
    de la fiche tiers. Sage i7 : « un fichier lié » par pièce, « un commentaire
    de 69 caractères », rien d'autre ; le reste est d'OmegaX. La pièce est
    rangée EN BASE (décision de Manasse), 5 Mo au plus, et suit la sauvegarde
    nocturne comme l'archive de restitution (un fichier par pièce, à côté du
    CSV qui garde l'empreinte SHA-256). Formats fermés (PDF, PNG, JPEG, Word,
    Excel), vérifiés sur les OCTETS et non sur le nom ; rendue en
    téléchargement seulement ; une même pièce n'est pas attachée deux fois au
    même tiers. Aucun quota par dossier, seulement le plafond par pièce.

## Les autres produits Sage du corpus (relevé du 2026-09-25)

Les 21 points ci-dessus ne portaient que sur Sage 100 Comptabilité i7. Le skill
`sage-i7` documente aussi Sage Immobilisations, Moyens de Paiement, Édition
Pilotée, Paie et RH, et Sage X3 (`references/`). Relevé fait dans le code, même
méthode. D = la source décrit la fonction ; N = elle ne fait que la nommer.

| Produit | Fonction | Source | OmegaX |
|---|---|---|---|
| Immobilisations | Familles, composants, renouvellement, sortie | D | OUI |
| Immobilisations | Nature d'acquisition, lieu du bien sur la fiche | N | NON (le lieu n'existe que sur la fiche d'inventaire) |
| Immobilisations | Dégressif à coefficients, amortissement dérogatoire (15), plan fiscal plafond | D | OUI (2026-09-26, SYSCOHADA) · plan fiscal des art. 31 à 35, dérogatoire au 851/151 et reprise au 861 ; les anomalies des art. 32-33 tranchées et déclarées |
| Immobilisations | Plans National et IFRS natifs sur le bien | D | ÉCARTÉ · IFRS par retraitement à côté du jeu légal (décision multi-classification) |
| Moyens de Paiement | RIB des tiers, ordre de virement ou bordereau imprimable, état « en attente d'impression » | D (pattern), N (formats) | OUI (2026-09-26) · volet Coordonnées bancaires de la fiche tiers, ordre de virement préparé depuis Règlement des tiers, « en attente d'impression » puis imprimé, duplicata, annulation motivée |
| Moyens de Paiement | LCR, SEPA, ETEBAC, EBICS | N | ÉCARTÉ · formats européens |
| Moyens de Paiement | Lots de virements récurrents | N | PARTIEL · les abonnements produisent des écritures, pas des lots de paiement |
| Édition Pilotée | Tableau de bord, vue sur 5 ans | D | OUI (tableau de bord, états personnalisés) |
| Édition Pilotée | Simulateur de scénarios, cube de données | N (méthode), D (pattern) | OUI pour le simulateur (2026-09-26) · définition d'OmegaX : prévu tiré du réalisé d'un exercice de référence, taux par compte à deux chiffres des classes 6 et 7, prévu à date au prorata des jours, jauge sur l'écart défavorable aux seuils de la simulation ; le cube reste ÉCARTÉ, les requêtes vivantes suffisent |
| Paie et RH | Fiche salarié, contrat, bulletins, passation | D | OUI (P1 à P9) |
| Paie et RH | Moteur de constantes et barèmes paramétrables | D | PARTIEL (2026-09-26) · taux CNSS, INPP et ONEM et SMIG du manœuvre en versions datées, ajoutées par le cabinet avec leur texte après les versions livrées, la grille SMIG tirée de la tension salariale ; l'IRPP reste celui de la loi lue |
| Paie et RH | Rubriques créées par l'utilisateur, bulletins modèles | D / N | PARTIEL (2026-09-26) · rubriques du cabinet qui nomment un élément et en prennent la nature, jamais les assiettes ; bulletins modèles non servis |
| Paie et RH | Avances et prêts sur salaire (événement, retenue, solde) | D | OUI (2026-09-26) · registre, retenue sur le bulletin (4211, 4212, 272), solde calculé |
| Sage X3 | Profils fonctions | N | OUI (point 15) |
| Sage X3 | Habilitation par écran ou champ, filtrage des données par compte ou journal | N | PARTIEL (2026-09-26) · journaux autorisés par utilisateur, qui restreignent la SAISIE ; la lecture n'est pas filtrée, un état lu sur une partie des journaux serait faux ; l'habilitation par champ n'est pas servie |

Priorités proposées pour un cabinet congolais : (1) RIB des tiers et ordre de
virement imprimable, servi le 2026-09-26 ; (2) avances et prêts sur salaire, rubriques de paie
paramétrables, servis le 2026-09-26 ; (3) dégressif et dérogatoire pour le SYSCOHADA, servis le
2026-09-26 ; (4) barèmes de paie en données datées, servis le 2026-09-26 pour les taux de
cotisation et le SMIG ; (5)
filtrage des données par rôle, servi le 2026-09-26 comme journaux autorisés en saisie ; (6) simulateur budgétaire, servi le 2026-09-26. Le reste n'est que
nommé dans les sources et ne s'implémente pas sans meilleure source.
