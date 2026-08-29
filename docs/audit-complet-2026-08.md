# Audit complet d'OmegaX · 29 août 2026

Trois examens croisés, menés en parallèle et vérifiés dans le code (jamais
sur résumé) : les manuels Sage 100 i7 du Drive, l'intégralité du référentiel
SYCEBNL (texte légal, plan des comptes, Partie 3, Partie 4, guide
d'application), et le contexte congolais (fiscalité DGI dont la réforme
2026, CNSS/INPP, douanes, loi 004/2001, CPCC).

## Verdict d'ensemble

Le socle est solide et sourcé : 7 des 9 points SYCEBNL sont conformes sans
réserve, les taux et échéances fiscaux implémentés sont exacts (y compris
là où la communication officielle s'est trompée), et une vingtaine de
capacités Sage sont en place, plusieurs au-delà du modèle (verrouillage de
lettrage, écart de change au dénouement, origine tracée).

Les manques ne sont pas des erreurs de doctrine : ce sont des obligations
entières non couvertes (surtout celles, trimestrielles et annuelles, créées
par la loi de finances 25/060 pour 2026), un point SYCEBNL sans aucune
brique (les seuils de désignation de l'auditeur, art. 19), et trois vrais
bugs de périmètre.

## État au 29 août 2026 · ce qui a été corrigé

Les trois bugs (P0) et les cinq obligations absentes (P1) de la liste
ci-dessous sont TRAITÉS et couverts par des tests. Voir les commits
« Corrections de l'audit » du 29 août 2026 :

| Point | Correction |
|---|---|
| Retenue locative datée au 15 | Délai en JOURS (dix), compte 4478 éclaté en cinq sous-comptes, taux du document corrigé (20 % acompte, non 22 %) |
| EUP sans jalon | Jalon propre art. 66 (budget ET comptes annuels, Journal officiel) |
| Prorata TVA sur la mauvaise période | Provisoire N-1, définitif au 31 mars, régularisation chiffrée ; numérateur exact (base = TVA / taux) |
| Trois déclarations LF 25/060 | Au registre, avec périodicité, contenu, sanction et source des données |
| Seuils d'auditeur art. 19 | Contrôle SEUIL_AUDITEUR_FRANCHI + champ effectif sur le dossier |
| Cumul biennal art. 6 (SMT) | Calculé, ou déclaré non mesurable faute d'exercice antérieur |
| Statut TVA du dossier | `assujettiTva` + seuil rappelé + écran de paramétrage |
| Loi 004/2001 hors fiscal | Jalon semestriel (art. 4 e), ONG étrangères (art. 37), et table des obligations événementielles (art. 11, art. 15…) |
| Social CNSS/INPP/ONEM | Natures séparées, comptes INPP et ONEM ouverts, sources réelles citées, taux ONEM 0,5 % sourcé sur l’AM n° 028/2025 |
| Coordonnées des tiers | Huit champs sur la fiche, dont le Numéro Impôt exigé par l'art. 47 ter |
| TVA à l'encaissement (P2-10) | Régime d'exigibilité au dossier (livraisons / encaissements / débits) ; la déclaration suit le lettrage, prorate le règlement partiel, et affiche la TVA facturée non encore encaissée |

**Reste ouvert** : le P2 sauf le point 10, et tout le P3 (import de relevé
bancaire, modèles de saisie paramétrables, registre des exonérations
douanières, et les points Sage de confort).

## Priorités consolidées

### P0 · bugs à corriger (le code contredit le texte qu'il cite)
1. Retenue locative : reversement dû dans les 10 JOURS (LPF art. 57), le
   registre calcule au 15 · le texte affiché et la date calculée se
   contredisent. Éclater 4478 en 44781 (locative, j=10) / 44782
   (non-résidents 14 %, j=15) / 44783 (expatriés 25 %, j=15). Corriger le
   doc : la retenue est de 20 % du loyer brut, le 22 % est l'IRL du
   bailleur.
2. FORMES_ASBL omet ETABLISSEMENT_UTILITE_PUBLIQUE : un EUP ne voit jamais
   le jalon du compte annuel, alors que l'art. 66 de la loi 004/2001 est le
   seul texte qui impose explicitement budget + comptes annuels + Journal
   Officiel. Jalon EUP propre à créer.
3. Prorata TVA calculé sur la période déclarée, alors que l'art. 45 impose
   provisoire = recettes N-1, définitif arrêté au 31 mars avec
   régularisation. Prorata à stocker par exercice + jalon 31 mars.
   (+ numérateur : sommer la base HT de la ligne, pas tout le crédit 7.)

### P1 · obligations entières absentes
4. Les trois déclarations LF 25/060 : relevé trimestriel des sommes versées
   à des tiers (LPF art. 47, vise nommément les ASBL, 10 jours après chaque
   trimestre, amende 500 000 FC) ; déclaration annuelle des revenus
   salariaux au 31 mars (art. 22 ter) ; liste des fournisseurs au 31 mars
   (art. 47 ter, productible depuis 401/445). Préalable : donner une
   périodicité (mensuelle/trimestrielle/annuelle) aux natures du registre.
5. Seuils de l'auditeur (SYCEBNL art. 19) : contrôle 100 M bilan / 200 M
   ressources / 20 personnes · DZ et XA déjà calculés, effectif déjà en
   Note 29B ; un dixième code de contrôle suffit. + cumul biennal art. 6
   (SMT) et éligibilité SMT visible depuis un dossier en Système normal.
6. Statut TVA du dossier : assujettiTva + seuil 80 000 000 FC (art. 14),
   saisie TVA désactivée hors assujettissement, TVA d'amont non récupérable
   routée en charge, jalon de déclaration d'assujettissement (art. 55).
7. Loi 004/2001 hors fiscal : déclaration SEMESTRIELLE des ressources
   (art. 4 e, sanction = dissolution), changement d'administrateur dans le
   mois (art. 11), mouvements d'immeubles dans les 3 mois copie Finances
   (art. 15, branchable sur le module immobilisations), jalon ONG
   étrangères (art. 37, le champ droitEtranger existe mais rien ne
   l'utilise).
8. Social : éclater « compte 43 » en CNSS/INPP/ONEM, créer les comptes
   INPP, champ effectif sur le dossier (le taux INPP en dépend :
   4/3,5/3/2 % depuis le 24/09/2025), citer l'AM 146/2018 (15 jours,
   déclaration due même sans travailleur) au lieu de « vérifiez auprès de
   la CNSS ». Ne pas coder l'ONEM 0,2 % (aucun texte).
9. Fiche tiers : coordonnées (adresse, téléphone, e-mail) · sans elles, les
   relances déjà construites ne peuvent être envoyées à personne.

### P2 · utile (Sage + confort réglementaire)
10. TVA à l'encaissement (exigible au règlement pour les services en RDC ·
    la déclaration actuelle par date d'écriture est fausse pour un dossier
    de services). Lecture de Lettrage.soldeAt.
11. Import de relevé bancaire + rapprochement automatique par tolérance.
12. Modèles de saisie paramétrables (table + éditeur, aujourd'hui codés en
    dur).
13. Registre des exonérations douanières (loi 004/2001 art. 39, code des
    douanes art. 337-339, note circulaire 003/2013 : ponctuel 13 pièces /
    prévisionnel 11 / renouvellement 2 ans) : rien à calculer, une entité
    de suivi + jalon de renouvellement J-60.
14. Petits Sage : garde « taxe seulement sur journaux Achats/Ventes »,
    contrepartie configurable par journal, pré-lettrage, code taxe par
    défaut appliqué à la grille libre, palmarès/analyse des journaux/
    journal centralisé/états tiers, comparatif multi-exercices, fiche
    immobilisation (nature, lieu), longueurCompte modifiable, conventions
    de financement sur le bailleur, saisie assistée des contributions en
    nature, attestation de don, mécénat 4571 vs 475 à arbitrer.

### P3 · règlement en masse, dégressif/composants, écartés/réserve
Règlement des tiers en masse (élevé) ; amortissement dégressif + composants
(le bâtiment d'une congrégation est un cas réel) ; écartés et assumés :
LCR/SEPA (mobile money serait le vrai sujet local), TVA/CEE, IFRS natif,
Édition Pilotée complète, paie, RBAC X3. Seul trou de décision : les types
de taxe TP/HT, TP/TTC, TP/Poids, Surtaxe · ni faits ni écartés par écrit.

---

# VOLET A · Écarts Sage 100 i7


## A · P1 — manques réellement gênants au quotidien

A1. Fiche tiers sans coordonnées (adresse, téléphone, e-mail) — les relances construites ne peuvent être envoyées à personne. Tiers = type/code/nom/estActif/modeleReglementId seulement (schema.prisma:860-878) alors que RelancesService.emettre (:275) compose des lettres complètes. Effort faible (migration + TiersPage).

A2. Rapprochement bancaire automatique + import du relevé — ABSENT. Rapprochement strictement manuel (rapprochement.service.ts:166/189) ; TypeImport sans RELEVE_BANCAIRE. Effort moyen (infra d'import existante).

A3. Règlement des tiers en masse — ABSENT (aucune entité Reglement, aucun lot, pas de contrôle « effectif après impression »). Effort élevé.

A4. TVA à l'encaissement — ABSENT. TauxTva sans champ de régime ; déclaration par date d'écriture (taux-tva.service.ts:145). En RDC la TVA sur services est exigible à l'encaissement → déclaration fausse pour un dossier de services. Effort moyen (régime + lecture Lettrage.soldeAt).

A5. Modèles de saisie non paramétrables — codés en dur (ModelesSaisie.tsx:45-56) + 19 écritures-types API. Pas de table ModeleSaisie ni d'éditeur. Effort moyen.

## B · P2 — utile, coût faible/moyen

B1. Pré-lettrage (proposé/confirmé) absent — ne pas confondre avec StatutLettrage.PARTIEL. Effort faible.
B2. Contrepartie configurable par journal (centralisée vs par ligne) absente du model Journal. Effort faible.
B3. Garde « taxe seulement sur journaux Achats/Ventes » absente d'EcritureService.creer. Trivial.
B4. Amortissement dégressif + composants absents (enum ModeAmortissement { LINEAIRE }). Bâtiment d'une congrégation = cas réel. Moyen/élevé.
B5. Fiche immobilisation appauvrie : nature d'acquisition, nature de bien, lieu, base de prorata. Faible.
B6. Catalogue d'états : palmarès des comptes, analyse des journaux, journal centralisé, balance/grand-livre tiers dédiés — ABSENTS, tous dérivables de balance()/grandLivreComplet(). Faible.
B7. Comparatif multi-exercices libre (3-5 ans) : seul N-1 légal existe. Faible/moyen.
B8. longueurCompte non modifiable après création (ParametresDossierPage:273 lecture seule) malgré validation dynamique en place. Faible (gare aux numéros en dur).
B9. Code taxe par défaut du compte non appliqué à la grille de saisie libre (seulement ModelesSaisie.tsx:120). Trivial.
B10. Conventions de financement (montant accordé, tranches, rapports dus) absentes du model Bailleur. 
B11. Contributions volontaires en nature : comptes 90/91 seedés mais aucune saisie assistée bénévolat/prêt à usage.
B12. Attestation de don au donateur : aucune émission (DonationController).

## C · Écartés/réserve (ne pas rouvrir sans décision)
LCR/SEPA/EBICS (pas en RDC · mobile money serait le vrai sujet), TVA/CEE, dérogatoire (réserve phase lucrative), IFRS natif (réserve), compte reporting (réserve), Édition Pilotée complète (réserve), Paie (autre logiciel), RBAC X3 (réserve), 11 plans analytiques (2 livrés, assumé). SEUL trou de décision : types de taxe TP/HT, TP/TTC, TP/Poids, Surtaxe — ni faits ni écartés par écrit.

## D · Conformes vérifiés
Détail/Total + agrégation racine ; longueur de compte bornée ; 3 modes RAN générés à la clôture ; 5 types de journaux ; 4 numérotations de pièces (transaction sérialisable) ; compte trésorerie obligatoire sur journal Trésorerie ; clôture 3 granularités + annulation ; lettrage manuel/auto/partiel/dé-lettrage/verrouillage + origine tracée + écart de change (au-delà de Sage) ; rapprochement manuel avec clôture bloquée sur écart ; taxes (entité, prorata, liquidation) ; régularisations + extourne ; abonnements ; relances 3 niveaux ; échéancier + balance âgée ; tiers/comptes rattachés/Principal ; modèles de règlement fractionnés ; familles d'immobilisations + sortie avec dotation complémentaire ; analytique multi-axes + budgets ; contrôle de caisse ; imports plan/balance/écritures.

## E · Rapport d'écart antérieur : comblé depuis
§2.1 échéancier ✓, §2.2 code taxe par défaut ✓ (sauf B9), §2.3 registre retenues ✓, §2.4 échéancier fiscal ✓, §4.1-4.2 les trois états projets ✓, §2.7 partiellement (partiel/verrou/origine ✓, pré-lettrage ✗).
Restent ouverts : §2.5→A2, §2.6→A3, §2.7→B1, §2.8→B4, §2.9→B7, §2.10→B6, §4.3→B10, §4.4→B11, §4.5→B12.

---

# VOLET B · Conformité SYCEBNL


7/9 points CONFORMES sans réserve substantielle, 1 partiel, 1 non couvert. Le code cite sa source article par article, reproduit les anomalies du texte officiel sous [texte officiel], refuse de calculer ce que le texte ne permet pas.

CONFORMES (preuves aux fichiers) :
1. Art. 14 — les 5 documents obligatoires existent et s'exportent (livre-journal, grand-livre, balance, livre d'inventaire avec résumé bloquant, registre des donateurs). Réserve : exports XLSX only (choix assumé).
2. Art. 4 / Partie 4 — les 3 jeux complets : associations 59/59 codes bilan, CR avec l'anomalie officielle « RA à RG » corrigée avec motif, TFT ZA→ZG, 35/35 notes ; projets TER FA→GZ (App. 21), exécution budgétaire (App. 22), réconciliation A→I (E et H déclarés non calculables plutôt qu'inventés), doublon officiel TJ/TK reproduit et désambiguïsé, 24/24 notes ; SMT bilan GA→HZ, CR KA→KZC, 5/5 notes.
4. Art. 17-18 registre donateurs — numérotation serveur sous contrainte unique, annulation sans libérer le numéro, constaterNumerotation (trous+doublons), validation PP/PM différenciée, rapport qui « ne conclut pas à la place de l'auditeur ».
6. Plan de comptes — 76/76 comptes à 2 chiffres (testés), classe 9 complète (7 comptes, hors bilan/résultat sur les 3 jeux, contrôle CLASSE_9_MOUVEMENTEE, note annexe dédiée, opération B13), comptes EBNL tous présents.
7. Partie 3 — 22/22 applications du guide couvertes (19 opérations + App. 21-22 vivant dans etats-financiers).
8. TFT méthode directe, double bouclage non corrigé, 5 divergences documentées (dont : aucun tableau de correspondance TFT officiel n'existe).
9. Postulats — verrous 3 granularités, art. 16-4 cité dans le verrou d'intangibilité, correction par inscription en négatif exclusivement (contre-passation refusée avec raisonnement), N-1, jeu d'états figé dès la première écriture.

LES 5 MANQUES CLASSÉS :
1. ART. 19 SEUILS AUDITEUR — NON COUVERT. Bilan >100M / ressources >200M / effectif >20 : ni constante ni contrôle ni jalon. DZ et XA déjà calculés, effectif déjà saisi (Note 29B) → un code de contrôle suffit. Seul point du référentiel sans AUCUNE brique.
2. Art. 6 cumul sur DEUX exercices — cité (etats-financiers-smt.service.ts:755) mais eligibilite() ne lit qu'un exercice.
3. Diagnostic d'éligibilité SMT inaccessible aux dossiers en Système normal (onglet de EtatsSmtPage uniquement).
4. Délai de 45 jours avant l'AG (art. 19 al. 4) non dérivé — pas de date d'AG modélisée, jalon 12 sur source CPCC.
5. Mécénat imputé au 475 alors que 4571 « Mécènes et assimilés » existe, est semé, et n'est utilisé par aucune opération — le « 4751 » du texte est vraisemblablement une transposition de 4571. À arbitrer.

---

# VOLET C · Contexte congolais


## Constat d'ensemble
Socle sain : réforme 2026 intégrée (IPR/IBP abrogés, IRPP), acomptes à jour LF 25/060, taux TVA du seed exacts (y compris ex-8% → 1%, 5% réservé billets d'avion — la comm DGI de février 2026 disait l'inverse et est erronée), planning purgé des erreurs DGI/RCCM. Les manques ne sont pas des taux : ce sont des OBLIGATIONS ENTIÈRES, surtout trimestrielles et annuelles créées/modifiées par la LF 25/060, que le modèle mensuel pur (NatureRetenue.jourEcheance) ne sait pas exprimer.

## TOP 5 corrections prioritaires

1. TROIS OBLIGATIONS LF 25/060 ABSENTES :
   - Relevé trimestriel des sommes versées à des tiers hors salaires (LPF art. 47, vise NOMMÉMENT les ASBL/EUP), dans les 10 jours suivant chaque trimestre (10/04, 10/07, 10/10, 10/01) — amende 500 000 FC (art. 94). Réduit à une phrase dans un jalon annuel (planning-cloture.ts:227).
   - Déclaration annuelle des revenus salariaux au 31 mars (LPF art. 22 ter), fiches individuelles par province et ordre alphabétique.
   - Liste des fournisseurs au 31 mars (LPF art. 47 ter) : identité, adresse, BP, NIF, HT, TVA, TTC — productible depuis 401/445.
   → ajouter periodicite MENSUELLE|TRIMESTRIELLE|ANNUELLE aux natures et en faire des lignes d'échéancier.
   + PV d'AG approuvant les états financiers certifiés dans les 10 jours (LPF art. 13 bis nouveau) — absent, nuance le « aucun dépôt DGI » du doc.

2. RETENUE LOCATIVE : reversement dans les 10 JOURS (LPF art. 57) mais le code calcule au 15 (retenues.service.ts:103) — texte affiché et date calculée se contredisent. Et docs/fiscalite-asbl-rdc.md:207 annonce 22% comme taux de retenue : c'est 20% du loyer brut (acompte) ; 22% = IRL du bailleur. Éclater 4478 en 44781 locative j=10 / 44782 non-résidents 14% j=15 / 44783 expatriés 25% j=15. Ajouter natures absentes : capitaux mobiliers 20% (art. 120, LPF 18 bis, AM 008/2025), plus-values 20% (LPF 18 ter). Ajouter art. 96 bis LPF (redevable personnellement tenu de la retenue non faite) à l'avertissement.

3. STATUT TVA DU DOSSIER ABSENT : seuil d'assujettissement 80 000 000 FC (O.-L. 10/001 art. 14 ; décret 011/42 art. 42-43), exonérations ASBL art. 15,2° et 17,8°. Aujourd'hui les 4 taux sont seedés pour TOUT dossier ; une ASBL non assujettie se voit proposer « Vente avec TVA » = infraction ; TVA d'amont non récupérable jamais routée en charge. → assujettiTva + dateOptionTva sur tenant, saisie TVA désactivée hors assujettissement, TVA amont en 6xx, jalon déclaration d'assujettissement (art. 55).

4. DEUX BUGS DE PÉRIMÈTRE :
   - Prorata TVA calculé sur la période déclarée (taux-tva.service.ts:182) alors que l'art. 45 impose provisoire = recettes N-1, définitif arrêté au 31 mars avec régularisation. → prorata stocké par exercice + jalon 31 mars. (+ numérateur : sommer la base HT de la ligne, pas tout le crédit classe 7.)
   - FORMES_ASBL (planning-cloture.ts:50-54) omet ETABLISSEMENT_UTILITE_PUBLIQUE : un EUP ne voit jamais le jalon du compte annuel alors que l'art. 66 loi 004/2001 est le SEUL texte qui impose explicitement budget + comptes annuels + publication au JO. → jalon EUP propre.

5. SOCIAL + 004/2001 NON FISCALE :
   - Éclater « compte 43 » en CNSS/INPP/ONEM ; AUCUN compte INPP/ONEM dans compte-seed ; champ effectif absent du tenant alors que le taux INPP en dépend (4%/3,5%/3%/2% depuis le 24/09/2025, AI 002/CAB/MET/2025). CNSS : taux exacts déjà (6,5+10(5/5)+1,5, décret 18/041) mais remplacer « vérifiez auprès de la CNSS » par la vraie source : AM 146/2018 art. 21/31 (15 jours suivant le mois civil), art. 26 (déclaration due même sans travailleur), art. 24 (télédéclaration >25 travailleurs), guichet unique AI 12/05/2015. NE PAS coder ONEM 0,2% (aucun texte au référentiel). Assiette CNSS = art. 7 h Code du travail (exclut logement, transport, alloc familiales légales, soins), plancher SMIG — absente.
   - Loi 004/2001 : déclaration SEMESTRIELLE des ressources (art. 4 e — sanction art. 19 = dissolution) absente ; changement d'administrateur dans le mois (art. 11) absent ; acquisition/aliénation d'immeuble dans les 3 mois, copie Finances (art. 15) absent — branchable sur module immobilisations. ONG étrangère : droitEtrangerSeulement existe mais AUCUN jalon ne l'utilise (art. 37 : accord-cadre Plan, main-d'œuvre locale ≥60%).

## Hors top 5
- Registre des exonérations/franchises douanières : loi 004/2001 art. 39 (arrêté interministériel Plan+Finances), code des douanes art. 337-339 (franchise dons organismes charitables agréés, distribution gratuite = engagement de destination), note circulaire 003/2013 (ponctuel 13 pièces / prévisionnel 11 / renouvellement 2 ans 4 pièces). Ne rien calculer : entité « Exonérations obtenues » + registre importations sous franchise + jalons renouvellement J-60. Compte 44260000 existe mais tombe en comptesNonRattaches.
- TVA : citer art. 60 O.-L. 10/001 mod. LF 25/060 (au lieu du décret 011/42) pour l'échéance du 15 ; déclaration due même « Néant » ✓ déjà.
- Numéro Impôt : champ existe, pas de jalon (LPF art. 1er, 15 jours).
- Acomptes 30/30/20 aux 25/07, 25/09, 25/11 : documentés, pas de jalon (sans objet si exemption IS effective).

## Conformes vérifiés
IRPP salarial 15 ✓ ; contributions nationale/solidarité ✓ ; prestataires non-résidents 14% (texte) ✓ ; expatriés 25% avec la bonne réserve art. 145 ✓ ; TVA 15 + « Néant » ✓ ; taux TVA seed ✓ ; exonération ASBL traitée comme « pas de taux » ✓ ; prorata Math.ceil + exclusions art. 43 ✓ (sur le fond) ; CPCC 30 juin étape 16 ✓ ; Économie nationale avec réserve ✓ ; non-dépôt RCCM ✓ ; jalon CENCO janvier honnêtement sourcé ✓ ; rapport ONG au Plan art. 44-45 ✓ ; prudence ONEM ✓.
