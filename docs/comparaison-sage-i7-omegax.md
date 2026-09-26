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

État relu le 2026-09-26, après les points 1 à 21 ci-dessous. Le tableau de la
première version (2026-09-25) disait « NON » de fonctions servies depuis ·
une liste de manques vieillit, elle se relit contre le code, jamais contre
elle-même (CLAUDE.md, P6).

- **Suppression des structures** · servie (point 3) : refusée tant qu'un
  lien existe, lu dans le schéma ; la mise en sommeil reste le chemin normal.
- **Le sommeil d'un compte se confirme à la saisie** (règle de Sage
  « confirmation requise en saisie ») ; la clôture et les modules ne sont
  pas concernés.
- **Impression des listes de structures** · point 18 (liste à plat,
  périmètre dit).
- **Nouvel exercice avec à-nouveaux provisoires** · point 11, relançables,
  jamais validés, remplacés à la clôture définitive.

## Activité par activité

| Activité Sage i7 | OmegaX | Ce qui diffère encore |
|---|---|---|
| 1. Lancement, barre verticale, barres d'outils | PARTIEL | Barre verticale et Intuisage (Accueil, Favoris, Indicateurs) sur l'accueil. Pas de mode assistant, pas de barres personnalisables (retirées volontairement). |
| 2. Nouveau fichier, identification, natures de compte, mot de passe | AUTREMENT | Création réservée à la console VMG. Capital, courriel et site servis (point 16), imprimés sur la facture et le devis (AUSCGIE art. 17). Natures de compte paramétrables (point 14). Rôles et profils de fonctions (point 15) au lieu d'un mot de passe de fichier. |
| 3. Plan comptable, journaux, tiers, taux de taxes | OUI, avec écarts voulus | Suppression refusée si utilisée (point 3), contrepartie à chaque ligne (point 5), banques et libellés (point 19). Un compte individuel par tiers rattaché à son collectif (point 13), choix de Manasse. Taux : une fiche porte 443 et 445, sans champ « sens ». Collaborateurs et plan reporting non servis, faute de source. |
| 4. Saisie des écritures | OUI | TVA et net à payer d'office dans les journaux d'achats et de ventes d'un dossier assujetti, opération exonérée retirable (point 4 et 5). Saisie par pièce et OD analytiques (point 7), import des relevés bancaires (point 1 de l'usage quotidien), réimputation (point 9). La saisie par lot n'a pas de table · l'import d'écritures au brouillard en tient lieu. |
| 5. Interrogation et lettrage, recherche | OUI | Lettrage manuel, automatique et pré-lettrage à confirmer. Recherche multicritère (point 8). Historique des rappels (point 17). Frais d'impayé et pénalités de relance non servis. |
| 6. États | OUI | États personnalisés (point 20), éditions des structures (point 18), simulateur budgétaire (priorité 6). « Non imprimé » des journaux non servi, rien ne trace l'impression. |
| 7. Modèles de saisie | OUI | Fonctions Saisir, Répéter, Calculer, Équilibrer et appel par F4 (point 6). Incrémenter et Fonction non repris · l'un sert aux numéros de pièce, l'autre n'est décrit nulle part. |
| 8. Fin d'exercice | AUTREMENT | À-nouveaux provisoires et report des budgets (point 11). Comptes 131/139 du plan OHADA et non 1191/1199 du plan français, écart VOULU. Pas de suppression du plus ancien exercice (conservation de dix ans, AUDCIF art. 24). |
| 9. Fusion des structures | OUI, sauf les journaux | Tiers et comptes (point 10) ; les journaux ne se fusionnent pas, une pièce validée ne change ni de journal ni de numéro (AUDCIF art. 22). |
| 10. Clôture des journaux | OUI | Partielle, totale bornée à une date, et par période ; la totale et la période figent aussi le lettrage et l'analytique (point 12). La modification reste tenue par la validation (AUDCIF art. 22, 2°), écart VOULU. |

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
| Immobilisations | Nature d'acquisition, lieu du bien sur la fiche | N | PARTIEL (2026-09-26) · lieux des biens servis (référentiel du dossier, porté sur la fiche, déplacement sans effet comptable) ; nature d'acquisition NON reprise · l'origine d'un bien se lit déjà dans son financement et son amortissement antérieur, un second champ donnerait deux sources pour un même fait |
| Immobilisations | Dégressif à coefficients, amortissement dérogatoire (15), plan fiscal plafond | D | OUI (2026-09-26, SYSCOHADA) · plan fiscal des art. 31 à 35, dérogatoire au 851/151 et reprise au 861 ; les anomalies des art. 32-33 tranchées et déclarées |
| Immobilisations | Plans National et IFRS natifs sur le bien | D | ÉCARTÉ · IFRS par retraitement à côté du jeu légal (décision multi-classification) |
| Moyens de Paiement | RIB des tiers, ordre de virement ou bordereau imprimable, état « en attente d'impression » | D (pattern), N (formats) | OUI (2026-09-26) · volet Coordonnées bancaires de la fiche tiers, ordre de virement préparé depuis Règlement des tiers, « en attente d'impression » puis imprimé, duplicata, annulation motivée |
| Moyens de Paiement | LCR, SEPA, ETEBAC, EBICS | N | ÉCARTÉ · formats européens |
| Moyens de Paiement | Lots de virements récurrents | N | OUI (2026-09-26) · définition d'OmegaX : fournisseurs et montant habituel, rappelés dans Règlement des tiers, factures les plus anciennes d'abord, jamais au-delà du dû ni sans facture ouverte |
| Édition Pilotée | Tableau de bord, vue sur 5 ans | D | OUI (tableau de bord, états personnalisés) |
| Édition Pilotée | Simulateur de scénarios, cube de données | N (méthode), D (pattern) | OUI pour le simulateur (2026-09-26) · définition d'OmegaX : prévu tiré du réalisé d'un exercice de référence, taux par compte à deux chiffres des classes 6 et 7, prévu à date au prorata des jours, jauge sur l'écart défavorable aux seuils de la simulation ; le cube reste ÉCARTÉ, les requêtes vivantes suffisent |
| Paie et RH | Fiche salarié, contrat, bulletins, passation | D | OUI (P1 à P9) |
| Paie et RH | Moteur de constantes et barèmes paramétrables | D | PARTIEL (2026-09-26) · taux CNSS, INPP et ONEM et SMIG du manœuvre en versions datées, ajoutées par le cabinet avec leur texte après les versions livrées, la grille SMIG tirée de la tension salariale ; l'IRPP reste celui de la loi lue |
| Paie et RH | Rubriques créées par l'utilisateur, bulletins modèles | D / N | OUI (2026-09-26) · rubriques du cabinet qui nomment un élément et en prennent la nature, jamais les assiettes ; bulletins modèles qui pré-remplissent la saisie de paie (définition d'OmegaX), sans attestation ni retenue d'avance, montants repris dans leur seule devise |
| Paie et RH | Avances et prêts sur salaire (événement, retenue, solde) | D | OUI (2026-09-26) · registre, retenue sur le bulletin (4211, 4212, 272), solde calculé |
| Sage X3 | Profils fonctions | N | OUI (point 15) |
| Sage X3 | Habilitation par écran ou champ, filtrage des données par compte ou journal | N | PARTIEL (2026-09-26) · journaux autorisés par utilisateur, qui restreignent la SAISIE ; la lecture n'est pas filtrée, un état lu sur une partie des journaux serait faux ; l'habilitation par champ n'est pas servie |

Priorités proposées pour un cabinet congolais : (1) RIB des tiers et ordre de
virement imprimable, servi le 2026-09-26 ; (2) avances et prêts sur salaire, rubriques de paie
paramétrables, servis le 2026-09-26 ; (3) dégressif et dérogatoire pour le SYSCOHADA, servis le
2026-09-26 ; (4) barèmes de paie en données datées, servis le 2026-09-26 pour les taux de
cotisation et le SMIG ; (5)
filtrage des données par rôle, servi le 2026-09-26 comme journaux autorisés en saisie ; (6) simulateur budgétaire, servi le 2026-09-26. Restes relevés le même jour :
en-tête du dossier (AUSCGIE art. 17) sur la facture de vente et le devis émis,
servi le 2026-09-26 avec leur impression ; lots de virements récurrents, servis
le 2026-09-26 (Règlement des tiers, définition d'OmegaX) ; tableau de synthèse
du début de ce document, remis à jour le 2026-09-26. Le reste n'est que
nommé dans les sources et ne s'implémente pas sans meilleure source.
