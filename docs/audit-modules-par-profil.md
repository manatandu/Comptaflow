# Audit des modules par profil de dossier

Établi le 2026-09-26, à soumettre à Manasse AVANT toute ligne de code. Question
posée : « les SMT n'ont vraiment pas besoin de tous ces éléments complexes ».
Réponse courte : c'est vrai, mais une partie de ce qui paraît complexe porte
aujourd'hui les états du SMT eux-mêmes, et deux modules y produisent déjà un
chiffre faux sans rien dire.

## Profils

| Code | Profil | Jeu d'états | Source |
|---|---|---|---|
| **A** | SYCEBNL, associations et ordres professionnels | Bilan, compte de résultat, TFT, notes | SYCEBNL art. 4, 1) |
| **P** | SYCEBNL, projets de développement | Tableau emplois-ressources, exécution budgétaire, réconciliation de trésorerie, bilan, compte d'exploitation, notes | SYCEBNL art. 4, 2) |
| **Sb** | SYCEBNL, Système minimal de trésorerie | Bilan (GA à HZ), compte de résultat (KA à KZC), notes 1 à 5 | SYCEBNL art. 5 et 6, Partie 4 ch. 1 § 1.3 et ch. 4 |
| **N** | SYSCOHADA, Système normal | Bilan, compte de résultat, TFT, 36 notes | AUDCIF art. 8 et 11, Titre IX |
| **So** | SYSCOHADA, Système minimal de trésorerie | Bilan, compte de résultat, notes 1 à 3, journal de trésorerie, deux journaux de suivi | AUDCIF art. 13 et 21, Titre X |

## Légende

- **U** · utile au profil.
- **F** · utile selon un FAIT du dossier, pas selon son profil (il a du
  personnel, il est assujetti à la TVA, il vend, il est une ONG étrangère, il
  contrôle une autre entité). Masquer par profil serait faux dans un sens ou
  dans l'autre.
- **S** · sans objet · retiré du menu, route laissée ouverte, données
  conservées.
- **C** · contraire au système · refusé au serveur pour toute création
  nouvelle ; lecture et historique conservés.
- **R** · déjà cloisonné par référentiel (§ 6 de CLAUDE.md), rien à changer.

## Ce que l'audit a trouvé avant le tableau

1. **OmegaX tient un dossier SMT en partie double sur le plan complet**, et
   reconstitue ses états depuis les mouvements de trésorerie ET les soldes des
   classes 3 et 4 (`etats-financiers-smt.service.ts`,
   `etats-financiers-smt-syscohada.service.ts`). La Note 2 (stocks), la
   Note 3 (créances et dettes) et les lignes de variation VA, VB, VC (SV1 à
   SV3 au SYSCOHADA) se LISENT dans les comptes de tiers et de stocks. Le texte
   veut un inventaire extra-comptable (SYCEBNL Partie 4 ch. 1 § 1.3 ; AUDCIF
   Titre X ch. 1 § 1) ; OmegaX le tient dans les comptes. **Masquer les tiers,
   la facturation ou la variation de stocks à un SMT viderait sa Note 3 et ses
   lignes de variation sans qu'aucun total ne bouge.** Ils restent.
2. **Ligne F du SMT SYSCOHADA · ce que le code a corrigé dans l'audit.**
   - Le prorata : l'audit l'annonçait faux. C'était inexact · le module des
     immobilisations applique déjà le « linéaire sans prorata temporis » du
     Titre X ch. 1 § 1 à un dossier SMT SYSCOHADA (`sansProrataTemporis`).
     Rien à corriger.
   - Les 69 et 85 lus en F : c'est VOULU, et les retirer aurait été un défaut.
     `composantesEcartConcordance` s'en sert pour que G égale le résultat du
     bilan ; retirés, une dotation déjà passée resterait sans ligne et G
     divergerait. La décision 3 est donc tenue À LA SOURCE · OmegaX refuse
     désormais de proposer une dépréciation ou un dérogatoire à un SMT (voir
     « Ce qui a été codé »). Une écriture passée à la main sur un 69 ou un 85
     reste lue en F, et c'est le bon comportement pour que l'état boucle.
3. **Le mode d'amortissement du SMT SYCEBNL n'est écrit nulle part.** La Note 1
   ne demande que la « durée d'utilité ». La règle « sans prorata » est celle du
   Titre X de l'AUDCIF · la transposer serait le premier piège du dépôt. Non
   tranché, rien ne change.
4. **Le registre des donateurs vaut pour les trois profils SYCEBNL**, SMT
   compris · art. 17, « pour chaque entité à but non lucratif ». Le masquer à
   une petite association serait une dispense inventée.
5. **Deux silences du texte signalés, non comblés.** L'art. 14 du SYCEBNL
   (livre d'inventaire) ne nomme que les jeux associations et projets, pas le
   SMT. Et la Partie 4 ch. 1 § 1.2 décrit le jeu des projets autrement que
   l'art. 4, 2) (« État des dépenses et des ressources ») · l'Acte prime, et
   OmegaX le suit déjà.

## Le tableau

| Module | A | P | Sb | N | So | Fondement |
|---|---|---|---|---|---|---|
| **Socle** · saisie, journaux, brouillard, plan comptable, journal/grand livre/balance, import, contrôles, fin d'exercice, affectation | U | U | U | U | U | SYCEBNL art. 16, 1) et 2) · AUDCIF art. 21 ; au SMT, « un journal par banque et un journal pour la caisse » (Note 4) |
| Rapprochement bancaire, relevé importé | U | U | U | U | U | Note 4 des deux SMT |
| Plan des tiers, interrogation et lettrage | U | U | U | U | U | Constat 1 · la Note 3 se lit dans les comptes de tiers |
| Facturation | F | F | F | U | U | LPF art. 23 (redevables d'IS, de TVA, d'IRPP) ; une ASBL ne vend qu'à titre accessoire (loi n° 004/2001 art. 1er) ; les journaux de suivi du Titre X portent un « N° facture » |
| Devis et commande client | R | R | R | F | F | AUDCG art. 234 · vente de marchandises entre commerçants |
| Balance âgée | U | U | S | U | S | Remplacée au SMT par la Note 3 et les journaux de suivi |
| Rappel et relevé | U | F | F | U | F | Associations · cotisations appelées (cadre conceptuel § 5.4.2.1) |
| Règlement des tiers | U | U | F | U | F | Décision d'OmegaX, aucun texte |
| Lots de virements, ordres de virement | U | U | S | U | S | Décision d'OmegaX, aucun texte |
| Échéancier de trésorerie | U | U | S | U | S | Décision d'OmegaX |
| Régularisations (CCA, CAP, PAR) et abonnements | U | U | **S** | U | **S** | Fait générateur à l'encaissement (SYCEBNL P4 ch. 1 § 1.3) ; créances et dettes en inventaire extra-comptable (Titre X). S et non C · voir question 1 |
| Registre des provisions pour risques et charges | U | U | S | U | S | Aucun poste dans les deux modèles SMT. Le registre ne passe aucune écriture · il se masque, il n'y a rien à refuser |
| Dépréciation des immobilisations | U | U | **C** | U | **C** | Aucun poste de dépréciation dans les deux modèles SMT ; la dotation y serait lue comme un amortissement |
| Immobilisations · registre et amortissement linéaire | U | U | U | U | U | Note 1 des deux SMT |
| Prorata temporis | U | U | ? | U | déjà sans | Titre X ch. 1 § 1 · déjà appliqué par le module (constat 2). Sb non tranché (constat 3) |
| Amortissement aux unités d'œuvre | U | U | ? | U | **C** | Titre X · mode linéaire seul |
| Composants, révisions majeures | U | U | S | U | S | La Note 1 SMT ne connaît que le bien |
| Dégressif fiscal et dérogatoire | R | R | R | U | **C** | Titre X linéaire ; aucun poste de provision réglementée ; le 85 entrerait en F |
| Inventaire physique, PV de caisse | U | U | U | U | U | AUDCIF art. 42 ; inventaire extra-comptable du Titre X ; fiche du 57 |
| Variation de stocks | U | U | U | U | U | Constat 1 · la Note 2 et VA/SV1 lisent la classe 3 |
| Magasin (inventaire permanent), boni/mali | U | U | S | U | S | Au SMT les stocks s'établissent par inventaire extra-comptable de fin d'exercice |
| Emballages et consignation | F | F | S | U | S | Décision d'OmegaX |
| Paie · registre, bulletins, barèmes, rubriques, passation | F | F | F | F | F | Code du travail · le fait est l'effectif. Au SMT, « Dépenses sur salaires » (JC) se lit au décaissement, la passation n'y nuit pas |
| Déclaration de TVA | F | F | F | F | F | Seuil de l'art. 42 du décret n° 011/42, personnes physiques et morales ; exonérations d'une ASBL (art. 15, 2° et 17, 8°) |
| Retenues et échéancier fiscal | U | U | U | U | U | Obligations de l'employeur et du preneur, indépendantes du système comptable |
| Résultat fiscal et IS | R | R | R | U | U | Loi n° 23/053 · le régime fiscal ne suit pas le système comptable |
| Plans analytiques, budgets, OD analytiques, états budgétaires | U | U | S | U | S | P · tableau d'exécution budgétaire obligatoire (art. 4, 2)) ; A · Note 35 |
| Simulateur budgétaire, états personnalisés, palmarès | U | U | S | U | S | Décision d'OmegaX |
| Registre des donateurs | U | U | **U** | R | R | SYCEBNL art. 17 (constat 4) |
| Bailleurs de fonds, dossier de subvention | F | U | F | R | R | Projets · fonds du bailleur (Note 9) |
| Registre des engagements de dépense | F | U | S | R | R | Colonne « Engagement » du tableau d'exécution budgétaire |
| Opérations spécifiques (dons, cotisations, fondateurs) | U | U | U | R | R | SYCEBNL Partie 3 |
| Exonérations, accord-cadre | F | F | F | R | R | Loi n° 004/2001 art. 37 et 39 · ONG étrangère |
| Checklist de constitution | U | U | U | R | R | Note circulaire n° 003/2013 |
| Circularisation, questionnaire, registre des faiblesses, dossier de révision | U | U | S | U | S | Travaux de révision du cabinet ; décision d'OmegaX pour le SMT |
| Mandat du contrôleur | F | F | F | F | F | SYCEBNL art. 19 ; AUSCGIE · la règle existante décide déjà |
| Documents obligatoires (livre d'inventaire, rapport, manuel) | U | U | U | U | U | SYCEBNL art. 14 et 16, 3) ; AUDCIF art. 16 et 19. Sb · silence de l'art. 14 (constat 5) |
| Groupe (cellules) | F | F | S | F | S | Décision d'OmegaX |
| Consolidation | R | R | R | F | F | AUDCIF art. 74, « toute entité qui […] contrôle » · non exclu au SMT, rare |
| États IFRS | R | R | R | F | S | AUDCIF art. 73-1 · titres cotés ou appel public à l'épargne. S au SMT est un jugement d'OmegaX, masque sans refus |
| Devises et réévaluation, monnaie fonctionnelle | F | U | S | F | S | Aucun écart de conversion dans les modèles SMT |
| Journal d'audit, restitution, utilisateurs, paramètres | U | U | U | U | U | Socle |

## Ce qui a été codé (décision « Go » du 2026-09-26)

- **Refus au serveur** (`src/common/systeme-minimal.ts`) · la DOTATION d'une
  dépréciation d'immobilisation aux deux SMT (sa reprise reste ouverte) ; au
  SMT SYSCOHADA seul, la création d'un bien aux unités d'œuvre, l'option du
  dégressif fiscal et tout nouveau dérogatoire (le solde du dérogatoire
  antérieur reste ouvert).
- **Masques** (`client/src/lib/profil-dossier.ts`) · les entrées « S » des
  colonnes Sb et So, aux menus et aux tuiles de l'accueil. La route reste
  ouverte ; rien n'est supprimé.
- **Non codé, et pourquoi** · les colonnes « F » (selon un fait) ne masquent
  rien : les masquer par profil serait faux. Les sous-fonctions « S » à
  l'intérieur d'une fenêtre (lots de virements, composants) restent
  visibles · leur fenêtre est utile, le reste est un raffinement.
- **Une hypothèse de l'audit ne tient pas** · « un dossier qui passe du SMT au
  Système normal retrouve ses menus » : le système comptable se verrouille
  dès la première écriture (`TenantService`). Les masques restent réversibles
  sur un dossier encore vide.
