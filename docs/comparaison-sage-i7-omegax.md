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
- **Aucune impression propre aux listes de structures** · seulement
  « Imprimer la fenêtre ».
- **Les à-nouveaux ne naissent qu'à la clôture définitive de N.** Pas de
  « nouvel exercice » à la mode Sage avec à-nouveaux provisoires.

## Activité par activité

| Activité Sage i7 | OmegaX | Ce qui diffère |
|---|---|---|
| 1. Lancement, barre verticale, barres d'outils | PARTIEL | Barre verticale sur l'accueil seulement, non masquable. Pas de mode assistant, pas de barres personnalisables (retirées volontairement). |
| 2. Nouveau fichier, identification, natures de compte, mot de passe | AUTREMENT / PARTIEL | Assistant en 8 étapes, création réservée à la console VMG. Manquent capital, courriel et site de la société. Natures de compte codées par préfixe, non paramétrables. Cinq rôles fixes au lieu d'un mot de passe de fichier. |
| 3. Plan comptable, journaux, tiers, taux de taxes | PARTIEL | Détail/Total, sommeil, types de journaux, compte de trésorerie : OUI. Suppression avec refus « mouvementé » : NON. Option « contrepartie à chaque ligne » : NON. Tiers : un sous-compte de classe 4 par tiers, pas de compte collectif + auxiliaire. Taux : une fiche porte les deux comptes (443 et 445), sans champ « sens ». |
| 4. Saisie des écritures | PARTIEL | Saisie journal + mois, F4 sur les comptes, suppression refusée si lettrée ou pointée (et en plus si validée) : OUI. TVA proposée au clic, net à payer par « Équilibrer » : pas automatiques. Saisie par lot, OD analytiques, import d'extraits bancaires, réimputation : NON. |
| 5. Interrogation et lettrage, recherche | PARTIEL | Lettrage complet (manuel, automatique, pré-lettrage) : OUI. Recherche d'écritures sur le libellé seul. Historique des rappels : route serveur sans écran. |
| 6. États | OUI pour l'essentiel | Brouillard, journal, grand livre, balance, échéancier, balance âgée, taxes, bilan, analytique, contrôles, révision : OUI. États personnalisés et reporting : NON. Export des listes de structures : NON. |
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
12. Clôture totale qui fige aussi lettrage et analytique.
13. Compte collectif et comptes auxiliaires de tiers.
14. Natures de compte paramétrables.
15. Droits d'accès fonction par fonction.

**Secondaires**
16. Capital, courriel et site dans l'identification.
17. Fenêtre des journaux de saisie ; écran de l'historique des rappels.
18. Éditions des structures (plan, tiers, journaux, taux, paramètres).
19. Banques, libellés, collaborateurs, plan reporting.
20. États personnalisés et reporting.
21. Documents attachés aux tiers.
