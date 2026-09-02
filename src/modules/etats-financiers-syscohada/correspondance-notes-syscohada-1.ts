import { SpecificationNote } from '../notes-annexes/note-annexe.types';

/**
 * NOTES ANNEXES du SYSCOHADA révisé · Système normal (AUDCIF art. 11),
 * PREMIÈRE TRANCHE : notes 1, 2, 3A à 3F, 4 à 14, 15A et 15B.
 *
 * Sources, toutes LUES au moment de la transcription (règle §1 de CLAUDE.md,
 * jamais de mémoire, jamais complété depuis le SYCEBNL) :
 *  - AUDCIF Titre IX ch. 6 « Notes annexes du Système normal », section 1
 *    (règles générales) et section 2 (liste officielle et maquette des
 *    NOTE 1 à NOTE 36) · skill `audcif-acte-uniforme`,
 *    references/titre-9-ch6-7-notes-annexes-correspondance.md, lignes 12 à
 *    323 pour cette tranche : titres, colonnes, rubriques dans l'ordre,
 *    renvois et commentaires y sont transcrits mot pour mot ;
 *  - AUDCIF Titre IX ch. 7 « Tableau de correspondance Postes/Comptes »
 *    (même fichier, lignes 764 à 852) · c'est LUI qui définit chaque poste
 *    de bilan qu'une note documente ; quand une note et le ch. 7 se
 *    contredisent, le ch. 7 tranche ;
 *  - AUDCIF Titre IX ch. 3 section 2 « Modèles de Bilan » (references/
 *    titre-9-ch1-5-bilan-resultat-flux.md, lignes 318 à 402) · colonne
 *    « Note » de chaque poste, d'où `renvoyeeDepuis` ;
 *  - AUDCIF Titre VII, fiches COMPTE 14, 15, 16, 17, 18, 22, 23, 27, 41, 47,
 *    48, 53, 55, 58 · pour arbitrer chaque rattachement discuté ci-dessous ;
 *  - AUDCIF Titre VIII ch. 8 § 1.4 (champ des contrats de location) et
 *    ch. 41 § 2 (première application, compte 475, charges immobilisées) ;
 *  - le plan de comptes SYSCOHADA (skill `syscohada`, comptes/references/
 *    plan-comptes.tsv, semé par `compte-seed-syscohada.ts`) · chaque
 *    préfixe cité existe dans ce semis, vérifié par le spec voisin ;
 *  - en AIDE seulement, le moteur Python du skill `syscohada`
 *    (liasse/references/notes-ohada.md et liasse/scripts/notes_sn.py) ·
 *    chacune de ses affectations a été revérifiée au plan et au ch. 7.
 *
 * Même MOTEUR déclaratif que les notes SYCEBNL (`note-annexe.types.ts`) et
 * même forme d'objet que `notes-annexes/correspondance-notes-associations.ts`,
 * pour que le service reprenne la même mécanique : rubriques en lignes,
 * colonnes typées, totaux en une passe, rattachement par dossier des
 * rubriques en attente. Aucun compte, aucune rubrique, aucun titre n'en est
 * repris : les deux référentiels ne partagent que la mécanique (CLAUDE.md §6).
 *
 * ## Le rattachement aux comptes n'est PAS donné par le texte
 *
 * Le ch. 6 n'énumère que des libellés de rubriques ; seul le ch. 7 donne des
 * comptes, et seulement au niveau du POSTE de bilan. Règle tenue ici :
 *
 * 1. Une rubrique n'est rattachée que lorsque le plan de comptes la détermine
 *    SANS jugement : le libellé de la rubrique est celui d'un compte ou d'une
 *    famille de comptes du plan (note 9 « Actions » = 502, note 14 « Réserve
 *    légale » = 111, note 15A « Régions » = 1412…).
 * 2. Quand la rubrique réclame une finesse que le plan n'a pas, elle porte
 *    `subdivisionAttendue` avec une `cle` stable et reste NON rattachée
 *    (note 3C « Terrains - immeuble de placement » : le 282 n'a pas de
 *    divisionnaire par destination).
 * 3. Une rubrique hors comptabilité (sûretés, engagements, liste des
 *    filiales, réévaluations, texte libre) est en `saisie`, et une note qui
 *    n'a que cela est `horsBalance`.
 * 4. Un compte que le ch. 7 met dans le poste documenté par la note, mais
 *    auquel la note ne donne AUCUNE ligne, est rangé dans la ligne
 *    résiduelle de la note et SIGNALÉ (section ANOMALIES, n° 6). Le laisser
 *    dehors ferait diverger la note de son poste, et c'est ce recoupement
 *    (note ↔ poste) que le spec vérifie.
 *
 * ## Convention de lecture des numéros de comptes
 *
 * Celle du ch. 7 et du bilan SYSCOHADA (`correspondance-bilan-syscohada.ts`) :
 * un jeton de 2 chiffres englobe ses divisionnaires, un jeton plus long ne
 * vaut que pour lui-même et ses subdivisions ; `exclusions` transcrit les
 * clauses « sauf ». La comparaison se fait par `numero.startsWith(prefixe)`
 * sur les numéros du semis (feuilles complétées à 8 chiffres, CLAUDE.md §7).
 *
 * ## Convention de signe
 *
 * Une rubrique d'actif est lue au débit. Une rubrique de passif ou de produit
 * porte `natureCreditrice` (présentée en positif SANS filtre : un compte de
 * passif momentanément débiteur ressort en négatif, où il se voit). Les
 * comptes de tiers que le ch. 7 éclate PAR LE SENS DU SOLDE (42 à 47, 185 en
 * BJ/DM ; 52, 53 en BS/DR) portent `sens`, qui filtre ligne de balance par
 * ligne de balance, jamais sur l'agrégat (Titre VII COMPTE 47 : « aucune
 * compensation n'est en principe admise »). Les dépréciations intercalées
 * dans une note d'actif portent `presenterEnNegatif`, comme la maquette qui
 * les soustrait pour obtenir le « TOTAL NET DE DÉPRÉCIATION ».
 *
 * Écart assumé avec le contrat écrit de `note-annexe.types.ts` : le champ
 * `sens` y est documenté « réservé aux rubriques qui coexistent avec leur
 * symétrique dans la même note » (cas SYCEBNL de la note 9). Les notes 8 et
 * 11 l'emploient sur des rubriques SANS symétrique dans le même tableau,
 * parce que c'est le ch. 7 qui éclate ces comptes par le sens du solde et que
 * le symétrique vit dans une AUTRE note (note 1 pour DK et DM, note 20 pour
 * DR). Le filtre s'applique ligne de balance par ligne de balance, donc le
 * comportement est le même ; seule la formulation du contrat est plus
 * étroite que l'usage. Signalé ici plutôt que corrigé dans un fichier
 * partagé du moteur.
 *
 * `presenterEnNegatif` est réservé aux DÉPRÉCIATIONS intercalées dans une
 * note d'actif, à la lettre de son contrat : le service l'applique en double
 * négation (montant par compte = -solde, puis total = -brut), ce qui rend
 * bien un total négatif pour un compte de nature créditrice, mais un total
 * POSITIF pour un compte débiteur. Une ligne débitrice à présenter « en
 * moins » (note 13, compte 109) se déclare donc `natureCreditrice`, comme le
 * poste CB est lu au passif par le bilan, et non `presenterEnNegatif`.
 *
 * ## Tableaux de situations et mouvements (notes 3A, 3B, 3C)
 *
 * Le texte pose lui-même « D = A + B - C » (note 3B, 3C). A est le report
 * à-nouveau, B et C les mouvements propres de l'exercice, D est RECALCULÉ et
 * confronté au solde réel (`ecartCloture`). Les sous-colonnes que la balance
 * ne distingue pas d'un mouvement ordinaire (virements de poste à poste,
 * réévaluation) sont déclarées LIBRE · anomalie n° 9.
 *
 * ## ANOMALIES du texte officiel, rencontrées et tranchées ici
 *
 * Aucune n'est corrigée en silence (CLAUDE.md §9). Numérotées pour être
 * citées depuis les rubriques et le spec.
 *
 * 1. **NOTE 3F imprimée « 8A »** · l'en-tête de page et le titre de la
 *    maquette portent « NOTE 8A · TABLEAU D'ÉTALEMENT DES CHARGES
 *    IMMOBILISÉES », alors que la liste du ch. 6 section 2 et la fiche R4 la
 *    désignent NOTE 3F ; il n'existe aucune NOTE 8A dans la liste officielle.
 *    Retenu : code « 3F », titre de la liste officielle.
 *
 * 2. **NOTE 3C intitulée « 3B » en tête de page** · l'en-tête porte « NOTE
 *    3B · IMMOBILISATIONS (AMORTISSEMENTS) » ; le titre de la note est bien
 *    3C. Coquille de numérotation, code « 3C » retenu.
 *
 * 3. **NOTE 3B ouvre des lignes d'immobilisations INCORPORELLES** (brevets,
 *    fonds commercial, autres incorporelles) alors que Titre VIII ch. 8
 *    § 1.4 limite les contrats de location aux « immobilisations corporelles
 *    (hors actifs biologiques) », et que le plan n'a aucun divisionnaire de
 *    location-acquisition en classe 21. Ces trois lignes sont transcrites
 *    (fidélité à la maquette) mais en `saisie` : rien à rattacher, et
 *    demander au dossier un sous-compte que le Titre VIII interdit serait
 *    pire. La note omet par ailleurs les « frais de développement et de
 *    prospection » que porte la 3A ; non ajoutés.
 *
 * 4. **Intitulés divergents entre la liste et la maquette** · NOTE 7 : liste
 *    « CLIENTS PRODUITS À RECEVOIR », maquette « CLIENTS » ; NOTE 11 :
 *    liste « DISPONIBILITÉS », maquette « BANQUES, CHÈQUES POSTAUX ET
 *    CHÈQUES » ; NOTE 15A : liste « SUBVENTIONS ET PROVISIONS
 *    RÉGLEMENTÉES », maquette « TOTAL SUBVENTIONS ET PROVISIONS
 *    RÉGLEMENTÉES ». Retenu partout : l'intitulé de la LISTE officielle
 *    (section 2), qui est aussi celui de la fiche récapitulative.
 *
 * 5. **Colonnes de variation inégales d'une note à l'autre** · les notes 4 à
 *    12 ne donnent que « Année N · Année N-1 · Variation en % » ; la note 14
 *    ne donne que « Variation en valeur absolue » ; les notes 15A et 15B
 *    donnent « Variation en valeur absolue » ET « Variation en % ».
 *    Reproduit tel quel, sans uniformiser.
 *    Dans le ch. 6, « valeur absolue » s'oppose à « en % » : c'est la
 *    variation EN MONTANT (N moins N-1), pas la valeur absolue arithmétique.
 *    Les notes 14, 15A et 15B portent donc `VARIATION_VALEUR` et non
 *    `VARIATION_VALEUR_ABSOLUE`, dont `note-annexe.types.ts` réserve le sens
 *    à « |N − N-1| » et que `NoteAnnexeService` calcule par `Math.abs` : une
 *    réserve qui baisse, un report à nouveau qui passe de +100 à -50, une
 *    subvention reprise ressortiraient sinon en POSITIF, c'est-à-dire avec le
 *    signe inverse du fait économique. Le libellé de la colonne reste celui
 *    du texte, mot pour mot.
 *
 * 6. **Comptes du poste sans ligne propre dans la note** (règle 4 ci-dessus) :
 *    - note 4 : 277 « Créances rattachées à des participations et avances à
 *      des GIE » et 278 « Immobilisations financières diverses » sont dans
 *      AS (ch. 7 : « 27 ») mais la note n'a pas de ligne pour eux → rangés
 *      en « Prêts et créances » (Titre VII COMPTE 27 : « les créances
 *      rattachées à des participations sont des prêts ou avances consentis
 *      à une société… »). Pour 278 le rangement est à CONTRE-EMPLOI : ses
 *      divisionnaires 2784 « Banques dépôts à terme » et 2785 « Or et
 *      métaux précieux » ne sont ni des prêts ni des créances, et le
 *      commentaire officiel de la note 3A demande justement, « pour les
 *      banques, DAT », le nom de la banque et l'échéance, donc les attendait
 *      ailleurs. Le laisser dehors ferait diverger la note de AS, qui est
 *      « 27 » tout entier ; il est donc capté et SIGNALÉ sur la rubrique
 *      elle-même (`renvoi`), pour que le lecteur de l'état le voie et pas
 *      seulement le lecteur du code ;
 *    - note 1 : 185 « Comptes permanents non bloqués des établissements et
 *      succursales » est dans DM (ch. 7 : « soldes créditeurs : 185, 45,
 *      46, 47 ») mais la note n'a pas de ligne pour lui → rangé en
 *      « Créditeurs divers », ligne résiduelle du passif circulant ;
 *    - note 5 : 4998 « Provisions pour risques à court terme sur opérations
 *      HAO » est dans DH (ch. 7 : « 481, 482, 484, 4998 ») → rangé en
 *      « Autres dettes hors activités ordinaires » ;
 *    - note 7 : 413 « Clients, chèques, effets et autres valeurs impayés »
 *      est dans BI (« 41 sauf 419 ») → rangé en « Clients (hors réserves de
 *      propriété Groupe) », ligne générique de la note ;
 *    - note 8 : 186, 187, 188 (comptes de liaison) reçoivent ici une ligne
 *      chacun alors que le ch. 7 ne les met dans AUCUN poste (bilan,
 *      anomalie n° 5, `COMPTES_BILAN_SANS_POSTE_JUSTIFIES`). La note 8 est
 *      donc PLUS large que BJ : c'est le ch. 6 qui le veut, et le spec
 *      tolère exactement ces trois préfixes ;
 *    - note 15A : 148 « Autres subventions d'investissement » → ligne
 *      « Autres » (avec 1418) ; 153 « Fonds réglementés » → ligne « Autres
 *      provisions et fonds réglementées » (avec 158), le libellé de la
 *      ligne nommant les fonds réglementés.
 *
 * 7. **NB de la note 11 sur les intérêts courus, NON mécanisable** ·
 *    « Banques intérêts courus et Établissement financiers intérêts courus
 *    figurent dans cette rubrique en négatif si le compte principal attaché
 *    est débiteur » ; le ch. 6 glose que « les intérêts courus suivent le
 *    sens du compte PRINCIPAL, jamais leur propre sens ». Or une balance ne
 *    dit pas à quel compte bancaire un 5261 se rattache : la règle du NB est
 *    inapplicable en l'état, et aucun contournement ne la rendrait juste.
 *    Ce qui tranche alors, c'est le ch. 7 (source primaire du rattachement,
 *    et clé de lecture explicite : « L'affectation ne se lit jamais sur le
 *    seul numéro de compte : il faut le sens du solde à la clôture »), qui
 *    envoie tout 52 et tout 53 créditeur en DR sans exception pour 526 et
 *    536. 526 et 536 sont donc filtrés `DEBITEUR` comme les autres 52x/53x,
 *    exactement comme le bilan du dépôt les transfère en DR
 *    (`correspondance-bilan-syscohada.ts`, `comptesTransferesSiCrediteur`
 *    = ['52', '53']). Conséquences tenues : le TOTAL BRUT de la note 11
 *    recoupe BS, la note 20 (seconde tranche, qui filtre 526 et 53 au
 *    crédit) recoupe DR, et un 5261 créditeur n'est plus compté DEUX fois.
 *    Le NB reste reproduit mot pour mot en `renvoiOfficiel` : l'entité qui
 *    doit l'appliquer le lit sur l'état.
 *
 * 8. **NOTE 15B « Autres fonds propres »** · ch. 7, clés de lecture : « le
 *    tableau ne leur attribue aucun code ; le 16 de DA les absorbe, sauf
 *    ligne intercalée entre CP et DA ». La note est donc un DÉTAIL de DA,
 *    pas un poste : « Avances conditionnées » = 167 (seul compte que le
 *    ch. 7 nomme pour la 15B) ; « Obligations remboursables en actions
 *    (O.R.A.) » = 1613, dont le libellé au plan est exactement celui-là,
 *    mais qui reste aussi dans 161 (note 16A) · les deux notes ne
 *    s'additionnent pas. « Titres participatifs », « T.S.D.I. » et
 *    « Autres » n'ont aucun compte de passif au plan (2742 est un titre
 *    DÉTENU, à l'actif) → en attente de rattachement.
 *
 * 9. **Colonnes de virements et de réévaluation (3A, 3B)** · un virement de
 *    poste à poste ou une réévaluation ne se distingue pas, en balance, d'une
 *    acquisition ou d'une cession : ce sont des débits et des crédits sur
 *    les mêmes comptes. Ces sous-colonnes sont déclarées LIBRE (saisie) ; B
 *    et C portent le TOTAL des mouvements, et D = A + B - C reste juste.
 *
 * 10. **NOTE 3C, immeubles de placement** · le brut distingue 2281, 2315 et
 *    2325, mais le plan n'a AUCUN compte d'amortissement dédié (282 ne
 *    contient que 2824 ; 2831 et 2832 ne sont pas subdivisés). Ces deux
 *    lignes ne peuvent donc PAS être mises en attente de rattachement : le
 *    service AJOUTE les comptes rattachés aux préfixes officiels sans les
 *    retirer des autres rubriques (`NoteAnnexeService.calculerRubrique`),
 *    et les lignes « hors placement » captent déjà 282, 2831 et 2832 en
 *    ENTIER. Un sous-compte de 2831 rattaché à la ligne « placement » serait
 *    compté deux fois dans « SOUS TOTAL : IMMOBILISATIONS CORPORELLES » et
 *    dans « TOTAL GÉNÉRAL », et la note ne recouperait plus la colonne
 *    « Amort. et déprec. » du bilan · un total faux que rien ne signale.
 *    Retenu : les deux lignes « immeuble de placement » sont en `saisie`,
 *    comme les lignes incorporelles de la 3B (anomalie n° 3), avec le motif
 *    porté sur la ligne (`renvoi`). Retirer les préfixes des lignes « hors
 *    placement » n'est pas une option : 282, 2831 et 2832 sortiraient alors
 *    de la note tout en restant dans le poste.
 *
 * 11. **NOTE 13, détail par apporteur** · le capital par nom, nationalité,
 *    nature et nombre de titres n'est pas comptable (le 101 n'est pas
 *    subdivisé par apporteur). Ce détail est en saisie. La ligne
 *    « Apporteurs, capital non appelé » (109) est présentée en moins, comme
 *    CB au bilan (« (-) ») : elle porte `natureCreditrice`, c'est-à-dire
 *    qu'elle est LUE AU CRÉDIT comme le poste CB l'est au passif, et un 109
 *    débiteur y ressort donc en négatif. (`presenterEnNegatif` aurait donné
 *    l'inverse : le service l'applique en double négation, neutre sur un
 *    compte créditeur mais positive sur un compte débiteur · voir la
 *    « Convention de signe » ci-dessus.)
 *    Le texte ne dit pas ce que totalise le « TOTAL » de cette note, dont
 *    toutes les lignes de détail sont en saisie : il porte ici la
 *    contre-valeur comptable du capital (CA, « 101 à 104 »), donc un montant
 *    lu en balance et NON la somme arithmétique des lignes affichées. Le
 *    choix est écrit sur la ligne (`renvoi`) pour que l'écran ne le fasse
 *    pas passer pour une addition.
 *
 * 12. **NOTE 12, second tableau « Transferts de charges »** · sans rapport
 *    avec les écarts de conversion, il existe parce que la note 12 est
 *    appelée par TI et TM du compte de résultat. Transcrit en sous-tableau.
 *
 * 13. **NOTE 3D entièrement en saisie** · à la clôture un bien cédé n'est
 *    plus au bilan (brut et amortissements soldés par l'écriture de
 *    cession) ; les comptes 81 et 82 ne descendent qu'à trois natures
 *    (811/821 incorporelles, 812/822 corporelles, 816/826 financières) là
 *    où le tableau en veut douze, et ils ne donnent que la VNC et le prix,
 *    jamais A et B. Les sous-totaux par nature sont reconstituables depuis
 *    81 et 82 ; c'est un contrôle du dossier de révision, pas une note.
 *
 * 14. **NOTE 3F datée en dur (2018 à 2022)** · c'est la note de suivi de
 *    l'étalement du Titre VIII ch. 41 (première application, compte 4751
 *    étalé « sans dépasser cinq (5) ans »). Transcrite telle quelle, en
 *    saisie ; le solde restant du 4751 est chiffré à la note 8.
 *
 * 15. **NOTE 1, intérêts courus traités différemment dans ses deux blocs** ·
 *    les 176x (dettes de location-acquisition) suivent chacun sa dette
 *    (1762 → crédit-bail immobilier, 1763 → mobilier, 1764 → location-vente,
 *    1768 → autres), alors que les 166x (emprunts) restent dans la ligne
 *    résiduelle « Autres dettes financières ». Ni le ch. 6 ni le ch. 7 ne
 *    disent où vont les intérêts courus dans la note 1 ; deux raisons, dont
 *    chacune suffit, expliquent l'écart :
 *    a) le bloc DB n'a AUCUNE ligne résiduelle · ses quatre lignes sont
 *       exactement 172, 173, 174 et 178, et le SOUS TOTAL (2) doit recouper
 *       DB = « 17 » ; ne pas ventiler 176 le ferait sortir de la note. Le
 *       bloc DA, lui, a « Autres dettes financières » pour l'accueillir ;
 *    b) la ventilation de 176 est SANS jugement (Titre VII COMPTE 17 : un
 *       divisionnaire d'intérêts par dette, 1:1), celle de 166 ne l'est pas ·
 *       1661 « sur emprunts obligataires » couvre à la fois 1612
 *       (convertibles) et 161 hors 1612, que la note sépare en DEUX lignes.
 *       Le rattacher à l'une des deux serait un rangement au jugé, contraire
 *       à la règle 1 ci-dessus. Le détail des intérêts courus existe par
 *       ailleurs : la note 16A leur donne une ligne propre, et chaque ligne
 *       de la note 1 y renvoie (`renvoi: '16A'`).
 *
 * 16. **`renvoyeeDepuis` : ce que la colonne « Note » du bilan dit, et rien
 *    de plus** · le champ est documenté « codes REF des postes d'état qui
 *    renvoient ici ». Il est donc rempli à partir de la colonne « Note » du
 *    modèle de bilan du ch. 3 et des gloses du ch. 6 qui nomment un poste du
 *    compte de résultat (3C → RL, RN ; 3D → TN, RO ; 6 → RB, TE, RD, RF ;
 *    12 → TI, TM). Deux tentations écartées : la note 1 documente des dettes
 *    de DA et DB, et la note 15B est un détail de DA, mais le ch. 3 renvoie
 *    DA, DB et DC à la NOTE 16, jamais à la 1 ni à la 15B · aucun poste du
 *    bilan ne renvoie à ces deux notes, leur `renvoyeeDepuis` reste donc
 *    vide. De même la note 4 ne déclare que AQ, seul poste porteur du
 *    renvoi « 4 » ; AR et AS sont ses sous-postes, dont la cellule « Note »
 *    est vide au modèle, exactement comme AE à AH sous AD.
 */

// --------------------------------------------------------------------------
// Colonnes officielles, par famille de notes
// --------------------------------------------------------------------------

/** Notes 5, 6, 9, 10, 11 et 12 (second tableau) · anomalie n° 5, pas de variation en valeur. */
const COLONNES_N_N1_POURCENT = [
  { type: 'EXERCICE_N' as const, libelle: 'Année N' },
  { type: 'EXERCICE_N1' as const, libelle: 'Année N-1' },
  { type: 'VARIATION_POURCENT' as const, libelle: 'Variation en %' },
];

/** Notes 4, 7 et 8 · même triplet, plus la ventilation des créances par échéance. */
const COLONNES_CREANCES_ECHEANCES = [
  ...COLONNES_N_N1_POURCENT,
  { type: 'ECHEANCE_1AN' as const, libelle: 'Créances à un an au plus' },
  { type: 'ECHEANCE_2ANS' as const, libelle: "Créances à plus d'un an et à deux ans au plus" },
  { type: 'ECHEANCE_PLUS_2ANS' as const, libelle: 'Créances à plus de deux ans' },
];

/**
 * Rubrique que le plan de comptes SYSCOHADA ne permet pas de déterminer : le
 * dossier doit y rattacher ses propres sous-comptes (`RattachementNote`). Le
 * texte passé en troisième argument est montré tel quel à l'utilisateur.
 */
function enAttente(cle: string, libelle: string, attendu: string) {
  return { cle, libelle, subdivisionAttendue: attendu };
}

export const NOTES_SYSCOHADA_1: SpecificationNote[] = [
  // ======================================================================
  // NOTE 1 · deux tableaux
  // ======================================================================
  {
    code: '1',
    sousTableau: 'DETTES GARANTIES PAR DES SÛRETÉS RÉELLES',
    titre: 'DETTES GARANTIES PAR DES SÛRETÉS RÉELLES',
    // Les trois colonnes de sûretés sont en saisie : une hypothèque, un
    // nantissement ou un gage est un fait juridique attaché au contrat, que
    // le plan de comptes ne porte nulle part (Titre VII COMPTE 16 : « le
    // montant et la portée de la caution, de la garantie ou du gage doivent
    // être indiqués dans les Notes annexes »). Seul le « Montant brut » de
    // la dette se calcule ; la colonne « Note » renvoie à la note qui
    // détaille chaque ligne (`renvoi`).
    colonnes: [
      { type: 'LIBRE' as const, libelle: 'Note' },
      { type: 'EXERCICE_N' as const, libelle: 'Montant brut' },
      { type: 'LIBRE' as const, libelle: 'SÛRETÉS RÉELLES : Hypothèques' },
      { type: 'LIBRE' as const, libelle: 'SÛRETÉS RÉELLES : Nantissements' },
      { type: 'LIBRE' as const, libelle: 'SÛRETÉS RÉELLES : Gages/autres' },
    ],
    // Pas de `renvoyeeDepuis` : le ch. 3 renvoie DA, DB et DC à la NOTE 16,
    // aucun poste du bilan ne renvoie à la note 1 (anomalie n° 16).
    rubriques: [
      // Dettes financières et ressources assimilées · DA = « 16, 181, 182,
      // 183, 184 » (ch. 7). Titre VII COMPTE 16 : 1612 « convertibles en
      // actions », donc « autres emprunts obligataires » = 161 sauf 1612.
      { libelle: 'Emprunts obligataires convertibles', comptes: ['1612'], natureCreditrice: true, renvoi: '16A' },
      {
        libelle: 'Autres emprunts obligataires',
        comptes: ['161'],
        exclusions: ['1612'],
        natureCreditrice: true,
        renvoi: '16A',
      },
      {
        libelle: 'Emprunts et dettes des établissements de crédit',
        comptes: ['162'],
        natureCreditrice: true,
        renvoi: '16A',
      },
      // Tout le reste de DA : 163 à 168 et 181 à 184, intérêts courus (166)
      // COMPRIS · anomalie n° 15 : 1661 « sur emprunts obligataires » couvre
      // à la fois les convertibles (1612) et les autres, que la note sépare
      // en deux lignes ; le ventiler serait un rangement au jugé. La note
      // 16A leur donne une ligne propre, d'où le renvoi.
      {
        libelle: 'Autres dettes financières',
        comptes: ['16', '181', '182', '183', '184'],
        exclusions: ['161', '162'],
        natureCreditrice: true,
        renvoi: '16A',
      },
      { libelle: 'SOUS TOTAL (1)', totalDeRubriques: [0, 1, 2, 3] },
      // Dettes de location-acquisition · DB = « 17 ». Titre VII COMPTE 17 :
      // 172 crédit-bail immobilier, 173 mobilier, 174 location-vente, 176
      // intérêts courus ventilés par nature (1762, 1763, 1764, 1768), 178
      // autres. Ici les intérêts courus SUIVENT la dette qu'ils rémunèrent,
      // contrairement au bloc DA (anomalie n° 15) : la ventilation est 1:1
      // et sans jugement, et ce bloc n'a aucune ligne résiduelle où 176
      // pourrait tomber sans sortir de la note (SOUS TOTAL (2) doit recouper
      // DB = « 17 »).
      {
        libelle: 'Dettes de crédit-bail immobilier',
        comptes: ['172', '1762'],
        natureCreditrice: true,
        renvoi: '16A',
      },
      { libelle: 'Dettes de crédit-bail mobilier', comptes: ['173', '1763'], natureCreditrice: true, renvoi: '16A' },
      {
        libelle: 'Dettes sur contrats de location-vente',
        comptes: ['174', '1764'],
        natureCreditrice: true,
        renvoi: '16A',
      },
      {
        libelle: 'Dettes sur contrats de location-acquisition',
        comptes: ['178', '1768'],
        natureCreditrice: true,
        renvoi: '16A',
      },
      { libelle: 'SOUS TOTAL (2)', totalDeRubriques: [5, 6, 7, 8] },
      // Dettes du passif circulant : postes DJ, DI, DK, DM du ch. 7. Les
      // tiers polyvalents (42 à 47) sont filtrés au crédit, comme le ch. 7
      // le fait pour DK et DM (« soldes créditeurs »).
      { libelle: 'Fournisseurs et comptes rattachés', comptes: ['40'], exclusions: ['409'], natureCreditrice: true, renvoi: '17' },
      { libelle: 'Clients', comptes: ['419'], natureCreditrice: true, renvoi: '7' },
      { libelle: 'Personnel', comptes: ['42'], sens: 'CREDITEUR', renvoi: '18' },
      { libelle: 'Sécurité sociale et organismes sociaux', comptes: ['43'], sens: 'CREDITEUR', renvoi: '18' },
      { libelle: 'État', comptes: ['44'], sens: 'CREDITEUR', renvoi: '18' },
      { libelle: 'Organismes internationaux', comptes: ['45'], sens: 'CREDITEUR', renvoi: '19' },
      { libelle: 'Associés et groupe', comptes: ['46'], sens: 'CREDITEUR', renvoi: '19' },
      // DM = « 185, 45, 46, 47 (sauf 479) » créditeurs. La lettre du ch. 7
      // n'exclut que 479, mais 478 est exclu ICI AUSSI, exactement comme le
      // poste DM que cette note documente · voir l'anomalie n° 12 de
      // correspondance-bilan-syscohada.ts. Raison : 478 a un poste et un
      // seul, BU (« Écart de conversion-Actif », 478 sans réserve). Le
      // laisser capter une seconde fois ici ferait figurer le même solde à
      // deux endroits de la liasse, et la note annoncerait un montant que
      // son poste ne porte pas. Une note ne peut pas dépasser le poste
      // qu'elle documente : c'est ce que vérifie le recoupement note ↔
      // poste, et c'est lui qui a trouvé cet écart.
      // 185 créditeur n'a pas de ligne dans la note : anomalie n° 6.
      {
        libelle: 'Créditeurs divers',
        comptes: ['47', '185'],
        exclusions: ['478', '479'],
        sens: 'CREDITEUR',
        renvoi: '19',
      },
      { libelle: 'SOUS TOTAL (3)', totalDeRubriques: [10, 11, 12, 13, 14, 15, 16, 17] },
      { libelle: 'TOTAL (1) + (2) + (3)', totalDeRubriques: [4, 9, 18] },
    ],
    commentaire: "indiquer la raison d'être des sûretés.",
  },
  {
    code: '1',
    sousTableau: 'ENGAGEMENTS FINANCIERS',
    titre: 'ENGAGEMENTS FINANCIERS',
    // Un engagement hors bilan n'est porté par aucun compte de bilan. Le
    // plan SYSCOHADA a bien une classe 9 (901 à 908, engagements obtenus et
    // accordés), mais ses subdivisions ne recouvrent pas les lignes de la
    // note (aucun compte pour les engagements envers les entités liées, les
    // primes de remboursement, les créances cédées ; « hypothèques,
    // nantissements, gages » n'a que des hypothèques en 9023/9063) : les
    // rattacher au jugé ferait une note fausse. Tout le tableau est en
    // saisie.
    horsBalance: true,
    colonnes: [
      { type: 'LIBRE' as const, libelle: 'Engagements donnés' },
      { type: 'LIBRE' as const, libelle: 'Engagements reçus' },
    ],
    rubriques: [
      { libelle: 'Engagements consentis à des entités liées', saisie: true },
      { libelle: 'Primes de remboursement non échues', saisie: true },
      { libelle: 'Avals, cautions, garanties', saisie: true },
      { libelle: 'Hypothèques, nantissements, gages, autres', saisie: true },
      { libelle: 'Effets escomptés non échus', saisie: true },
      { libelle: 'Créances commerciales et professionnelles cédées', saisie: true },
      { libelle: 'Abandons de créances conditionnels', saisie: true },
      { libelle: 'TOTAL', saisie: true },
    ],
  },

  // ======================================================================
  // NOTE 2 · texte libre
  // ======================================================================
  {
    code: '2',
    titre: 'INFORMATIONS OBLIGATOIRES',
    horsBalance: true,
    colonnes: [{ type: 'LIBRE' as const, libelle: 'Informations' }],
    rubriques: [
      { libelle: 'A - DÉCLARATION DE CONFORMITÉ AU SYSCOHADA', saisie: true },
      { libelle: 'B - RÈGLES ET MÉTHODES COMPTABLES', saisie: true },
      { libelle: 'C - DÉROGATION AUX POSTULATS ET CONVENTIONS COMPTABLES', saisie: true },
      {
        libelle:
          'D - INFORMATIONS COMPLÉMENTAIRES RELATIVES AU BILAN, AU COMPTE DE RÉSULTAT ET AU TABLEAU DES FLUX DE ' +
          'TRÉSORERIE',
        saisie: true,
      },
    ],
    // Ch. 6 section 1 § 1.1, reproduit : c'est la note qui porte la
    // déclaration de conformité, elle n'est donc jamais « non applicable ».
    commentaire:
      'Les Notes annexes doivent comporter obligatoirement une déclaration explicite de conformité au Plan ' +
      'Comptable OHADA (PCGO). Les états financiers ne doivent être déclarés conformes au SYSCOHADA que s’ils ' +
      'sont conformes à toutes les dispositions relatives au Système comptable OHADA.',
  },

  // ======================================================================
  // NOTE 3 · immobilisations, six tableaux 3A à 3F
  // ======================================================================
  {
    code: '3A',
    titre: 'IMMOBILISATION BRUTE',
    // Sept colonnes officielles. B « Acquisitions, Apports, Créations » et C
    // « Cessions, Scissions, Hors service » portent le total des mouvements
    // débit et crédit ; les sous-colonnes de virements et de réévaluation
    // sont en saisie (anomalie n° 9). Le ch. 6 liste les colonnes de la 3A à
    // plat et écrit DEUX fois « Virements de poste à poste » ; la maquette,
    // elle, les range sous les en-têtes AUGMENTATIONS et DIMINUTIONS, comme
    // le ch. 6 l'écrit explicitement pour la 3B (« B — AUGMENTATIONS
    // (… · Virements de poste à poste …) », « C — DIMINUTIONS (… · Virements
    // de poste à poste) »), qui est le même tableau. Le préfixe reproduit
    // donc cet en-tête de niveau supérieur ; sans lui les deux colonnes
    // seraient indistinguables à l'écran et dans l'export.
    colonnes: [
      { type: 'OUVERTURE' as const, libelle: "MONTANT BRUT À L'OUVERTURE DE L'EXERCICE" },
      { type: 'AUGMENTATIONS' as const, libelle: 'Acquisitions, Apports, Créations' },
      { type: 'LIBRE' as const, libelle: 'AUGMENTATIONS : Virements de poste à poste' },
      { type: 'LIBRE' as const, libelle: "Suite à une réévaluation pratiquée au cours de l'exercice" },
      { type: 'DIMINUTIONS' as const, libelle: 'Cessions, Scissions, Hors service' },
      { type: 'LIBRE' as const, libelle: 'DIMINUTIONS : Virements de poste à poste' },
      { type: 'CLOTURE' as const, libelle: "MONTANT BRUT À LA CLÔTURE DE L'EXERCICE" },
    ],
    // Le bilan (ch. 3) renvoie AD, AI et AP à la note « 3 » sans lettre : la
    // 3A en est le tableau des valeurs brutes, la 3C celui des
    // amortissements.
    renvoyeeDepuis: ['AD', 'AI', 'AP'],
    // Le modèle groupe les rubriques sous quatre intitulés de section sans
    // en faire des lignes de sous-total (contrairement aux 3B, 3C et 3D qui
    // écrivent « SOUS TOTAL : »). Aucun sous-total n'est donc ajouté ici :
    // le groupement est une affaire de présentation, pas de calcul.
    rubriques: [
      // IMMOBILISATIONS INCORPORELLES · comptes bruts de AE à AH (ch. 7).
      { libelle: 'Frais de développement et de prospection', comptes: ['211', '2181', '2191'] },
      { libelle: 'Brevets, licences, logiciels et droits similaires', comptes: ['212', '213', '214', '2193'] },
      { libelle: 'Fonds commercial et droit au bail', comptes: ['215', '216'] },
      { libelle: 'Autres immobilisations incorporelles', comptes: ['217', '218', '2198'], exclusions: ['2181'] },
      // IMMOBILISATIONS CORPORELLES · AJ = 22, dont 2281 est le SEUL
      // divisionnaire « immeubles de placement » (Titre VII COMPTE 22) ;
      // AK = 231, 232, 233, 237, 2391, dont 2315 et 2325 sont les seuls
      // « immeubles de placement » (Titre VII COMPTE 23).
      { libelle: 'Terrains hors immeuble de placement', comptes: ['22'], exclusions: ['2281'] },
      { libelle: 'Terrains - immeuble de placement', comptes: ['2281'] },
      {
        libelle: 'Bâtiments hors immeuble de placement',
        comptes: ['231', '232', '233', '237', '2391'],
        exclusions: ['2315', '2325'],
      },
      { libelle: 'Bâtiments - immeuble de placement', comptes: ['2315', '2325'] },
      // AL = « 234, 235, 238, 2392, 2393 » ; 2394, 2395, 2398 ajoutés comme
      // au bilan (correspondance-bilan-syscohada.ts, anomalie n° 2) pour
      // que la note recoupe le poste.
      {
        libelle: 'Aménagements, agencements et installations',
        comptes: ['234', '235', '238', '2392', '2393', '2394', '2395', '2398'],
      },
      { libelle: 'Matériel, mobilier et actifs biologiques', comptes: ['24'], exclusions: ['245', '2495'] },
      { libelle: 'Matériel de transport', comptes: ['245', '2495'] },
      // AVANCES ET ACOMPTES VERSÉS SUR IMMOBILISATIONS · AP = 251, 252.
      { libelle: 'Avances et acomptes versés sur immobilisations incorporelles', comptes: ['251'] },
      { libelle: 'Avances et acomptes versés sur immobilisations corporelles', comptes: ['252'] },
      // IMMOBILISATIONS FINANCIÈRES · AR = 26, AS = 27.
      { libelle: 'Titres de participation', comptes: ['26'] },
      { libelle: 'Autres immobilisations financières', comptes: ['27'] },
      { libelle: 'TOTAL GÉNÉRAL', totalDeRubriques: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] },
    ],
    commentaire:
      'toute variation significative doit être commentée ; détailler les éléments constitutifs du fonds ' +
      "commercial et indiquer la date d'acquisition ; pour l'immobilisation incorporelle relative à la " +
      "concession, faire un descriptif de l'accord et indiquer la nature de la créance, la durée de la " +
      "concession, l'échéance ; indiquer les créances du groupe avec nature et date d'échéance ; pour les " +
      "banques, DAT, indiquer le nom de la banque, le montant et la date d'échéance.",
  },
  {
    code: '3B',
    titre: 'BIENS PRIS EN LOCATION ACQUISITION',
    // La première colonne qualifie le contrat (I, M, A), elle ne porte pas
    // de montant : en saisie. Les sous-colonnes de B et C qui ne se lisent
    // pas en balance sont en saisie (anomalie n° 9).
    colonnes: [
      { type: 'LIBRE' as const, libelle: 'NATURE DU CONTRAT (I ; M ; A)' },
      { type: 'OUVERTURE' as const, libelle: "A · MONTANT BRUT À L'OUVERTURE" },
      { type: 'AUGMENTATIONS' as const, libelle: 'B · AUGMENTATIONS : Acquisitions/Apports/Créations' },
      { type: 'LIBRE' as const, libelle: 'B · AUGMENTATIONS : Virements de poste à poste' },
      {
        type: 'LIBRE' as const,
        libelle: "B · AUGMENTATIONS : Suite à une réévaluation pratiquée au cours de l'exercice",
      },
      { type: 'DIMINUTIONS' as const, libelle: 'C · DIMINUTIONS : Cessions/Scissions/Hors service' },
      { type: 'LIBRE' as const, libelle: 'C · DIMINUTIONS : Virements de poste à poste' },
      { type: 'CLOTURE' as const, libelle: 'D = A + B - C · MONTANT BRUT À LA CLÔTURE' },
    ],
    // Les biens pris en location-acquisition sont les divisionnaires que le
    // Titre VII réserve à ce mode d'acquisition : 2286 (COMPTE 22), 2316 et
    // 2326 (COMPTE 23), 2416, 2426, 2446 et 2456 (COMPTE 24). Aucun en
    // classe 21, ni en 234/235/238, ni en 246 (actifs biologiques, exclus
    // par Titre VIII ch. 8 § 1.4).
    rubriques: [
      // Anomalie n° 3 : lignes incorporelles de la maquette, sans compte
      // possible ; en saisie et non en attente.
      { libelle: 'Brevets, licences, logiciels et droits similaires', saisie: true },
      { libelle: 'Fonds commercial et droit au bail', saisie: true },
      { libelle: 'Autres immobilisations incorporelles', saisie: true },
      { libelle: 'SOUS TOTAL : IMMOBILISATIONS INCORPORELLES', totalDeRubriques: [0, 1, 2] },
      { libelle: 'Terrains', comptes: ['2286'] },
      { libelle: 'Bâtiments', comptes: ['2316', '2326'] },
      enAttente(
        'amenagements-location-acquisition',
        'Aménagements, agencements et installations',
        'Le plan ne prévoit aucun divisionnaire « de location-acquisition » dans les comptes 234, 235 et 238 ' +
          '(Titre VII COMPTE 23 n’en ouvre qu’en 2316 et 2326) : subdiviser le compte concerné et rattacher ' +
          'ici le sous-compte des aménagements pris en location-acquisition.',
      ),
      { libelle: 'Matériel, mobilier et actifs biologiques', comptes: ['2416', '2426', '2446'] },
      { libelle: 'Matériel de transport', comptes: ['2456'] },
      { libelle: 'SOUS TOTAL : IMMOBILISATIONS CORPORELLES', totalDeRubriques: [4, 5, 6, 7, 8] },
      { libelle: 'TOTAL GÉNÉRAL', totalDeRubriques: [3, 9] },
    ],
    renvoiOfficiel:
      'I : Crédit-bail immobilier ; M : Crédit-bail mobilier ; A : Autres contrats (dédoubler le poste si ' +
      'montants significatifs).',
    commentaire: 'indiquer la nature du bien, le nom du bailleur et la durée du bail.',
  },
  {
    code: '3C',
    titre: 'IMMOBILISATIONS : AMORTISSEMENTS',
    // Anomalie n° 2 : en-tête de page « NOTE 3B », contenu 3C.
    // Un amortissement s'accroît au crédit : ses « dotations de l'exercice »
    // sont des mouvements créditeurs, les sorties d'actif des débits.
    sensAccroissement: 'CREDIT',
    colonnes: [
      { type: 'OUVERTURE' as const, libelle: "A · AMORTISSEMENTS CUMULÉS À L'OUVERTURE DE L'EXERCICE" },
      { type: 'AUGMENTATIONS' as const, libelle: "B · AUGMENTATIONS : DOTATIONS DE L'EXERCICE" },
      {
        type: 'DIMINUTIONS' as const,
        libelle: "C · DIMINUTIONS : amortissements relatifs aux éléments sortis de l'actif",
      },
      { type: 'CLOTURE' as const, libelle: "D = A + B - C · CUMUL DES AMORTISSEMENTS À LA CLÔTURE DE L'EXERCICE" },
    ],
    // Ch. 6 : « note appelée par RL et RN du compte de résultat, conjointement
    // avec la note 28 » ; et colonne « Amort. et déprec. » des postes AD, AI
    // et AP du bilan (renvoi « 3 »).
    renvoyeeDepuis: ['AD', 'AI', 'AP', 'RL', 'RN'],
    // Seuls les AMORTISSEMENTS (28x) sont ici : les dépréciations (29x) que
    // le ch. 7 met dans la même colonne du bilan relèvent de la note 28
    // « Provisions et dépréciations inscrites au bilan ». Les comptes « p »
    // du ch. 7 (2818p) sont pris en entier là où le bilan les a mis
    // (correspondance-bilan-syscohada.ts, anomalie n° 1 : 2818 → AH).
    rubriques: [
      { libelle: 'Frais de développement et de prospection', comptes: ['2811'] },
      { libelle: 'Brevets, licences, logiciels et droits similaires', comptes: ['2812', '2813', '2814'] },
      { libelle: 'Fonds commercial et droit au bail', comptes: ['2815', '2816'] },
      { libelle: 'Autres immobilisations incorporelles', comptes: ['2817', '2818'] },
      { libelle: 'SOUS TOTAL : IMMOBILISATIONS INCORPORELLES', totalDeRubriques: [0, 1, 2, 3] },
      // Anomalie n° 10 : pas d'amortissement dédié aux immeubles de
      // placement, et les lignes « hors placement » ci-dessous captent 282,
      // 2831 et 2832 en ENTIER. Un rattachement par dossier s'AJOUTANT aux
      // préfixes officiels, mettre les lignes « placement » en attente
      // ferait compter deux fois le sous-compte rattaché ; elles sont donc
      // en saisie, avec le motif porté sur la ligne.
      { libelle: 'Terrains hors immeuble de placement', comptes: ['282'] },
      {
        libelle: 'Terrains - immeuble de placement',
        saisie: true,
        renvoi:
          'Le compte 282 « Amortissements des terrains » n’est pas subdivisé par destination (seul 2824 ' +
          'existe) et la ligne « Terrains hors immeuble de placement » ci-dessus prend 282 en entier : ' +
          'montant à saisir, hors balance, sans quoi il serait compté deux fois.',
      },
      { libelle: 'Bâtiments hors immeuble de placement', comptes: ['2831', '2832', '2833', '2837'] },
      {
        libelle: 'Bâtiments - immeuble de placement',
        saisie: true,
        renvoi:
          'Les comptes 2831 et 2832 ne sont pas subdivisés (contrairement au brut, 2315 et 2325) et la ligne ' +
          '« Bâtiments hors immeuble de placement » ci-dessus les prend en entier : montant à saisir, hors ' +
          'balance, sans quoi il serait compté deux fois.',
      },
      { libelle: 'Aménagements, agencements et installations', comptes: ['2834', '2835', '2838'] },
      { libelle: 'Matériel, mobilier et actifs biologiques', comptes: ['284'], exclusions: ['2845'] },
      { libelle: 'Matériel de transport', comptes: ['2845'] },
      { libelle: 'SOUS TOTAL : IMMOBILISATIONS CORPORELLES', totalDeRubriques: [5, 6, 7, 8, 9, 10, 11] },
      { libelle: 'TOTAL GÉNÉRAL', totalDeRubriques: [4, 12] },
    ],
    commentaire:
      "indiquer les modes d'amortissement utilisés ; la durée de vie ou les taux d'amortissements utilisés.",
  },
  {
    code: '3D',
    titre: 'IMMOBILISATIONS : PLUS-VALUES ET MOINS VALUE DE CESSION',
    // Anomalie n° 13 : tableau entièrement en saisie.
    horsBalance: true,
    colonnes: [
      { type: 'LIBRE' as const, libelle: 'A · MONTANT BRUT' },
      { type: 'LIBRE' as const, libelle: 'B · AMORTISSEMENTS PRATIQUÉS' },
      { type: 'LIBRE' as const, libelle: 'C = A - B · VALEUR COMPTABLE NETTE' },
      { type: 'LIBRE' as const, libelle: 'D · PRIX DE CESSION' },
      { type: 'LIBRE' as const, libelle: 'E = D - C · PLUS-VALUE OU MOINS-VALUE' },
    ],
    renvoyeeDepuis: ['TN', 'RO'],
    rubriques: [
      { libelle: 'Frais de développement et de prospection', saisie: true },
      { libelle: 'Brevets, licences, logiciels et droits similaires', saisie: true },
      { libelle: 'Fonds commercial et droit au bail', saisie: true },
      { libelle: 'Autres immobilisations incorporelles', saisie: true },
      { libelle: 'SOUS TOTAL : IMMOBILISATIONS INCORPORELLES', saisie: true },
      { libelle: 'Terrains', saisie: true },
      { libelle: 'Bâtiments', saisie: true },
      { libelle: 'Aménagements, agencements et installations', saisie: true },
      { libelle: 'Matériel, mobilier et actifs biologiques', saisie: true },
      { libelle: 'Matériel de transport', saisie: true },
      { libelle: 'SOUS TOTAL : IMMOBILISATIONS CORPORELLES', saisie: true },
      { libelle: 'Titres de participations', saisie: true },
      { libelle: 'Autres immobilisations financières', saisie: true },
      { libelle: 'SOUS TOTAL : IMMOBILISATIONS FINANCIÈRES', saisie: true },
      { libelle: 'TOTAL GÉNÉRAL', saisie: true },
    ],
    commentaire: "mentionner la justification de la cession ainsi que la date d'acquisition et la date de sortie.",
  },
  {
    code: '3E',
    titre: "INFORMATIONS SUR LES RÉÉVALUATIONS EFFECTUÉES PAR L'ENTITÉ",
    // Ch. 3 : seul renvoi du bilan écrit en minuscule, « 3e », sur CE ; la
    // note 15A y renvoie aussi (ligne « Provision spéciale de réévaluation »).
    horsBalance: true,
    colonnes: [
      { type: 'LIBRE' as const, libelle: 'Éléments réévalués par postes du bilan' },
      { type: 'LIBRE' as const, libelle: 'Montants coûts historiques' },
      { type: 'LIBRE' as const, libelle: 'Amortissements supplémentaires' },
    ],
    renvoyeeDepuis: ['CE'],
    rubriques: [
      { libelle: 'Nature et date des réévaluations', saisie: true },
      { libelle: 'Éléments réévalués par postes du bilan', saisie: true },
      { libelle: 'Méthode de réévaluation utilisée', saisie: true },
      {
        libelle: "Traitement fiscal de l'écart de réévaluation et des amortissements supplémentaires",
        saisie: true,
      },
      { libelle: "Montant de l'écart incorporé au capital", saisie: true },
    ],
  },
  {
    code: '3F',
    titre: "TABLEAU D'ÉTALEMENT DES CHARGES IMMOBILISÉES",
    // Anomalie n° 1 (imprimée « 8A ») et n° 14 (datée 2018 à 2022). Titre
    // VIII ch. 41 § 2.1 : les charges immobilisées antérieures à la révision
    // sont virées au 4751 puis « reprises sur l'exercice ou étalées sur la
    // période restant à amortir, sans dépasser cinq (5) ans » par les
    // comptes de charges par nature ; les primes de remboursement des
    // obligations par le 6714. La note suit cet échéancier, que la balance
    // ne porte pas : en saisie.
    horsBalance: true,
    colonnes: [
      { type: 'LIBRE' as const, libelle: "Frais d'établissement" },
      { type: 'LIBRE' as const, libelle: 'Charges à répartir sur plusieurs exercices' },
      { type: 'LIBRE' as const, libelle: 'Primes de remboursement des obligations' },
    ],
    rubriques: [
      { libelle: 'Montant global à étaler au 1er janvier 2018', saisie: true },
      { libelle: "Durée d'étalement retenue", saisie: true },
      {
        libelle: 'Exercice 2018 · Comptes / Montants (comptes 60…, 61…, 62…, 63… ; compte 6714 pour les primes)',
        saisie: true,
      },
      { libelle: 'Total exercice 2018', saisie: true },
      { libelle: 'Total exercice 2019', saisie: true },
      { libelle: 'Total exercice 2020', saisie: true },
      { libelle: 'Total exercice 2021', saisie: true },
      { libelle: 'Total exercice 2022', saisie: true },
      { libelle: 'TOTAL GÉNÉRAL', saisie: true },
    ],
  },

  // ======================================================================
  // NOTE 4 · immobilisations financières, deux tableaux
  // ======================================================================
  {
    code: '4',
    sousTableau: 'IMMOBILISATIONS FINANCIÈRES',
    titre: 'IMMOBILISATIONS FINANCIÈRES',
    colonnes: COLONNES_CREANCES_ECHEANCES,
    // Ch. 3 : seul AQ porte le renvoi « 4 » ; AR et AS sont ses sous-postes,
    // cellule « Note » vide au modèle (anomalie n° 16).
    renvoyeeDepuis: ['AQ'],
    // AR = 26, AS = 27 (ch. 7). Titre VII COMPTE 27 : 271 prêts et créances,
    // 272 prêts au personnel, 273 créances sur l'État, 274 titres
    // immobilisés, 275 dépôts et cautionnements versés, 276 intérêts courus,
    // 277 créances rattachées à des participations, 278 immobilisations
    // financières diverses. 277 et 278 n'ont pas de ligne : anomalie n° 6.
    rubriques: [
      { libelle: 'Titres de participation', comptes: ['26'] },
      // Ligne résiduelle de la note : « 27 sauf les six lignes nommées »
      // plutôt que « 271, 277, 278 », pour qu'un divisionnaire créé par le
      // dossier (279…) reste dans la note comme il reste dans AS = « 27 »
      // (ch. 7, clés de lecture : un numéro à deux chiffres englobe tous ses
      // divisionnaires). Anomalie n° 6 pour le contre-emploi du 278.
      {
        libelle: 'Prêts et créances',
        comptes: ['27'],
        exclusions: ['272', '273', '274', '275', '276'],
        renvoi:
          'Comprend, faute de ligne au modèle officiel, le compte 277 « Créances rattachées à des ' +
          'participations et avances à des GIE » (Titre VII COMPTE 27 : ce sont « des prêts ou avances ' +
          'consentis à une société dans laquelle l’entité détient une participation ») et le compte 278 ' +
          '« Immobilisations financières diverses », dont 2784 « Banques dépôts à terme » et 2785 « Or et ' +
          'métaux précieux » ne sont ni des prêts ni des créances.',
      },
      { libelle: 'Prêt au personnel', comptes: ['272'] },
      { libelle: "Créances sur l'état", comptes: ['273'] },
      { libelle: 'Titres immobilisés', comptes: ['274'] },
      { libelle: 'Dépôts et cautionnements', comptes: ['275'] },
      { libelle: 'Intérêts courus', comptes: ['276'] },
      { libelle: 'TOTAL BRUT', totalDeRubriques: [0, 1, 2, 3, 4, 5, 6] },
      { libelle: 'Dépréciations titres de participation', comptes: ['296'], presenterEnNegatif: true },
      { libelle: 'Dépréciations autres immobilisations', comptes: ['297'], presenterEnNegatif: true },
      { libelle: 'TOTAL NET DE DÉPRÉCIATION', totalDeRubriques: [7, 8, 9] },
    ],
    commentaire:
      'justifier toute variation significative ; commenter toutes les créances anciennes ; pour les créances ' +
      "relatives à la concession, faire un descriptif de l'accord et indiquer la nature de la créance, la " +
      "durée de la concession, l'échéance ; indiquer le nombre et la date d'acquisition des actions ou parts " +
      'propres ; dépréciation : indiquer les événements et les circonstances qui ont motivé la dépréciation ' +
      'ou la reprise.',
  },
  {
    code: '4',
    sousTableau: 'LISTE DES FILIALES ET PARTICIPATIONS',
    titre: 'LISTE DES FILIALES ET PARTICIPATIONS',
    // Capitaux propres et résultat des filiales, pourcentage détenu : rien
    // de cela n'est dans la balance de l'entité. En saisie.
    horsBalance: true,
    colonnes: [
      { type: 'LIBRE' as const, libelle: 'Dénomination sociale' },
      { type: 'LIBRE' as const, libelle: 'Localisation (ville / pays)' },
      { type: 'LIBRE' as const, libelle: "Valeur d'acquisition" },
      { type: 'LIBRE' as const, libelle: '% Détenu' },
      { type: 'LIBRE' as const, libelle: 'Montant des capitaux propres filiale' },
      { type: 'LIBRE' as const, libelle: 'Résultat dernier exercice filiale' },
    ],
    rubriques: [{ libelle: 'Filiales et participations (une ligne par entité)', saisie: true }],
  },

  // ======================================================================
  // NOTE 5 · HAO, actif et passif
  // ======================================================================
  {
    code: '5',
    sousTableau: 'ACTIF CIRCULANT HAO',
    titre: 'ACTIF CIRCULANT HAO',
    colonnes: COLONNES_N_N1_POURCENT,
    renvoyeeDepuis: ['BA'],
    // BA = « 485, 488 » brut, « 498 » dépréciations (ch. 7).
    rubriques: [
      { libelle: "Créances sur cessions d'immobilisations", comptes: ['485'] },
      { libelle: 'Autres créances hors activités ordinaires', comptes: ['488'] },
      { libelle: 'TOTAL BRUT', totalDeRubriques: [0, 1] },
      { libelle: 'Dépréciations des créances HAO', comptes: ['498'], presenterEnNegatif: true },
      { libelle: 'TOTAL NET DE DÉPRÉCIATION', totalDeRubriques: [2, 3] },
    ],
    commentaire:
      'commenter toute variation significative ; dépréciation : indiquer les événements et circonstances qui ' +
      'ont motivé la dépréciation ou la reprise.',
  },
  {
    code: '5',
    sousTableau: 'DETTES CIRCULANTES HAO',
    titre: 'DETTES CIRCULANTES HAO',
    colonnes: COLONNES_N_N1_POURCENT,
    // Ch. 6 : « la note 5 est bicéphale : elle sert à la fois BA et DH ».
    renvoyeeDepuis: ['DH'],
    // DH = « 481, 482, 484, 4998 » (ch. 7). Titre VII COMPTE 48 : 4813
    // « versements restant à effectuer sur titres de participation et titres
    // immobilisés non libérés » est une subdivision de 481, isolée ici parce
    // que la note lui donne sa ligne. 4998 : anomalie n° 6.
    rubriques: [
      { libelle: "Fournisseurs d'investissements", comptes: ['481'], exclusions: ['4813'], natureCreditrice: true },
      { libelle: "Fournisseurs d'investissements effets à payer", comptes: ['482'], natureCreditrice: true },
      {
        libelle: 'Versements restant à effectuer sur titres de participation et titres immobilisés non libérés',
        comptes: ['4813'],
        natureCreditrice: true,
      },
      { libelle: 'Autres dettes hors activités ordinaires', comptes: ['484', '4998'], natureCreditrice: true },
      { libelle: 'TOTAL', totalDeRubriques: [0, 1, 2, 3] },
    ],
    commentaire:
      "indiquer la date de cession et la nature de l'immobilisation achetée et/ou cédée ; expliciter toute " +
      'variation significative.',
  },

  // ======================================================================
  // NOTE 6 · stocks
  // ======================================================================
  {
    code: '6',
    titre: 'STOCKS ET ENCOURS',
    colonnes: COLONNES_N_N1_POURCENT,
    // Ch. 6 : appelée par BB du bilan et par RB, TE, RD, RF du compte de
    // résultat (variations de stocks).
    renvoyeeDepuis: ['BB', 'RB', 'TE', 'RD', 'RF'],
    // BB = « 31 à 38 » brut, « 39 » dépréciations ; les huit lignes de la
    // note sont exactement les huit comptes principaux de la classe 3.
    rubriques: [
      { libelle: 'Marchandises', comptes: ['31'] },
      { libelle: 'Matières premières et fournitures liées', comptes: ['32'] },
      { libelle: 'Autres approvisionnements', comptes: ['33'] },
      { libelle: 'Produits en cours', comptes: ['34'] },
      { libelle: 'Services en cours', comptes: ['35'] },
      { libelle: 'Produits finis', comptes: ['36'] },
      { libelle: 'Produits intermédiaires', comptes: ['37'] },
      { libelle: 'Stocks en cours de route, en consignation ou en dépôt', comptes: ['38'] },
      { libelle: 'TOTAL BRUT STOCKS ET EN COURS', totalDeRubriques: [0, 1, 2, 3, 4, 5, 6, 7] },
      { libelle: 'Dépréciations des stocks', comptes: ['39'], presenterEnNegatif: true },
      { libelle: 'TOTAL NET DE DÉPRÉCIATION', totalDeRubriques: [8, 9] },
    ],
    renvoiOfficiel:
      "(1) Les stocks HAO seront inscrits dans l'actif circulant HAO que lorsque leur montant total est " +
      "significatif (supérieur à 5 % du total de l'actif circulant).",
    commentaire:
      "indiquer la date de prise d'inventaire et décrire brièvement la procédure et les méthodes comptables " +
      'adoptées pour évaluer le stock ; commenter toute variation significative des stocks ; indiquer le détail ' +
      'des stocks dépréciés et les événements et circonstances qui ont conduit à la dépréciation et à la reprise.',
  },

  // ======================================================================
  // NOTE 7 · clients, débiteurs puis créditeurs
  // ======================================================================
  {
    code: '7',
    // Anomalie n° 4 : maquette « CLIENTS », liste officielle retenue.
    titre: 'CLIENTS PRODUITS À RECEVOIR',
    colonnes: COLONNES_CREANCES_ECHEANCES,
    // Ch. 6 : « la note 7 sert BI (Clients, actif) et DI (Clients, avances
    // reçues, passif) ».
    renvoyeeDepuis: ['BI', 'DI'],
    // BI = « 41 sauf 419 » brut, « 491 » dépréciations ; DI = « 419 ».
    // Titre VII COMPTE 41 : 4112 et 4122 sont les comptes « Groupe », 4116
    // le compte « réserve de propriété » ; 413 (impayés) n'a pas de ligne
    // (anomalie n° 6). L'ordre est celui du texte, actif puis passif dans
    // le même tableau, comme la maquette.
    rubriques: [
      {
        libelle: 'Clients (hors réserves de propriété Groupe)',
        comptes: ['411', '413'],
        exclusions: ['4112', '4116'],
      },
      { libelle: 'Clients effets à recevoir (hors réserves de propriété groupe)', comptes: ['412'], exclusions: ['4122'] },
      { libelle: 'Clients et effets à recevoir avec réserves de propriété', comptes: ['4116'] },
      { libelle: 'Clients et effets à recevoir Groupe', comptes: ['4112', '4122'] },
      { libelle: "Créances sur cession d'immobilisations", comptes: ['414'] },
      { libelle: 'Clients effets escomptés et non échus', comptes: ['415'] },
      { libelle: 'Créances litigieuses ou douteuses', comptes: ['416'] },
      { libelle: 'Clients produits à recevoir', comptes: ['418'] },
      { libelle: 'TOTAL BRUT CLIENTS', totalDeRubriques: [0, 1, 2, 3, 4, 5, 6, 7] },
      { libelle: 'Dépréciations des comptes clients', comptes: ['491'], presenterEnNegatif: true },
      { libelle: 'TOTAL NET DE DÉPRÉCIATION', totalDeRubriques: [8, 9] },
      // Clients créditeurs · 419 (Titre VII COMPTE 41 : 4191 avances et
      // acomptes reçus, 4192 Groupe, 4194 emballages consignés, 4198 RRR à
      // accorder). Le ch. 7 ne qualifie pas 419 par le sens : présenté au
      // crédit sans filtre, un 419 débiteur ressort en négatif.
      { libelle: 'Clients, avances reçues hors groupe', comptes: ['4191'], natureCreditrice: true },
      { libelle: 'Clients, avances reçues groupe', comptes: ['4192'], natureCreditrice: true },
      { libelle: 'Autres clients créditeurs', comptes: ['419'], exclusions: ['4191', '4192'], natureCreditrice: true },
      { libelle: 'TOTAL CLIENTS CRÉDITEURS', totalDeRubriques: [11, 12, 13] },
    ],
    commentaire:
      'commenter toutes variations significatives ; indiquer pour les créances du groupe le nom de la société ' +
      'du groupe et le % de titres détenues ; commenter les créances anciennes ; indiquer les événements et ' +
      'circonstances qui ont conduit à la dépréciation et à la reprise.',
  },

  // ======================================================================
  // NOTE 8 · autres créances
  // ======================================================================
  {
    code: '8',
    titre: 'AUTRES CRÉANCES',
    colonnes: COLONNES_CREANCES_ECHEANCES,
    renvoyeeDepuis: ['BJ'],
    // BJ = « soldes débiteurs : 185, 42, 43, 44, 45, 46, 47 (sauf 478) »,
    // dépréciations « 492 à 497 » (ch. 7). Tous les tiers sont filtrés au
    // débit, ligne de balance par ligne de balance. Seul 478 (écart de
    // conversion-actif, BU, note 12) est exclu, à la lettre du ch. 7 : un
    // 479 débiteur (anomalie du dossier) ressort ici comme en BJ.
    rubriques: [
      { libelle: 'Personnel', comptes: ['42'], sens: 'DEBITEUR' },
      { libelle: 'Organismes sociaux', comptes: ['43'], sens: 'DEBITEUR' },
      { libelle: 'État et Collectivités publiques', comptes: ['44'], sens: 'DEBITEUR' },
      { libelle: 'Organismes internationaux', comptes: ['45'], sens: 'DEBITEUR' },
      { libelle: 'Apporteurs, associés et groupe', comptes: ['46'], sens: 'DEBITEUR' },
      // Titre VIII ch. 41 : 4751 compte actif, 4752 compte passif. Ch. 6 :
      // « c'est ici que se déclare le compte 475… côté débiteur. Son miroir
      // créditeur est en NOTE 19 ». Le filtre au débit fait la part.
      {
        libelle: 'Compte transitoire ajustement spécial lié à la révision du SYSCOHADA',
        comptes: ['475'],
        sens: 'DEBITEUR',
      },
      // Symétrique du « Créditeurs divers » de la note 19 : BJ = « 185, 42,
      // 43, 44, 45, 46, 47 (sauf 478) » à la lettre, mais 479 est exclu ici
      // aussi, comme au poste BJ (anomalie n° 12 de
      // correspondance-bilan-syscohada.ts) · 479 a un poste et un seul, DV.
      // 475 est retiré parce qu'il a sa propre ligne juste au-dessus.
      { libelle: 'Autres débiteurs divers', comptes: ['47'], exclusions: ['475', '478', '479'], sens: 'DEBITEUR' },
      { libelle: 'Comptes permanents non bloqués des établissements et des succursales', comptes: ['185'], sens: 'DEBITEUR' },
      // 186, 187, 188 : lignes données par la note, aucun poste au ch. 7
      // (anomalie n° 6 ; bilan, anomalie n° 5).
      { libelle: 'Comptes de liaison charges et produits', comptes: ['186', '187'], sens: 'DEBITEUR' },
      { libelle: 'Comptes de liaison des sociétés en participation', comptes: ['188'], sens: 'DEBITEUR' },
      { libelle: 'TOTAL BRUT AUTRES CRÉANCES', totalDeRubriques: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
      {
        libelle: 'Dépréciations des autres créances',
        comptes: ['492', '493', '494', '495', '496', '497'],
        presenterEnNegatif: true,
      },
      { libelle: 'TOTAL NET DE DÉPRÉCIATION', totalDeRubriques: [10, 11] },
    ],
    commentaire:
      'justifier toute variation significative ; détailler les créances dont le montant est significatif ; ' +
      'justifier les créances anciennes ; indiquer les événements et circonstances qui ont conduit à la ' +
      "dépréciation et à la reprise ; compte transitoire ajustement spécial : indiquer le détail du compte et " +
      "la durée restant pour l'apurement.",
  },

  // ======================================================================
  // NOTES 9, 10, 11 · trésorerie-actif
  // ======================================================================
  {
    code: '9',
    titre: 'TITRES DE PLACEMENT',
    colonnes: COLONNES_N_N1_POURCENT,
    renvoyeeDepuis: ['BQ'],
    // BQ = « 50 » brut, « 590 » dépréciations ; les sept lignes sont les
    // sept comptes principaux du 50.
    rubriques: [
      { libelle: 'Titres de trésor et bons de caisse à court terme', comptes: ['501'] },
      { libelle: 'Actions', comptes: ['502'] },
      { libelle: 'Obligations', comptes: ['503'] },
      { libelle: 'Bons de souscription', comptes: ['504'] },
      { libelle: 'Titres négociables hors régions', comptes: ['505'] },
      { libelle: 'Intérêts courus', comptes: ['506'] },
      // Ligne résiduelle : « 50 sauf les six lignes nommées », pour qu'un
      // divisionnaire créé par le dossier reste dans la note comme il reste
      // dans BQ = « 50 » (ch. 7, clés de lecture).
      { libelle: 'Autres valeurs assimilés', comptes: ['50'], exclusions: ['501', '502', '503', '504', '505', '506'] },
      { libelle: 'TOTAL BRUT TITRES', totalDeRubriques: [0, 1, 2, 3, 4, 5, 6] },
      { libelle: 'Dépréciations des titres', comptes: ['590'], presenterEnNegatif: true },
      { libelle: 'TOTAL NET DE DÉPRÉCIATION', totalDeRubriques: [7, 8] },
    ],
    commentaire:
      'justifier toute variation significative ; pour les titres cotés à une bourse de valeur, indiquer le ' +
      "nombre, le prix unitaire d'acquisition et le cours de la bourse au 31 décembre ; faire ressortir les " +
      "actions ou parts propres et indiquer la date d'acquisition et le nombre de titres détenus ; indiquer " +
      'les événements et circonstances qui ont conduit à la dépréciation et à la reprise.',
  },
  {
    code: '10',
    titre: 'VALEURS À ENCAISSER',
    colonnes: COLONNES_N_N1_POURCENT,
    renvoyeeDepuis: ['BR'],
    // BR = « 51 » brut, « 591 » dépréciations ; six lignes, six comptes.
    rubriques: [
      { libelle: 'Effets à encaisser', comptes: ['511'] },
      { libelle: "Effets à l'encaissement", comptes: ['512'] },
      { libelle: 'Chèques à encaisser', comptes: ['513'] },
      { libelle: "Chèques à l'encaissement", comptes: ['514'] },
      { libelle: 'Cartes de crédit à encaisser', comptes: ['515'] },
      // Ligne résiduelle : « 51 sauf les cinq lignes nommées » (même motif
      // qu'à la note 9), BR = « 51 ».
      { libelle: 'Autres valeurs à encaisser', comptes: ['51'], exclusions: ['511', '512', '513', '514', '515'] },
      { libelle: 'TOTAL BRUT VALEURS À ENCAISSER', totalDeRubriques: [0, 1, 2, 3, 4, 5] },
      { libelle: 'Dépréciations des valeurs à encaisser', comptes: ['591'], presenterEnNegatif: true },
      { libelle: 'TOTAL NET DE DÉPRÉCIATION', totalDeRubriques: [6, 7] },
    ],
    commentaire:
      'commenter toute variation significative ; indiquer les événements et circonstances qui ont conduit à la ' +
      'dépréciation et à la reprise.',
  },
  {
    code: '11',
    // Anomalie n° 4 : maquette « BANQUES, CHÈQUES POSTAUX ET CHÈQUES ».
    titre: 'DISPONIBILITÉS',
    colonnes: COLONNES_N_N1_POURCENT,
    renvoyeeDepuis: ['BS'],
    // BS = « soldes débiteurs : 52, 53, 54, 55, 57, 581, 582 »,
    // dépréciations « 592, 593, 594 » (ch. 7). Le filtre `DEBITEUR` n'est
    // posé QUE sur 52 et 53, que le ch. 7 transfère en DR quand ils sont
    // créditeurs (même règle que `comptesTransferesSiCrediteur` au bilan) ;
    // 54, 55, 57, 581, 582 créditeurs n'ont aucun poste d'accueil et
    // ressortent ici en négatif, visibles (bilan, anomalie n° 3). 526 et
    // 536 sont filtrés comme les autres 52x/53x : le NB de bas de tableau
    // les fait suivre le sens de leur compte PRINCIPAL, que la balance ne
    // porte pas, et le ch. 7 ne prévoit aucune exception pour eux
    // (anomalie n° 7). 585 et 588 : aucune ligne, comptes de passage à
    // solder (Titre VII COMPTE 58).
    rubriques: [
      { libelle: 'Banques locales', comptes: ['521'], sens: 'DEBITEUR' },
      { libelle: 'Banques autres états région', comptes: ['522'], sens: 'DEBITEUR' },
      { libelle: 'Banques, dépôt à terme', comptes: ['525'], sens: 'DEBITEUR' },
      // 523 (autres États zone monétaire) et 524 (hors zone monétaire) : la
      // note ne leur donne pas de ligne propre et les regroupe. Écrit en
      // « 52 sauf les lignes nommées » pour qu'un divisionnaire créé par le
      // dossier reste dans la note comme il reste dans BS = « 52 ».
      { libelle: 'Autres banques', comptes: ['52'], exclusions: ['521', '522', '525', '526'], sens: 'DEBITEUR' },
      { libelle: 'Banques intérêts courus', comptes: ['526'], sens: 'DEBITEUR' },
      { libelle: 'Chèques postaux', comptes: ['531'], sens: 'DEBITEUR' },
      // Titre VII COMPTE 53 : 532 Trésor, 533 SGI, 538 autres organismes ·
      // même forme résiduelle, BS = « 53 ».
      { libelle: 'Autres établissement financiers', comptes: ['53'], exclusions: ['531', '536'], sens: 'DEBITEUR' },
      { libelle: 'Établissement financiers intérêts courus', comptes: ['536'], sens: 'DEBITEUR' },
      { libelle: 'Instruments de trésorerie', comptes: ['54'] },
      { libelle: 'Caisse', comptes: ['57'] },
      // Titre VII COMPTE 55 « Instruments de monnaie électronique » (carte
      // carburant, téléphone portable, porte-monnaie électronique…) : c'est
      // la « caisse électronique mobile » de la note, dont le commentaire
      // parle d'ailleurs des « instruments de monnaie électronique ».
      { libelle: 'Caisse électronique mobile', comptes: ['55'] },
      { libelle: "Régies d'avances et virements accréditifs", comptes: ['581', '582'] },
      { libelle: 'TOTAL BRUT DISPONIBILITÉS', totalDeRubriques: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
      { libelle: 'Dépréciations', comptes: ['592', '593', '594'], presenterEnNegatif: true },
      { libelle: 'TOTAL NET DE DÉPRÉCIATIONS', totalDeRubriques: [12, 13] },
    ],
    renvoiOfficiel:
      'NB : Banques intérêts courus et Établissement financiers intérêts courus figurent dans cette rubrique en ' +
      'négatif si le compte principal attaché est débiteur.',
    commentaire:
      "indiquer la date de rapprochement des comptes bancaires ; indiquer la date d'inventaire de la caisse et " +
      'des instruments de monnaie électronique ; justifier toute variation significative ; détailler les ' +
      'instruments de monnaie électronique si le montant est significatif ; indiquer les événements et ' +
      'circonstances qui ont conduit à la dépréciation et à la reprise.',
  },

  // ======================================================================
  // NOTE 12 · écarts de conversion, puis transferts de charges
  // ======================================================================
  {
    code: '12',
    sousTableau: 'ÉCARTS DE CONVERSION',
    titre: 'ÉCARTS DE CONVERSION',
    // Devise, montant en devises et cours ne sont pas en balance : en
    // saisie. Le seul montant calculable est l'écart lui-même (BU = 478,
    // DV = 479), qui EST la « variation en valeur absolue » entre le cours
    // d'entrée et le cours de clôture (Titre VII COMPTE 47 : « pertes et
    // gains latents »). UML = unité monétaire légale.
    colonnes: [
      { type: 'LIBRE' as const, libelle: 'Devises' },
      { type: 'LIBRE' as const, libelle: 'Montant en devises' },
      { type: 'LIBRE' as const, libelle: 'Cours UML Année acquisition' },
      { type: 'LIBRE' as const, libelle: 'Cours UML 31/12' },
      { type: 'EXERCICE_N' as const, libelle: 'Variation en valeur absolue' },
    ],
    renvoyeeDepuis: ['BU', 'DV'],
    rubriques: [
      { libelle: 'Écarts de conversion actif', comptes: ['478'], renvoi: 'détailler les créances et dettes concernées' },
      {
        libelle: 'Écart de conversion passif',
        comptes: ['479'],
        natureCreditrice: true,
        renvoi: 'détailler les créances et dettes concernées',
      },
    ],
    commentaire: 'faire un commentaire.',
  },
  {
    code: '12',
    sousTableau: 'TRANSFERTS DE CHARGES',
    titre: 'TRANSFERTS DE CHARGES',
    // Anomalie n° 12. TI = « 781 », TM = « 787 » (ch. 7, compte de
    // résultat) : produits, présentés au crédit.
    colonnes: COLONNES_N_N1_POURCENT,
    renvoyeeDepuis: ['TI', 'TM'],
    rubriques: [
      {
        libelle: "Transferts de charges d'exploitation",
        comptes: ['781'],
        natureCreditrice: true,
        renvoi: 'détailler la nature des charges transférées',
      },
      {
        libelle: 'Transferts de charges financières',
        comptes: ['787'],
        natureCreditrice: true,
        renvoi: 'détailler la nature des charges transférées',
      },
    ],
    commentaire: 'faire un commentaire.',
  },

  // ======================================================================
  // NOTES 13, 14, 15A, 15B · capitaux propres
  // ======================================================================
  {
    code: '13',
    titre: 'CAPITAL : VALEUR NOMINALE DES ACTIONS OU PARTS',
    // Anomalie n° 11.
    colonnes: [
      { type: 'LIBRE' as const, libelle: 'Nom et prénoms' },
      { type: 'LIBRE' as const, libelle: 'Nationalité' },
      { type: 'LIBRE' as const, libelle: 'Nature des actions ou parts (Ordinaires ou préférences)' },
      { type: 'LIBRE' as const, libelle: 'Nombre' },
      { type: 'EXERCICE_N' as const, libelle: 'Montant total' },
      { type: 'LIBRE' as const, libelle: "Cessions ou remboursements en cours d'exercice" },
    ],
    renvoyeeDepuis: ['CA', 'CB'],
    rubriques: [
      { libelle: 'Apporteurs (une ligne par apporteur : nom et prénoms, nationalité, nature, nombre)', saisie: true },
      // CB = « 109 », débiteur, présenté en moins comme au bilan. Lu au
      // CRÉDIT (`natureCreditrice`), exactement comme le bilan lit CB au
      // passif : le solde débiteur du 109 ressort alors en négatif, ce que
      // le modèle écrit « (-) ». `presenterEnNegatif` donnerait ici l'inverse
      // (anomalie n° 11 et « Convention de signe » en tête de fichier).
      { libelle: 'Apporteurs, capital non appelé', comptes: ['109'], natureCreditrice: true },
      // CA = « 101 à 104 » (ch. 7) : contre-valeur comptable du détail par
      // apporteur. TOTAL + ligne précédente = capital appelé.
      {
        libelle: 'TOTAL',
        comptes: ['101', '102', '103', '104'],
        natureCreditrice: true,
        renvoi:
          'Le modèle officiel ne dit pas ce que totalise cette ligne, et le détail par apporteur qui la ' +
          'précède n’est pas comptable : elle porte ici le capital du bilan (poste CA, « 101 à 104 »), lu en ' +
          'balance, et n’est donc pas la somme arithmétique des lignes affichées.',
      },
    ],
    commentaire:
      'indiquer si possible le montant du capital à la constitution ; indiquer si possible les dates des AGE ' +
      "et le montant du capital augmenté en cas d'augmentation de capital ; indiquer si possible les dates des " +
      'AGE et le montant du capital diminué en cas de réduction de capital ; indiquer les avantages accordés ' +
      'aux actions de préférence ; apporteurs, capital non appelé : indiquer le délai restant pour appeler ' +
      'le capital.',
  },
  {
    code: '14',
    titre: 'PRIMES ET RÉSERVES',
    // Anomalie n° 5 : seule « Variation en valeur absolue », pas de %. Le
    // libellé est celui du texte ; le TYPE est `VARIATION_VALEUR` (N − N-1),
    // parce que « valeur absolue » s'y oppose à « en % » et désigne la
    // variation en MONTANT · une réserve qui baisse doit ressortir négative.
    colonnes: [
      { type: 'EXERCICE_N' as const, libelle: 'Année N' },
      { type: 'EXERCICE_N1' as const, libelle: 'Année N-1' },
      { type: 'VARIATION_VALEUR' as const, libelle: 'Variation en valeur absolue' },
    ],
    renvoyeeDepuis: ['CD', 'CF', 'CG', 'CH'],
    // CD = 105, CF = 111, 112, 113, CG = 118, CH = 12 (ch. 7). Les lignes
    // sont les subdivisions du plan, au même niveau : 1051 à 1058, 111,
    // 112, 1131 à 1138, 118, 12. Capitaux propres : présentés au crédit ;
    // le report à nouveau débiteur (129) ressort en négatif, comme CH
    // « (+ ou -) ».
    rubriques: [
      { libelle: "Prime d'apport", comptes: ['1052'], natureCreditrice: true },
      { libelle: "Primes d'émission", comptes: ['1051'], natureCreditrice: true },
      { libelle: 'Prime de fusion', comptes: ['1053'], natureCreditrice: true },
      { libelle: 'Prime de conversion', comptes: ['1054'], natureCreditrice: true },
      // Ligne résiduelle : « 105 sauf les quatre primes nommées », pour
      // qu'un divisionnaire créé par le dossier reste dans la note comme il
      // reste dans CD = « 105 » (ch. 7, clés de lecture).
      {
        libelle: 'Autres primes',
        comptes: ['105'],
        exclusions: ['1051', '1052', '1053', '1054'],
        natureCreditrice: true,
      },
      { libelle: 'TOTAL PRIMES', totalDeRubriques: [0, 1, 2, 3, 4] },
      { libelle: 'Réserves légales', comptes: ['111'], natureCreditrice: true },
      { libelle: 'Réserves statutaires', comptes: ['112'], natureCreditrice: true },
      { libelle: 'Réserves de plus-values nettes à long terme', comptes: ['1131'], natureCreditrice: true },
      {
        libelle: "Réserves d'attribution gratuite d'actions au personnel salarié et aux dirigeants",
        comptes: ['1132'],
        natureCreditrice: true,
      },
      // 1133, 1134, 1138.
      { libelle: 'Autres réserves réglementées', comptes: ['113'], exclusions: ['1131', '1132'], natureCreditrice: true },
      { libelle: 'TOTAL RÉSERVES INDISPONIBLES', totalDeRubriques: [6, 7, 8, 9, 10] },
      { libelle: 'Réserves libres', comptes: ['118'], natureCreditrice: true },
      { libelle: 'Report à nouveau', comptes: ['12'], natureCreditrice: true },
    ],
    commentaire:
      "indiquer les dates de l'AGE qui a décidé des primes d'apport, d'émission, de fusion ; indiquer le " +
      'détail des réserves libres ; indiquer le montant restant à doter et le taux de dotation de la réserve ' +
      "légale ; indiquer la date de l'AGO qui justifie la variation des réserves et du report à nouveau.",
  },
  {
    code: '15A',
    // Anomalie n° 4 : maquette « TOTAL SUBVENTIONS ET PROVISIONS RÉGLEMENTÉES ».
    titre: 'SUBVENTIONS ET PROVISIONS RÉGLEMENTÉES',
    colonnes: [
      { type: 'LIBRE' as const, libelle: 'NOTE' },
      { type: 'EXERCICE_N' as const, libelle: 'Année N' },
      { type: 'EXERCICE_N1' as const, libelle: 'Année N-1' },
      // « Variation en valeur absolue » COEXISTE ici avec « Variation en % » :
      // c'est la variation en montant, d'où `VARIATION_VALEUR` (anomalie n° 5).
      { type: 'VARIATION_VALEUR' as const, libelle: 'Variation en valeur absolue' },
      { type: 'VARIATION_POURCENT' as const, libelle: 'Variation en %' },
      { type: 'LIBRE' as const, libelle: 'Régime fiscal' },
      { type: 'LIBRE' as const, libelle: 'Échéances' },
    ],
    renvoyeeDepuis: ['CL', 'CM'],
    // CL = 14, CM = 15 (ch. 7). Titre VII COMPTE 14 : 1411 à 1418 par
    // pourvoyeur, 148 autres ; COMPTE 15 : 151 à 158. Les huit lignes de
    // subventions sont les huit subdivisions du 141 ; 148 et 153 :
    // anomalie n° 6.
    rubriques: [
      { libelle: 'État', comptes: ['1411'], natureCreditrice: true },
      { libelle: 'Régions', comptes: ['1412'], natureCreditrice: true },
      { libelle: 'Départements', comptes: ['1413'], natureCreditrice: true },
      { libelle: 'Communes et collectivités publiques décentralisées', comptes: ['1414'], natureCreditrice: true },
      { libelle: 'Entités publiques ou mixtes', comptes: ['1415'], natureCreditrice: true },
      { libelle: 'Entités et organismes privés', comptes: ['1416'], natureCreditrice: true },
      { libelle: 'Organismes internationaux', comptes: ['1417'], natureCreditrice: true },
      // Ligne résiduelle des subventions : « 14 sauf les sept pourvoyeurs
      // nommés », donc 1418 ET 148 (anomalie n° 6) et tout divisionnaire que
      // le dossier créerait, comme CL = « 14 » les prend (ch. 7).
      {
        libelle: 'Autres',
        comptes: ['14'],
        exclusions: ['1411', '1412', '1413', '1414', '1415', '1416', '1417'],
        natureCreditrice: true,
      },
      { libelle: 'TOTAL SUBVENTIONS', totalDeRubriques: [0, 1, 2, 3, 4, 5, 6, 7] },
      { libelle: 'Amortissements dérogatoires', comptes: ['151'], natureCreditrice: true },
      { libelle: 'Plus-value de cession à réinvestir', comptes: ['152'], natureCreditrice: true },
      // Ch. 7, clés de lecture : « la provision spéciale de réévaluation
      // relève du 154 et rejoint CM par le 15 » ; renvoi officiel à la 3E.
      { libelle: 'Provision spéciale de réévaluation', comptes: ['154'], natureCreditrice: true, renvoi: '3E' },
      { libelle: 'Provisions réglementées relatives aux immobilisations', comptes: ['155'], natureCreditrice: true },
      { libelle: 'Provisions réglementées relatives aux stocks', comptes: ['156'], natureCreditrice: true },
      { libelle: 'Provisions pour investissement', comptes: ['157'], natureCreditrice: true },
      { libelle: 'Autres provisions et fonds réglementées', comptes: ['153', '158'], natureCreditrice: true },
      { libelle: 'TOTAL PROVISIONS RÉGLEMENTÉES', totalDeRubriques: [9, 10, 11, 12, 13, 14, 15] },
      { libelle: 'TOTAL SUBVENTIONS ET PROVISIONS RÉGLEMENTÉES', totalDeRubriques: [8, 16] },
    ],
    commentaire:
      "indiquer pour la subvention la date d'octroi, la nature, les obligations éventuelles ; pour les " +
      'provisions réglementées, indiquer le texte de référence, les obligations ; commenter toute variation ' +
      'significative.',
  },
  {
    code: '15B',
    titre: 'AUTRES FONDS PROPRES',
    // Anomalie n° 8.
    colonnes: [
      { type: 'LIBRE' as const, libelle: 'NOTE' },
      { type: 'EXERCICE_N' as const, libelle: 'Année N' },
      { type: 'EXERCICE_N1' as const, libelle: 'Année N-1' },
      // Même lecture qu'à la 15A : « valeur absolue » s'oppose à « en % »
      // (anomalie n° 5). Une reprise d'avance conditionnée doit ressortir
      // négative.
      { type: 'VARIATION_VALEUR' as const, libelle: 'Variation en valeur absolue' },
      { type: 'VARIATION_POURCENT' as const, libelle: 'Variation en %' },
      { type: 'LIBRE' as const, libelle: 'Échéances' },
    ],
    // Pas de `renvoyeeDepuis` : la note 15B est bien un détail de DA, mais le
    // ch. 3 renvoie DA à la NOTE 16 et n'attribue aucun code à cette ligne
    // intercalée · aucun poste du bilan ne renvoie ici (anomalie n° 16).
    rubriques: [
      enAttente(
        'titres-participatifs',
        'Titres participatifs',
        'Le plan ne prévoit aucun compte de passif pour les titres participatifs ÉMIS (2742 est un titre ' +
          'DÉTENU, à l’actif) : subdiviser le compte 168 « Autres emprunts et dettes » et rattacher ici le ' +
          'sous-compte des titres participatifs émis. Attention : 1684 « Emprunts participatifs » (Titre VII ' +
          'COMPTE 16) n’est PAS la bonne réponse · un emprunt participatif est un contrat de prêt, un titre ' +
          'participatif une valeur mobilière émise par l’entité ; le rattacher ici le sortirait de la note ' +
          '16A sans lui donner sa vraie ligne.',
      ),
      // Titre VII COMPTE 16 : 1671 avances bloquées pour augmentation du
      // capital, 1672 à 1674 avances conditionnées par l'État, les organismes
      // africains, les organismes internationaux.
      { libelle: 'Avances conditionnées', comptes: ['167'], natureCreditrice: true, renvoi: '16A' },
      enAttente(
        'titres-subordonnes-duree-indeterminee',
        'Titres subordonnés à durée indéterminée (T.S.D.I.)',
        'Le plan ne prévoit aucun compte pour les titres subordonnés à durée indéterminée : subdiviser le ' +
          'compte 168 « Autres emprunts et dettes » et rattacher ici le sous-compte des T.S.D.I.',
      ),
      // Titre VII COMPTE 16 : « 1613 remboursables en actions ». Reste aussi
      // dans 161 à la note 16A (anomalie n° 8).
      {
        libelle: 'Obligations remboursables en actions (O.R.A.)',
        comptes: ['1613'],
        natureCreditrice: true,
        renvoi: '16A',
      },
      enAttente(
        'autres-fonds-propres',
        'Autres',
        'Rattacher ici les autres sous-comptes du 16 que l’entité présente en « autres fonds propres » (faible ' +
          'probabilité de remboursement, absence d’échéancier…).',
      ),
      { libelle: 'TOTAL AUTRES FONDS PROPRES', totalDeRubriques: [0, 1, 2, 3, 4] },
    ],
    renvoiOfficiel:
      '(1) Le cas échéant, une rubrique « Autres fonds propres » (montant des émissions de titres participatifs, ' +
      'avances conditionnées…) sur une ligne séparée est intercalée entre les rubriques « TOTAL CAPITAUX ' +
      'PROPRES ET RESSOURCES ASSIMILÉES » et « emprunts et dettes financières » si le montant des autres fonds ' +
      'propres est significatif.',
    commentaire:
      "justifier l'inscription de ces dettes dans une rubrique spécifique du passif du bilan « autres fonds " +
      "propres » (faible probabilité de remboursement, absence d'échéancier…) ; justifier le caractère " +
      'significatif du montant total de cette rubrique ; commenter toute variation significative.',
  },
];

/**
 * Codes officiels de cette tranche, dans l'ordre de la liste du ch. 6
 * section 2. Exporté pour que le spec compare la transcription à la liste
 * plutôt qu'à elle-même.
 */
export const CODES_NOTES_SYSCOHADA_1 = [
  '1', '2', '3A', '3B', '3C', '3D', '3E', '3F', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15A', '15B',
];
