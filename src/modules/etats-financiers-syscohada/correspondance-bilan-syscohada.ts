/**
 * Tableau de correspondance officiel « poste → comptes » du BILAN SYSCOHADA
 * révisé · Système normal (AUDCIF art. 11), actif ET passif.
 *
 * Sources, toutes LUES au moment de la transcription (règle §1 de CLAUDE.md,
 * jamais de mémoire, jamais complété depuis le SYCEBNL) :
 *  - AUDCIF Titre IX ch. 7 « Tableau de correspondance Postes/Comptes du
 *    Système normal », sections BILAN · ACTIF et BILAN · PASSIF, plus ses
 *    « Clés de lecture » (skill `audcif-acte-uniforme`,
 *    references/titre-9-ch6-7-notes-annexes-correspondance.md, lignes 764
 *    à 852) · c'est la source primaire, qui tranche tout désaccord ;
 *  - AUDCIF Titre IX ch. 3 section 2 « Modèles de Bilan du Système normal »
 *    (references/titre-9-ch1-5-bilan-resultat-flux.md, lignes 318 à 402) ·
 *    codes REF, libellés exacts, renvois de notes, ordre d'affichage ;
 *  - AUDCIF Titre VII, fiches COMPTE 104, 109, 11, 12, 13, 18, 19, 21, 23,
 *    28, 29, 47, 48, 55, 56, 57, 58 · pour arbitrer chaque anomalie
 *    ci-dessous (la fiche COMPTE 54 a été lue aussi, mais elle ne dit rien
 *    du sens de son solde : la règle « aucun poste ne reçoit le 54
 *    créditeur » vient des clés de lecture du ch. 7 seulement) ;
 *  - AUDCIF Titre VIII ch. 19 § 2.4 « Résultat net de l'exercice »
 *    (references/titre-8-ch16-21-capitaux-provisions-emprunts-retraite.md,
 *    ligne 92) · fonctionnement des soldes intermédiaires 132 à 137, et
 *    ligne 902 pour le 1301 débité à l'issue de l'assemblée ;
 *  - le plan de comptes SYSCOHADA semé (`compte-seed-syscohada.ts`, généré
 *    depuis skill `syscohada`, comptes/references/plan-comptes.tsv) · chaque
 *    préfixe cité ici existe dans ce semis, vérifié par le spec voisin ;
 *  - en AIDE seulement, la correspondance recoupée par le moteur Python du
 *    skill `syscohada` (liasse/references/correspondance.tsv, lignes
 *    BILAN-ACTIF et BILAN-PASSIF) · chacune de ses corrections a été
 *    revérifiée au ch. 7 et au plan, voir la section ANOMALIES.
 *
 * Même FORME d'objet que `etats-financiers/correspondance-bilan.ts` (SYCEBNL)
 * pour que le service SYSCOHADA reprenne la même logique de résolution
 * (brut / amortissements / net, qualificatifs de sens, transfert des
 * découverts, totaux en une passe). Aucun compte, aucun poste, aucun
 * libellé n'en est repris : les deux référentiels ne partagent que la
 * mécanique (CLAUDE.md §6).
 *
 * ## Convention de lecture des numéros de comptes
 *
 * Ch. 7, clés de lecture : « un numéro à deux chiffres englobe tous ses
 * divisionnaires » (22 en AJ couvre 221 à 229). Un jeton de 3 chiffres ou
 * plus ne vaut que pour lui-même et ses subdivisions. `exclusions`
 * transcrit les clauses « sauf » du ch. 7 (409 sort du 40, 419 du 41, 478
 * et 479 du 47, 2181 du 218, 245 et 2495 du 24, 4998 du 499). La
 * comparaison se fait par `numero.startsWith(prefixe)` sur les numéros du
 * semis (feuilles complétées à 8 chiffres, CLAUDE.md §7), donc « 2181 »
 * atteint bien 21810000.
 *
 * ## Convention de signe
 *
 * Poste d'actif : montant = solde débiteur net (brut), les comptes 28/29/39/
 * 49/59 sont exposés à part en « amortissements et dépréciations » (colonne
 * officielle du modèle, ch. 3 section 2 : Brut, Amort. et déprec., Net).
 * Poste de passif : montant = solde créditeur net. Un compte de passif
 * naturellement DÉBITEUR ressort donc en négatif sans traitement spécial ·
 * c'est exactement ce que le modèle exige pour CB « Apporteurs capital non
 * appelé (-) » (109 est débité à la souscription, Titre VII COMPTE 109 :
 * « figure en seconde ligne au passif du bilan, en moins parmi les capitaux
 * propres »), pour CH « Report à nouveau (+ ou -) » (121 créditeur, 129
 * débiteur, Titre VII COMPTE 12 : « en moins si son solde est débiteur, en
 * plus s'il est créditeur ») et pour CJ (131 bénéfice, 139 perte).
 *
 * Comptes bilatéraux (ch. 7, clés de lecture) : 42, 43, 44 vont en BJ si
 * débiteurs, DK si créditeurs ; 185, 45, 46, 47 en BJ si débiteurs, DM si
 * créditeurs ; 52, 53 en BS si débiteurs, DR si créditeurs. « L'affectation
 * ne se lit jamais sur le seul numéro de compte : il faut le sens du solde
 * à la clôture. » Le sens s'apprécie compte d'imputation par compte
 * d'imputation (ligne de balance), jamais sur l'agrégat, sinon un 4711
 * débiteur et un 4712 créditeur se compenseraient, ce que le Titre VII
 * COMPTE 47 interdit (« aucune compensation n'est en principe admise »).
 *
 * ## Le résultat (CJ) n'est PAS dans POSTES_PASSIF
 *
 * Ch. 7 : CJ = « 13 (131 ou 139) ». Titre VII COMPTE 13 : le compte 13
 * n'est crédité/débité qu'À LA CLÔTURE, « par le débit des comptes de la
 * classe 7 et des comptes créditeurs de la classe 8 » et « par le crédit des
 * comptes de la classe 6 et des comptes débiteurs de la classe 8, pour
 * solde ». Avant clôture le résultat vit donc dans les classes 6/7/8, après
 * clôture dans le 13 qui les a soldées. Le service doit prendre l'une OU
 * l'autre source, jamais les deux (même mécanique que `calculerCH` du
 * SYCEBNL, avec `controle.resultatClasses678` / `resultatCompte13` /
 * `doubleComptageProbable`) · voir `COMPTES_RESULTAT_SYSCOHADA` et
 * `REF_RESULTAT_SYSCOHADA`. Le 130 (résultat de l'exercice PRÉCÉDENT en
 * instance d'affectation) n'en fait PAS partie : anomalie n° 7.
 *
 * ## ANOMALIES du texte officiel, rencontrées et tranchées ici
 *
 * Aucune n'est corrigée en silence (CLAUDE.md §9). Numérotées pour être
 * citées depuis le spec et le service.
 *
 * 1. **Suffixe « p » (pour partie)** · le ch. 7 liste CINQ comptes
 *    d'amortissement/dépréciation sous PLUSIEURS postes à la fois, sans
 *    donner de clé de répartition : 2818p (AE et AH), 2918p (AE et AH),
 *    2919p (AE, AF et AH), 2939p (AK et AL), 2949p (AM et AN). Ses clés de
 *    lecture le confirment : « reprise partielle… chacun n'en prenant que
 *    sa part », part qu'aucune balance ne permet de connaître (un seul
 *    compte 2818 amortit à la fois 2181 → AE et 2182 à 2188 → AH). Même
 *    traitement que le SYCEBNL pour SES trois comptes « p »
 *    (`correspondance-bilan.ts`, « septième ambiguïté ») : chaque compte
 *    « p » est pris EN ENTIER sous UN SEUL poste, celui dont l'intitulé
 *    couvre le mieux le compte (Titre VII COMPTE 28 et 29) :
 *    2818 « autres droits et valeurs incorporels » → AH « Autres
 *    immobilisations incorporelles » ; 2918 idem → AH ; 2919
 *    « immobilisations incorporelles en cours » → AH (le 219 nourrit 2191
 *    → AE, 2193 → AF, 2198 → AH ; « Autres » est le poste résiduel) ;
 *    2939 « bâtiments et installations en cours » → AL « Aménagements,
 *    agencements et installations » (239 se ventile 2391 → AK contre 2392
 *    à 2398 → AL, la majorité) ; 2949 « matériel en cours » → AM
 *    « Matériel, mobilier et actifs biologiques » (249 se ventile 2495 → AN
 *    contre 2491 à 2498 → AM). Ni dupliqué (gonflerait la colonne
 *    Amortissements et fausserait le net de deux postes), ni partagé par
 *    moitié (inventerait une clé). Un dossier qui veut la ventilation exacte
 *    ouvre des sous-comptes de 2818/2918/2919/2939/2949 par nature.
 *
 * 2. **2394, 2395, 2398 absents du ch. 7** · le ch. 7 donne AK = « 231,
 *    232, 233, 237, 2391 » et AL = « 234, 235, 238, 2392, 2393 » : les
 *    trois autres subdivisions de 239 que le Titre VII COMPTE 23 énumère
 *    pourtant (2394 Aménagements, agencements et installations techniques
 *    en cours · 2395 Aménagements de bureaux en cours · 2398 Autres
 *    installations et agencements en cours) n'ont AUCUN poste d'accueil,
 *    et le plan de comptes officiel (plan-comptes.tsv, semé) les contient.
 *    Le TSV du skill les laisse hors table et les remonte en anomalie ; ce
 *    fichier les RATTACHE à AL, parce que (a) Titre VII COMPTE 23 :
 *    « après achèvement, ils sont portés au débit des comptes 231 à 238 par
 *    le crédit du 239 », or 2394 → 234, 2395 → 235, 2398 → 238 sont tous
 *    trois en AL, l'affectation est donc sans ambiguïté ; (b) un chantier
 *    d'aménagement en cours à la clôture est un cas courant, et un actif
 *    absent du bilan le déséquilibre du montant total du chantier, ce que
 *    l'écran signalerait comme « compte non rattaché » sans pouvoir
 *    l'imprimer. L'écart avec la lettre du ch. 7 est ici, et testé.
 *
 * 3. **BS « Soldes débiteurs : 52, 53, 54, 55, 57, 581, 582 »** · le ch. 7
 *    qualifie tout le poste, mais ses clés de lecture ne donnent un poste
 *    d'accueil créditeur QU'À 52 et 53 (→ DR) : « aucun poste ne reçoit le
 *    54 créditeur », 55 doit être « débiteur ou nul » (Titre VII COMPTE
 *    55), un 57 créditeur « constitue une présomption d'irrégularité de la
 *    comptabilité » (COMPTE 57). Appliquer le filtre « débiteur » à la
 *    lettre ferait DISPARAÎTRE du bilan une caisse créditrice, sans
 *    déséquilibre visible autre qu'un total faux. Choix : le qualificatif
 *    est traduit par le TRANSFERT de 52/53 créditeurs vers DR
 *    (`comptesTransferesSiCrediteur`, même mécanisme que BW → DW côté
 *    SYCEBNL, bug de double comptage des découverts corrigé là-bas le
 *    2026-08-28) ; 54, 55, 57, 581, 582 créditeurs RESTENT en BS, en
 *    négatif, donc visibles et à corriger avant arrêté.
 *    Même décision, en miroir, pour DR « Soldes créditeurs : 52, 53, 561,
 *    566 » : le ch. 7 qualifie toute la ligne, mais 561 et 566 n'ont aucun
 *    poste d'accueil DÉBITEUR (Titre VII COMPTE 56 : 561 est crédité des
 *    crédits obtenus et débité des remboursements, un solde débiteur est
 *    donc anormal). DR ne porte donc pas de `sens_qualificatif` : un 561 ou
 *    566 débiteur ressort en NÉGATIF dans DR, visible, au lieu de
 *    disparaître du bilan ; seuls 52/53 sont filtrés par le sens, parce
 *    qu'eux ont un poste de chaque côté.
 *
 * 4. **585 et 588 sans poste** · ch. 7 : « 585 et 588 ne figurent nulle
 *    part. BS ne prend que 581, 582 » ; Titre VII COMPTE 58 : « ces comptes
 *    doivent être soldés au terme de leur utilisation », « s'assurer que
 *    les comptes 585 et 588… sont soldés à la fin de l'exercice ». Un solde
 *    résiduel est une erreur d'inventaire, pas un poste manquant : laissés
 *    ORPHELINS volontairement, listés dans
 *    `COMPTES_BILAN_SANS_POSTE_JUSTIFIES` pour que le spec d'orphelinat les
 *    accepte et que le service les remonte en `comptesNonRattaches`.
 *
 * 5. **186, 187, 188 sans poste** · le ch. 7 ventile le 18 en DA (181,
 *    182, 183, 184) et BJ/DM (185) et ne cite pas 186 (Comptes de liaison
 *    charges), 187 (Comptes de liaison produits) ni 188 (Comptes de liaison
 *    des sociétés en participation). Titre VII COMPTE 18 : les comptes de
 *    liaison siège/établissements « sont égaux et de sens contraire dans
 *    les deux comptabilités » · dans la comptabilité fusionnée qui produit
 *    le bilan de l'entité, 186 et 187 se neutralisent donc, et un résidu
 *    est un défaut d'intégration. Pour 188, le ch. 7 ne le cite nulle
 *    part ; le Titre VII COMPTE 18 donne un INDICE sans donner de poste :
 *    « l'utilisation des comptes 181, 182, 183 et 188 est exclusivement
 *    limitée aux opérations financières entre entités liées », et son
 *    Contenu place les dettes liées à des participations « parmi les
 *    dettes financières diverses » (DA). Mais 188 est un compte de liaison
 *    (compte courant avec la société en participation, débiteur ou
 *    créditeur selon le sens des opérations), pas une dette contractée ;
 *    DA « 16, 181, 182, 183, 184 » n'est donc pas étendu de notre propre
 *    chef, la lettre du ch. 7 prime. Les trois restent orphelins, justifiés
 *    dans `COMPTES_BILAN_SANS_POSTE_JUSTIFIES`, donc visibles en
 *    `comptesNonRattaches` dès qu'ils portent un solde. À revoir si le
 *    ch. 6 (notes 16 ou 19) devait un jour les ventiler.
 *
 * 6. **Corrections du TSV du skill, revérifiées** · la transcription du
 *    ch. 7 lue ici porte déjà les valeurs corrigées, et le plan semé les
 *    confirme : AF « 2929p → 2919p » (2929 = dépréciations des
 *    aménagements de terrains en cours, classe des terrains, Titre VII
 *    COMPTE 29 ; 2919 = dépréciations des immobilisations incorporelles en
 *    cours · 2919 retenu) ; AG « amortissements 2815, 2816 rétablis »
 *    (Titre VII COMPTE 28 les liste ; retenus) ; AH « 2198 inclus » (Titre
 *    VII COMPTE 21 : 2198 est une subdivision de 219, pas de 218 ; retenu) ;
 *    AN « 2948 → 2945 » (2948 = dépréciations des autres matériels, il
 *    reste en AM par « 294 (sauf 2945, 2949) » ; 2945 = matériel de
 *    transport ; retenu) ; CA « 100 n'existe pas » (le plan va de 101 à
 *    104 ; « 101 à 104 » retenu tel quel).
 *    Deux DIVERGENCES du TSV avec le texte, où le texte l'emporte :
 *    (a) le TSV code le résultat « CI » alors que le modèle du ch. 3
 *    (« il n'existe ni CC, ni CI, ni CK, ni CN ») et le ch. 7 écrivent CJ ·
 *    CJ retenu ; (b) ses formules de totaux AI et AZ diffèrent du modèle,
 *    voir l'anomalie n° 13.
 *
 * 7. **CJ « 13 (131 ou 139) »** alors que le plan semé porte aussi 130
 *    (résultat en instance d'affectation, 1301/1309), 132 à 137 (soldes
 *    intermédiaires de gestion) et 138 (résultat HAO, fusion, scission…).
 *    Deux cas bien distincts, tranchés par les textes lus :
 *    (a) **132 à 138** · Titre VIII ch. 19 § 2.4 : « le résultat net de
 *    l'exercice, compte 13, peut être obtenu par virement successif des
 *    charges et des produits afférents aux soldes intermédiaires… chacun
 *    des soldes visés est obtenu par virement du solde intermédiaire
 *    précédent (solde du compte 132 Marge commerciale viré au compte 133
 *    Valeur ajoutée, par exemple) » et « le montant figurant en solde final
 *    du compte 13 constitue un bénéfice (131) ou une perte (139) ». Ces
 *    comptes sont donc des étapes de transit du résultat de l'exercice N ;
 *    la somme 131 + 132 + … + 139 vaut le résultat net que la chaîne de
 *    virements ait été menée à son terme ou non. Le ch. 7 n'écrit que
 *    « 131 ou 139 » : leur ajout à CJ est un CHOIX PROPRE de ce fichier,
 *    fondé sur le Titre VIII, pas sur le ch. 7, et le spec le fige.
 *    (b) **130** · Titre VII COMPTE 13 : « à la réouverture des comptes de
 *    l'exercice suivant, les entités ont la possibilité d'utiliser un
 *    compte spécial Résultat en instance d'affectation (130) » ; COMPTE 11
 *    et Titre VIII ch. 19 (ligne 902) le débitent à l'issue de l'assemblée.
 *    Le 130 porte donc le résultat de l'exercice PRÉCÉDENT, entre la
 *    réouverture et l'affectation. Le mettre dans CJ « Résultat net de
 *    l'exercice » présenterait le résultat N-1 comme résultat N sur toute
 *    balance arrêtée avant l'assemblée (bilan intermédiaire), et ferait de
 *    surcroît déclencher à tort `doubleComptageProbable` (classes 6/7/8
 *    ouvertes ET un 13 non nul). Il n'a AUCUN poste au ch. 7 (ni CJ, ni CH
 *    tant que l'assemblée n'a pas statué) : laissé ORPHELIN, dans
 *    `COMPTES_BILAN_SANS_POSTE_JUSTIFIES`, donc remonté en
 *    `comptesNonRattaches` dès qu'il porte un solde. Au 31-12 il doit être
 *    soldé (COMPTE 13 : « en fin d'exercice, le résultat de l'exercice
 *    précédent non affecté… est viré au compte de report à nouveau »), un
 *    résidu à la clôture est donc une erreur d'inventaire, listée dans
 *    `COMPTES_BILAN_A_SOLDER_A_LA_CLOTURE`.
 *
 * 8. **AJ et AK « dont Placement en Net »** · renvoi (1) du modèle du ch. 3,
 *    chiffre d'information sous le poste (immeubles de placement, note 3A).
 *    Le ch. 7 ne donne aucune correspondance pour ce renvoi ; le TSV du
 *    skill le reconstruit (AJ : « 2281 - 2928p », marqué « [inféré] » ; AK :
 *    « 2315 + 2325 - 2831p - 2832p », sans marqueur mais avec des PARTS
 *    d'amortissement qu'aucune balance ne donne) : ce fichier ne l'invente
 *    pas, il conserve seulement le libellé du renvoi (`renvoi`) pour
 *    l'affichage.
 *
 * 9. **167 « Autres fonds propres »** (note 15B) · ch. 7, clés de lecture :
 *    « le tableau ne leur attribue aucun code ; le 16 de DA les absorbe ».
 *    Repris tel quel, 16 en entier dans DA.
 *
 * 10. **104 « Compte de l'exploitant »** dans CA « 101 à 104 » · Titre VII
 *    COMPTE 104 : « le compte 104 est un démembrement du compte 103 (Capital
 *    personnel) ; à ce titre, il est systématiquement soldé à la clôture de
 *    l'exercice » (crédité de son solde débiteur par le débit du 103, ou
 *    débité de son solde créditeur par le crédit du 103). Un 104 non nul sur
 *    un bilan de clôture est donc, comme 585/588, une ERREUR DE CLÔTURE et
 *    non un cas de présentation. Il reste dans CA parce que le ch. 7 l'y
 *    met et qu'une balance intermédiaire (avant l'écriture de clôture) le
 *    porte légitimement, en plus ou en moins de CA selon son sens (la
 *    convention de signe suffit, aucun qualificatif) ; il est listé dans
 *    `COMPTES_BILAN_A_SOLDER_A_LA_CLOTURE` pour que le service le signale
 *    sur un arrêté définitif.
 *
 * 11. **4726 « Versements restant à effectuer sur titres de placement non
 *    libérés »** · la consigne demandait s'il fallait l'exclure. Non :
 *    Titre VII COMPTE 47 dit que les montants non encore appelés sur titres
 *    non libérés « figurent au compte 472 » (le titre est porté en entier à
 *    l'actif, 26/274/50, par le crédit du 47), et qu'« aucune compensation
 *    n'est admise », les soldes créditeurs allant en « Autres dettes au
 *    passif ». 4726 est donc une dette créditrice ordinaire : capté par le
 *    « 47 » de DM (créditeur) sans traitement particulier, et par BJ s'il
 *    était débiteur (sens anormal, visible au drill-down).
 *
 * 12. **478 et 479 réclamés des deux côtés** · à la lettre du ch. 7, BJ =
 *    « soldes débiteurs : … 47 (sauf 478) » capte un 479 DÉBITEUR pendant
 *    que DV « 479 » (sans qualificatif) le capte aussi ; et DM = « soldes
 *    créditeurs : … 47 (sauf 479) » capte un 478 CRÉDITEUR que BU « 478 »
 *    capte aussi. Un écart de conversion de sens anormal (reprise mal
 *    passée) serait ainsi compté DEUX fois et déséquilibrerait le bilan en
 *    silence. Les clés de lecture du même ch. 7 disent pourtant que « 478
 *    sort du 47 côté actif (→ BU) ; 479 sort du 47 côté passif (→ DV) » :
 *    un compte, un poste. Retenu : 478 ET 479 sont exclus de BJ comme de
 *    DM, chacun n'a qu'un poste (BU, DV) où il ressort en négatif si son
 *    sens est anormal. C'est un écart avec la lettre (les clauses « sauf »
 *    sont élargies), signalé et testé (contrôle croisé actif/passif du
 *    spec). Le SYCEBNL a la construction littérale ; non touché ici.
 *
 * 13. **Formules des totaux AI et AZ, TSV contre modèle** · le TSV du
 *    skill écrit AI = « somme AJ à AP » (AP INCLUS dans AI) et AZ = « AD +
 *    AI + AQ ». Le modèle du ch. 3 place AP « AVANCES ET ACOMPTES VERSÉS
 *    SUR IMMOBILISATIONS » en capitales et en gras, avec sa propre note 3,
 *    entre AI et AQ, au même rang qu'elles ; le ch. 7 lui donne ses propres
 *    comptes (251, 252). AP est donc une rubrique sœur de AI, pas une de
 *    ses lignes : AI = AJ à AN et AZ = AD + AI + AP + AQ. AZ est identique
 *    dans les deux lectures, le sous-total AI diffère du montant de AP ;
 *    la lecture du modèle est retenue et le spec la fige.
 *
 * 14. **1962 « Actif du régime de retraite » dans DC « 19 »** · Titre VII
 *    COMPTE 19 : quand l'entité a l'obligation de combler les pertes du
 *    régime, « la prime versée est enregistrée au débit du 1962 » et la
 *    provision au crédit du 1961. 1962 est donc le seul compte
 *    structurellement DÉBITEUR d'un poste de provisions ; capté par le
 *    « 19 » de DC conformément à la lettre du ch. 7, il ressort en MOINS
 *    et DC présente la provision NETTE de l'actif du régime. Signalé pour
 *    que la note 16 (qui détaille les provisions) ne s'en étonne pas.
 */

export type SensBilan = 'ACTIF' | 'PASSIF';
/** Restreint un poste de tiers polyvalent à un seul sens de solde (ch. 7, clés de lecture). */
export type QualificatifSens = 'DEBITEUR' | 'CREDITEUR';

export interface PosteBilanDeBase {
  ref: string;
  /** Libellé exact du modèle, ch. 3 section 2. */
  libelle: string;
  sens: SensBilan;
  /** Numéro de note annexe renvoyé par le modèle du ch. 3 (« 3e » pour CE). */
  note?: string;
  /** Renvoi d'information sous le poste (AJ/AK « dont Placement en Net »), non calculé · anomalie n° 8. */
  renvoi?: string;
  /** Préfixes de comptes portant le montant brut (actif) ou net (passif). */
  comptes: string[];
  /** Préfixes retranchés de `comptes` et de leurs subdivisions · clauses « sauf » du ch. 7. */
  exclusions?: string[];
  /** Actif seulement : comptes 28x/29x/39/49x/59x soustractifs de ce poste. */
  comptesAmortissement?: string[];
  /** Préfixes retranchés de `comptesAmortissement` · même logique que `exclusions`. */
  exclusionsAmortissement?: string[];
  /**
   * ACTIF seulement : comptes qui QUITTENT ce poste quand leur solde est
   * créditeur parce qu'un poste de PASSIF les réclame alors (banque à
   * découvert : BS → DR). Sans ça le découvert serait compté DEUX fois, en
   * négatif à l'actif et en positif au passif · anomalie n° 3.
   */
  comptesTransferesSiCrediteur?: string[];
  /** Restreint aux lignes de balance dont le solde va dans ce sens. */
  sens_qualificatif?: QualificatifSens;
}

/** Postes ACTIF portant directement des comptes (hors rubriques de totalisation). */
export const POSTES_ACTIF_SYSCOHADA: PosteBilanDeBase[] = [
  {
    ref: 'AE',
    libelle: 'Frais de développement et de prospection',
    sens: 'ACTIF',
    comptes: ['211', '2181', '2191'],
    // 2818p, 2918p, 2919p → AH (anomalie n° 1).
    comptesAmortissement: ['2811', '2911'],
  },
  {
    ref: 'AF',
    libelle: 'Brevets, licences, logiciels et droits similaires',
    sens: 'ACTIF',
    comptes: ['212', '213', '214', '2193'],
    // 2919p → AH (anomalie n° 1) ; 2914 et non 2929 (anomalie n° 6).
    comptesAmortissement: ['2812', '2813', '2814', '2912', '2913', '2914'],
  },
  {
    ref: 'AG',
    libelle: 'Fonds commercial et droit au bail',
    sens: 'ACTIF',
    comptes: ['215', '216'],
    comptesAmortissement: ['2815', '2816', '2915', '2916'],
  },
  {
    ref: 'AH',
    libelle: 'Autres immobilisations incorporelles',
    sens: 'ACTIF',
    // « 217, 218 (sauf 2181), 2198 » · 2181 remonte en AE.
    comptes: ['217', '218', '2198'],
    exclusions: ['2181'],
    // Les trois comptes « p » 2818, 2918, 2919 pris ici en entier (anomalie n° 1).
    comptesAmortissement: ['2817', '2818', '2917', '2918', '2919'],
  },
  {
    ref: 'AJ',
    libelle: 'Terrains',
    sens: 'ACTIF',
    renvoi: 'dont Placement en Net',
    comptes: ['22'],
    comptesAmortissement: ['282', '292'],
  },
  {
    ref: 'AK',
    libelle: 'Bâtiments',
    sens: 'ACTIF',
    renvoi: 'dont Placement en Net',
    comptes: ['231', '232', '233', '237', '2391'],
    // 2939p → AL (anomalie n° 1).
    comptesAmortissement: ['2831', '2832', '2833', '2837', '2931', '2932', '2933', '2937'],
  },
  {
    ref: 'AL',
    libelle: 'Aménagements, agencements et installations',
    sens: 'ACTIF',
    // Ch. 7 : « 234, 235, 238, 2392, 2393 » ; 2394, 2395, 2398 ajoutés (anomalie n° 2).
    comptes: ['234', '235', '238', '2392', '2393', '2394', '2395', '2398'],
    // 2939 pris ici en entier (anomalie n° 1).
    comptesAmortissement: ['2834', '2835', '2838', '2934', '2935', '2938', '2939'],
  },
  {
    ref: 'AM',
    libelle: 'Matériel, mobilier et actifs biologiques',
    sens: 'ACTIF',
    comptes: ['24'],
    exclusions: ['245', '2495'],
    // « 284 (sauf 2845), 294 (sauf 2945, 2949), 2949p » : 2949 pris ici en
    // entier, donc NON exclu de 294 (anomalie n° 1).
    comptesAmortissement: ['284', '294'],
    exclusionsAmortissement: ['2845', '2945'],
  },
  {
    ref: 'AN',
    libelle: 'Matériel de transport',
    sens: 'ACTIF',
    comptes: ['245', '2495'],
    // 2949p → AM (anomalie n° 1) ; 2945 et non 2948 (anomalie n° 6).
    comptesAmortissement: ['2845', '2945'],
  },
  {
    ref: 'AP',
    libelle: 'AVANCES ET ACOMPTES VERSÉS SUR IMMOBILISATIONS',
    sens: 'ACTIF',
    note: '3',
    // Rubrique en capitales dans le modèle mais qui porte directement ses
    // comptes (ch. 7) : c'est un poste de base, pas une totalisation.
    comptes: ['251', '252'],
    comptesAmortissement: ['2951', '2952'],
  },
  { ref: 'AR', libelle: 'Titres de participation', sens: 'ACTIF', comptes: ['26'], comptesAmortissement: ['296'] },
  { ref: 'AS', libelle: 'Autres immobilisations financières', sens: 'ACTIF', comptes: ['27'], comptesAmortissement: ['297'] },
  {
    ref: 'BA',
    libelle: 'ACTIF CIRCULANT HAO',
    sens: 'ACTIF',
    note: '5',
    comptes: ['485', '488'],
    comptesAmortissement: ['498'],
  },
  {
    ref: 'BB',
    libelle: 'STOCKS ET ENCOURS',
    sens: 'ACTIF',
    note: '6',
    comptes: ['31', '32', '33', '34', '35', '36', '37', '38'],
    comptesAmortissement: ['39'],
  },
  { ref: 'BH', libelle: 'Fournisseurs avances versées', sens: 'ACTIF', note: '17', comptes: ['409'], comptesAmortissement: ['490'] },
  { ref: 'BI', libelle: 'Clients', sens: 'ACTIF', note: '7', comptes: ['41'], exclusions: ['419'], comptesAmortissement: ['491'] },
  {
    ref: 'BJ',
    libelle: 'Autres créances',
    sens: 'ACTIF',
    note: '8',
    // « Soldes débiteurs : 185, 42, 43, 44, 45, 46, 47 (sauf 478) » · les
    // mêmes numéros vont en DK (42-44) et DM (185, 45-47) s'ils sont créditeurs.
    comptes: ['185', '42', '43', '44', '45', '46', '47'],
    // 479 exclu en plus de la lettre : il n'a qu'un poste, DV (anomalie n° 12).
    exclusions: ['478', '479'],
    comptesAmortissement: ['492', '493', '494', '495', '496', '497'],
    sens_qualificatif: 'DEBITEUR',
  },
  { ref: 'BQ', libelle: 'Titres de placement', sens: 'ACTIF', note: '9', comptes: ['50'], comptesAmortissement: ['590'] },
  { ref: 'BR', libelle: 'Valeurs à encaisser', sens: 'ACTIF', note: '10', comptes: ['51'], comptesAmortissement: ['591'] },
  {
    ref: 'BS',
    libelle: 'Banques, chèques postaux, caisse et assimilés',
    sens: 'ACTIF',
    note: '11',
    // « Soldes débiteurs : 52, 53, 54, 55, 57, 581, 582 » · 585 et 588
    // volontairement absents (anomalie n° 4).
    comptes: ['52', '53', '54', '55', '57', '581', '582'],
    comptesAmortissement: ['592', '593', '594'],
    // Seuls 52/53 ont un poste d'accueil créditeur (DR) ; 54, 55, 57, 581,
    // 582 créditeurs restent ici, visibles en négatif (anomalie n° 3).
    comptesTransferesSiCrediteur: ['52', '53'],
  },
  { ref: 'BU', libelle: 'Écart de conversion-Actif', sens: 'ACTIF', note: '12', comptes: ['478'] },
];

/** Postes PASSIF portant directement des comptes (hors totaux). CJ (résultat) est calculé à part. */
export const POSTES_PASSIF_SYSCOHADA: PosteBilanDeBase[] = [
  // « 101 à 104 » : 101 Capital social, 102 Capital par dotation, 103
  // Capital personnel, 104 Compte de l'exploitant · ce dernier doit être
  // soldé par le 103 à la clôture (anomalies n° 6 et 10).
  { ref: 'CA', libelle: 'Capital', sens: 'PASSIF', note: '13', comptes: ['101', '102', '103', '104'] },
  // 109 est débiteur : ressort en négatif par la convention de signe, ce
  // que le libellé « (-) » du modèle annonce.
  { ref: 'CB', libelle: 'Apporteurs capital non appelé (-)', sens: 'PASSIF', note: '13', comptes: ['109'] },
  { ref: 'CD', libelle: 'Primes liées au capital social', sens: 'PASSIF', note: '14', comptes: ['105'] },
  // Renvoi « 3e » (note 3E, réévaluations), seul renvoi du bilan en minuscule.
  { ref: 'CE', libelle: 'Écarts de réévaluation', sens: 'PASSIF', note: '3e', comptes: ['106'] },
  { ref: 'CF', libelle: 'Réserves indisponibles', sens: 'PASSIF', note: '14', comptes: ['111', '112', '113'] },
  { ref: 'CG', libelle: 'Réserves libres', sens: 'PASSIF', note: '14', comptes: ['118'] },
  // « 12 (121 ou 129) » : 121 créditeur en plus, 129 débiteur en moins.
  { ref: 'CH', libelle: 'Report à nouveau (+ ou -)', sens: 'PASSIF', note: '14', comptes: ['12'] },
  // CJ « Résultat net de l'exercice (bénéfice + ou perte -) » : voir
  // COMPTES_RESULTAT_SYSCOHADA, calculé par le service (en-tête, § résultat).
  { ref: 'CL', libelle: "Subventions d'investissement", sens: 'PASSIF', note: '15', comptes: ['14'] },
  { ref: 'CM', libelle: 'Provisions réglementées', sens: 'PASSIF', note: '15', comptes: ['15'] },
  // 16 en entier (167 « autres fonds propres » compris, anomalie n° 9) ;
  // 185 va en BJ/DM, 186 à 188 sans poste (anomalie n° 5).
  {
    ref: 'DA',
    libelle: 'Emprunts et dettes financières diverses',
    sens: 'PASSIF',
    note: '16',
    comptes: ['16', '181', '182', '183', '184'],
  },
  { ref: 'DB', libelle: 'Dettes de location acquisition', sens: 'PASSIF', note: '16', comptes: ['17'] },
  // « 19 » englobe 1962 (actif du régime de retraite), débiteur : DC ressort
  // net de cet actif (anomalie n° 14).
  { ref: 'DC', libelle: 'Provisions pour risques et charges', sens: 'PASSIF', note: '16', comptes: ['19'] },
  { ref: 'DH', libelle: 'Dettes circulantes HAO', sens: 'PASSIF', note: '5', comptes: ['481', '482', '484', '4998'] },
  { ref: 'DI', libelle: 'Clients, avances reçues', sens: 'PASSIF', note: '7', comptes: ['419'] },
  { ref: 'DJ', libelle: "Fournisseurs d'exploitation", sens: 'PASSIF', note: '17', comptes: ['40'], exclusions: ['409'] },
  {
    ref: 'DK',
    libelle: 'Dettes fiscales et sociales',
    sens: 'PASSIF',
    note: '18',
    comptes: ['42', '43', '44'],
    sens_qualificatif: 'CREDITEUR',
  },
  {
    ref: 'DM',
    libelle: 'Autres dettes',
    sens: 'PASSIF',
    note: '19',
    // « 47 » englobe 4726 (versements restant à effectuer sur titres non
    // libérés), dette créditrice ordinaire (anomalie n° 11).
    comptes: ['185', '45', '46', '47'],
    // 478 exclu en plus de la lettre : il n'a qu'un poste, BU (anomalie n° 12).
    exclusions: ['478', '479'],
    sens_qualificatif: 'CREDITEUR',
  },
  {
    ref: 'DN',
    libelle: 'Provisions pour risques à court terme',
    sens: 'PASSIF',
    note: '19',
    comptes: ['499', '599'],
    exclusions: ['4998'],
  },
  { ref: 'DQ', libelle: "Banques, crédits d'escompte", sens: 'PASSIF', note: '20', comptes: ['564', '565'] },
  {
    ref: 'DR',
    libelle: 'Banques, établissements financiers et crédits de trésorerie',
    sens: 'PASSIF',
    note: '20',
    // « Soldes créditeurs : 52, 53, 561, 566 » · le qualificatif du ch. 7
    // n'est PAS posé sur 561/566 : sans poste d'accueil débiteur, un 561
    // débiteur doit rester visible en négatif ici plutôt que disparaître
    // (anomalie n° 3, second alinéa). 52/53 créditeurs arrivent par
    // COMPTES_TRESORERIE_PASSIF_SI_CREDITEUR_SYSCOHADA.
    comptes: ['561', '566'],
  },
  { ref: 'DV', libelle: 'Écart de conversion-Passif', sens: 'PASSIF', note: '12', comptes: ['479'] },
];

/**
 * DR capte aussi 52/53 côté créditeur, alors que BS (actif) les capte côté
 * débiteur. Représenté à part car ce n'est pas un poste de base ordinaire :
 * il partage ses numéros avec un poste de l'ACTIF, distingué par le seul
 * sens du solde (ch. 7, clés de lecture : « 52, 53 → BS si débiteur, DR si
 * créditeur »).
 */
export const COMPTES_TRESORERIE_PASSIF_SI_CREDITEUR_SYSCOHADA = ['52', '53'];
/** Poste de passif qui reçoit ces soldes créditeurs (DW côté SYCEBNL, DR ici). */
export const REF_TRESORERIE_PASSIF_SYSCOHADA = 'DR';

/**
 * CJ « Résultat net de l'exercice (bénéfice + ou perte -) » · ch. 7 :
 * « 13 (131 ou 139) ». 132 à 138 ajoutés par choix propre (soldes
 * intermédiaires de transit du résultat N, Titre VIII ch. 19 § 2.4) ; 130
 * (résultat N-1 en instance d'affectation) volontairement ABSENT · anomalie
 * n° 7. Utilisé par le service APRÈS clôture seulement ; avant clôture, le
 * résultat se lit dans les classes 6/7/8 (voir l'en-tête, § résultat).
 * Écrit compte par compte plutôt que « 13 » précisément pour que le 130 ne
 * s'y glisse pas par `startsWith`.
 */
export const REF_RESULTAT_SYSCOHADA = 'CJ';
export const LIBELLE_RESULTAT_SYSCOHADA = "Résultat net de l'exercice (bénéfice + ou perte -)";
export const COMPTES_RESULTAT_SYSCOHADA = ['131', '132', '133', '134', '135', '136', '137', '138', '139'];

/**
 * Comptes de bilan (classes 1 à 5) du plan semé qu'AUCUN poste ne capte,
 * et pour lesquels c'est VOULU · chacun renvoie à une anomalie de
 * l'en-tête. Le spec vérifie que cette liste est exactement l'ensemble des
 * orphelins (ni plus, ni moins) : un compte qui s'y ajouterait sans
 * justification, ou qui en sortirait parce qu'un poste l'a capté entre
 * temps, casse le test. Le service, lui, ne les masque jamais : ils
 * remontent en `comptesNonRattaches` dès qu'ils portent un solde.
 */
export const COMPTES_BILAN_SANS_POSTE_JUSTIFIES: { prefixe: string; anomalie: number; motif: string }[] = [
  { prefixe: '130', anomalie: 7, motif: 'Résultat de l’exercice précédent en instance d’affectation (Titre VII COMPTE 13) : ni CJ (résultat N) ni CH tant que l’assemblée n’a pas statué ; à solder avant la clôture' },
  { prefixe: '186', anomalie: 5, motif: 'Compte de liaison charges siège/établissements, neutralisé dans la comptabilité fusionnée (Titre VII COMPTE 18)' },
  { prefixe: '187', anomalie: 5, motif: 'Compte de liaison produits siège/établissements, neutralisé dans la comptabilité fusionnée (Titre VII COMPTE 18)' },
  { prefixe: '188', anomalie: 5, motif: 'Compte de liaison des sociétés en participation : aucun poste au ch. 7 ; le Titre VII COMPTE 18 le range avec 181 à 183 (opérations financières entre entités liées) sans lui donner de poste' },
  { prefixe: '585', anomalie: 4, motif: 'Virements de fonds, à solder à la clôture (Titre VII COMPTE 58) ; un résidu est une erreur d’inventaire' },
  { prefixe: '588', anomalie: 4, motif: 'Autres virements internes, à solder à la clôture (Titre VII COMPTE 58) ; un résidu est une erreur d’inventaire' },
];

/**
 * Comptes de bilan que le Titre VII impose de SOLDER à la clôture de
 * l'exercice · un solde non nul sur un arrêté définitif est une erreur de
 * clôture, pas un cas de présentation. Distinct de la liste des orphelins :
 * 104 a un poste (CA) et n'est donc jamais « non rattaché », mais mérite le
 * même signalement. Le service décide du niveau (avertissement sur un
 * bilan intermédiaire, où 104 et 130 sont légitimes ; anomalie sur un
 * bilan de clôture). Chaque entrée cite sa fiche.
 */
export const COMPTES_BILAN_A_SOLDER_A_LA_CLOTURE: { prefixe: string; anomalie: number; source: string }[] = [
  { prefixe: '104', anomalie: 10, source: 'Titre VII COMPTE 104 : « systématiquement soldé à la clôture de l’exercice » par le 103' },
  { prefixe: '130', anomalie: 7, source: 'Titre VII COMPTE 13 : le résultat N-1 non affecté est viré au report à nouveau en fin d’exercice' },
  { prefixe: '585', anomalie: 4, source: 'Titre VII COMPTE 58 : « soldés à la fin de l’exercice »' },
  { prefixe: '588', anomalie: 4, source: 'Titre VII COMPTE 58 : « soldés à la fin de l’exercice »' },
];

export function trouvePosteActifSyscohada(ref: string): PosteBilanDeBase | undefined {
  return POSTES_ACTIF_SYSCOHADA.find((p) => p.ref === ref);
}
export function trouvePostePassifSyscohada(ref: string): PosteBilanDeBase | undefined {
  return POSTES_PASSIF_SYSCOHADA.find((p) => p.ref === ref);
}

/** Un total = somme des montants d'autres postes (détail OU total imbriqué). */
export interface TotalBilan {
  ref: string;
  libelle: string;
  note?: string;
  deRefs: string[];
}

/**
 * Formules des rubriques de totalisation · le ch. 7 marque « (rubrique de
 * totalisation) » sans écrire la formule ; celle-ci se lit sur le modèle
 * du ch. 3 (les postes de détail placés sous chaque rubrique). La colonne
 * `formule` du TSV du skill les recoupe TOUTES SAUF AI et AZ, où le TSV
 * range AP sous AI ; le modèle est suivi (anomalie n° 13). L'ORDRE de ce
 * tableau compte : chaque total ne référence que des refs déjà résolues
 * (spec dédié).
 */
export const TOTAUX_ACTIF_SYSCOHADA: TotalBilan[] = [
  { ref: 'AD', libelle: 'IMMOBILISATIONS INCORPORELLES', note: '3', deRefs: ['AE', 'AF', 'AG', 'AH'] },
  // AP n'en fait pas partie : rubrique sœur, note 3 propre (anomalie n° 13).
  { ref: 'AI', libelle: 'IMMOBILISATIONS CORPORELLES', note: '3', deRefs: ['AJ', 'AK', 'AL', 'AM', 'AN'] },
  { ref: 'AQ', libelle: 'IMMOBILISATIONS FINANCIÈRES', note: '4', deRefs: ['AR', 'AS'] },
  { ref: 'AZ', libelle: 'TOTAL ACTIF IMMOBILISÉ', deRefs: ['AD', 'AI', 'AP', 'AQ'] },
  { ref: 'BG', libelle: 'CRÉANCES ET EMPLOIS ASSIMILÉS', deRefs: ['BH', 'BI', 'BJ'] },
  { ref: 'BK', libelle: 'TOTAL ACTIF CIRCULANT', deRefs: ['BA', 'BB', 'BG'] },
  { ref: 'BT', libelle: 'TOTAL TRÉSORERIE-ACTIF', deRefs: ['BQ', 'BR', 'BS'] },
  { ref: 'BZ', libelle: 'TOTAL GÉNÉRAL', deRefs: ['AZ', 'BK', 'BT', 'BU'] },
];

export const TOTAUX_PASSIF_SYSCOHADA: TotalBilan[] = [
  {
    ref: 'CP',
    libelle: 'TOTAL CAPITAUX PROPRES ET RESSOURCES ASSIMILÉES',
    deRefs: ['CA', 'CB', 'CD', 'CE', 'CF', 'CG', 'CH', 'CJ', 'CL', 'CM'],
  },
  { ref: 'DD', libelle: 'TOTAL DETTES FINANCIÈRES ET RESSOURCES ASSIMILÉES', deRefs: ['DA', 'DB', 'DC'] },
  { ref: 'DF', libelle: 'TOTAL RESSOURCES STABLES', deRefs: ['CP', 'DD'] },
  { ref: 'DP', libelle: 'TOTAL PASSIF CIRCULANT', deRefs: ['DH', 'DI', 'DJ', 'DK', 'DM', 'DN'] },
  { ref: 'DT', libelle: 'TOTAL TRÉSORERIE-PASSIF', deRefs: ['DQ', 'DR'] },
  { ref: 'DZ', libelle: 'TOTAL GÉNÉRAL', deRefs: ['DF', 'DP', 'DT', 'DV'] },
];

/**
 * Ordre d'affichage du modèle (ch. 3 section 2) · mélange détail et totaux.
 * Les codes ne sont pas continus, et c'est voulu par le texte : « il
 * n'existe ni BC, ni BD, ni BE, ni BF, ni BL à BP ; AO n'existe pas non
 * plus » ; au passif « ni CC, ni CI, ni CK, ni CN, ni DE, DG, DL, DO, DS,
 * DU, DW à DY ». Ne pas « combler » ces trous.
 */
export const ORDRE_AFFICHAGE_ACTIF_SYSCOHADA = [
  'AD', 'AE', 'AF', 'AG', 'AH',
  'AI', 'AJ', 'AK', 'AL', 'AM', 'AN',
  'AP',
  'AQ', 'AR', 'AS',
  'AZ',
  'BA', 'BB',
  'BG', 'BH', 'BI', 'BJ',
  'BK',
  'BQ', 'BR', 'BS',
  'BT',
  'BU',
  'BZ',
];
export const ORDRE_AFFICHAGE_PASSIF_SYSCOHADA = [
  'CA', 'CB', 'CD', 'CE', 'CF', 'CG', 'CH', 'CJ', 'CL', 'CM',
  'CP',
  'DA', 'DB', 'DC',
  'DD',
  'DF',
  'DH', 'DI', 'DJ', 'DK', 'DM', 'DN',
  'DP',
  'DQ', 'DR',
  'DT',
  'DV',
  'DZ',
];
