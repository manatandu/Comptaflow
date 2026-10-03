import { FormeJuridiqueSyscohada } from '@prisma/client';
import { FORMES_PERSONNES_PHYSIQUES } from '../retenues/correspondance-retenues';

/**
 * L'ÉCRITURE DE L'IMPÔT SUR LE RÉSULTAT · ligne A11 de la liste verrouillée
 * (relevé CPCC C7, décision de Manasse du 2026-10-02). Règles PURES, sans
 * base · le service les rejoue au moment du clic.
 *
 * CE QUE LE TEXTE DIT, LU LE 2026-10-03.
 *
 * AUDCIF, Titre VII, COMPTE 89 « Impôts sur le résultat » · « C'est la part
 * de bénéfice affectée obligatoirement à l'État au titre de l'impôt sur le
 * résultat ». Subdivisions · 891 Impôts sur les bénéfices de l'exercice
 * (8911 Activités exercées dans l'État, 8912 dans les autres États de la
 * Région, 8913 hors Région), 892 Rappels d'impôts sur résultats antérieurs,
 * 895 Impôt minimum forfaitaire (I.M.F.), 899 Dégrèvements. Commentaires ·
 * « Le compte 891 doit correspondre au MONTANT TOTAL DE L'IMPÔT DÛ DE
 * L'EXERCICE, QUELLES QUE SOIENT LES MODALITÉS DE RÈGLEMENT ». Fonctionnement
 * · « DÉBITÉ de l'impôt exigible, par le CRÉDIT du compte 441 (État, impôt
 * sur les bénéfices) » ; « crédité pour solde de ce compte à la clôture de
 * l'exercice, par le débit du compte 13 ». Guide SYSCOHADA, Partie 1 ch. 3,
 * § 2.3 et Application 8 · acomptes 35 + 45 + 40 + 40, impôt dû 180 · le 891
 * reçoit 180, l'impôt ENTIER, et non le solde restant de 20.
 *
 * DEUX QUESTIONS TRANCHÉES PAR CE TEXTE.
 *
 * (1) LES ACOMPTES N'ENTRENT PAS DANS L'ÉCRITURE DU 891. Les deux textes le
 * disent chacun à sa manière · « quelles que soient les modalités de
 * règlement » (fiche du 89), et l'Application 8 du Guide qui porte 180 au 891
 * malgré 160 d'acomptes. L'acompte versé est au DÉBIT du 4492 « État, avances
 * et acomptes versés sur impôts » (fiche du compte 44 · « débité des sommes
 * versées lors du règlement par l'entité à l'État »), et il s'impute sur la
 * dette d'impôt, art. 57 bis, al. 3 LPF · « Ces trois versements sont à
 * déduire de l'impôt dû par le contribuable pour l'exercice fiscal
 * considéré ». L'imputation est donc une SECONDE paire de lignes, D 441 /
 * C 4492, que le cabinet DEMANDE · jamais d'office, le 4492 pouvant porter
 * une consignation de l'art. 110 LPF qui n'est pas un acompte (voir
 * `FiscaliteService.suiviAcomptes`). Elle se borne aux acomptes DÉCLARÉS dans
 * la fenêtre, au solde débiteur du 4492 et à l'impôt de l'exercice · un
 * excédent n'est pas imputé, il reste au 4492 comme crédit au compte courant
 * fiscal (art. 57 ter LPF, « PEUVENT, À SA DEMANDE, servir au paiement
 * d'autres impôts et droits dus »).
 *
 * (2) L'IMPÔT MINIMUM RETENU VA AU 895, L'IMPÔT AU TAUX AU 891. Loi
 * n° 23/053, art. 57 · « Les sociétés sont assujetties à un impôt minimum
 * fixé à 1 % du chiffre d'affaires déclaré, lorsque les résultats sont
 * déficitaires ou bénéficiaires mais susceptibles de donner lieu à une
 * imposition inférieure à ce montant ». La même loi le NOMME « minimum
 * forfaitaire de perception » et le DISTINGUE de l'impôt sur les sociétés à
 * son art. 45 · « Sont déductibles les impôts, droits et taxes […], à
 * l'exception de l'Impôt sur les Sociétés ET du minimum forfaitaire de
 * perception ». Le plan lui ouvre un compte propre, 895 « Impôt minimum
 * forfaitaire (I.M.F.) », à côté du 891 « Impôts sur les bénéfices de
 * l'exercice ». La subdivision spéciale l'emporte sur le commentaire général
 * du 891 (« montant total de l'impôt dû ») · quand l'art. 57 joue
 * (`minimumApplique`, minimum STRICTEMENT supérieur à l'impôt au taux), le
 * débit va au 89500000 ; sinon au 89110000. Les deux sous-comptes sont dans
 * le 89 et sous le même poste du compte de résultat · le résultat net est le
 * même, seule la nature de la charge se lit. TÉMOIN concordant, pas source ·
 * le séminaire CPCC (« perte fiscale, paiement de l'impôt minimum
 * forfaitaire », D 895 / C 441), sous l'ancien régime de l'IBP.
 *
 * LE SOUS-COMPTE DU 891 · 89110000 « Activités exercées dans l'État ».
 * L'impôt que calcule OmegaX est assis sur les bénéfices réalisés en RDC (loi
 * n° 23/053, art. 7, « UNIQUEMENT ») ; 8912 et 8913 visent des impôts levés
 * ailleurs, hors de ce calcul. Numéros vérifiés au semis
 * (`compte-seed-syscohada.ts` · 891 en TOTAL, 89110000, 89500000, 44100000,
 * 44920000).
 */

/** Les trois comptes, forme semée à huit chiffres (CLAUDE.md § 7). */
export const COMPTES_IMPOT_RESULTAT = {
  /** 8911 « Activités exercées dans l'État », sous 891 « Impôts sur les bénéfices de l'exercice ». */
  charge: '89110000',
  /** 895 « Impôt minimum forfaitaire IMF » · l'impôt minimum de l'art. 57, quand il est retenu. */
  chargeMinimum: '89500000',
  /** 441 « État, impôt sur les bénéfices » · le crédit que la fiche du 89 prescrit. */
  dette: '44100000',
  /** 4492 « État, avances et acomptes versés sur impôts » · fiche du compte 44. */
  acomptes: '44920000',
} as const;

/**
 * LES FORMES DONT L'ASSUJETTISSEMENT TIENT À UN FAIT QUE LE DOSSIER NE PORTE
 * PAS · loi n° 23/053, Titre 2. Le calcul les suppose à l'IS (voir
 * `FiscaliteService.regimeSelonForme`, qui les signale) ; constater un impôt
 * sur cette supposition serait inscrire une dette peut-être inexistante. Le
 * cabinet DÉCLARE le fait par écrit, et la déclaration est gardée avec le
 * constat · sans elle, refus nommé.
 */
export const CONDITIONS_A_DECLARER: Readonly<Partial<Record<FormeJuridiqueSyscohada, string>>> = {
  SOCIETE_NOM_COLLECTIF:
    "société de personnes · l'impôt sur les sociétés ne s'applique que sur OPTION irrévocable, levée en assemblée générale et notifiée dans les trois mois du début de l'exercice (loi n° 23/053, art. 4)",
  SOCIETE_COMMANDITE_SIMPLE:
    "société de personnes · l'impôt sur les sociétés ne s'applique que sur OPTION irrévocable, levée en assemblée générale et notifiée dans les trois mois du début de l'exercice (loi n° 23/053, art. 4)",
  GROUPEMENT_INTERET_ECONOMIQUE:
    "groupement d'intérêt économique · exonéré pour la quote-part de bénéfice distribuée à ses membres personnes physiques (loi n° 23/053, art. 6), à retrancher par une déduction avant de constater l'impôt",
  SOCIETE_COOPERATIVE:
    "société coopérative · exemptée si elle produit, transforme, conserve ou vend des produits agricoles, de l'élevage ou de la pêche et revêt la forme civile (loi n° 23/053, art. 5, 2°)",
  ENTITE_PUBLIQUE:
    "entité publique · exemptée si c'est un établissement public en vertu de ses statuts ou un organisme dont les ressources proviennent uniquement de subventions budgétaires (loi n° 23/053, art. 5, 1°)",
  SUCCURSALE:
    "succursale · imposable en RDC si son propriétaire est une société non-résidente (loi n° 23/053, art. 7 et 8) ; la forme ne dit pas qui la possède (AUSCGIE, art. 116 et 118)",
};

export const LONGUEUR_MIN_ATTESTATION = 10;

/** Ce que le service a rejoué au moment du clic, et que les règles jugent. */
export interface EntreeConstatImpot {
  formeJuridique: FormeJuridiqueSyscohada | null;
  regime: string;
  impotDu: number | null;
  minimumApplique: boolean;
  /** L'exercice ouvre avant le 1er janvier 2026 · l'impôt est une SIMULATION sous la loi n° 23/053. */
  simulationAvantLaLoi: boolean;
  exerciceClos: boolean;
  /** Écritures au brouillard de l'exercice touchant les classes 6 à 8 · hors du calcul (livre-journal seul). */
  brouillardGestion: number;
  /** Solde débiteur net des 891 et 895 au livre-journal · un impôt déjà constaté hors module. */
  impotDejaConstate: number;
  /** Solde débiteur net du 89 entier au livre-journal (rappels et dégrèvements compris). */
  soldeCompte89: number;
  /** Total des réintégrations IMPOT_SUR_LE_RESULTAT saisies sur l'exercice. */
  reintegrationsImpot: number;
  /** `undefined` à la LECTURE (la condition est servie à part), une chaîne ou `null` au clic. */
  attestationRegime: string | null | undefined;
}

const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * LES MOTIFS QUI EMPÊCHENT DE PROPOSER L'ÉCRITURE · tous, dans l'ordre où le
 * cabinet doit les lever. Un impôt non chiffré n'est jamais zéro · l'écriture
 * ne se propose pas tant que le calcul est incomplet (CLAUDE.md § 10 bis).
 */
export function motifsRefusConstat(e: EntreeConstatImpot): string[] {
  const motifs: string[] = [];
  if (e.formeJuridique === null) {
    motifs.push(
      "La forme juridique du dossier n'est pas renseignée (Structure > Paramètres du dossier). Le calcul la suppose à l'impôt sur les sociétés, mais une entreprise individuelle ou un entreprenant n'y est pas soumis · l'impôt ne se constate pas sur une supposition.",
    );
    return motifs;
  }
  if (FORMES_PERSONNES_PHYSIQUES.includes(e.formeJuridique)) {
    motifs.push(
      "Une personne physique (entreprise individuelle, entreprenant) n'est pas redevable de l'impôt sur les sociétés (loi n° 23/053, art. 3) · son bénéfice entre dans le revenu de l'exploitant à l'impôt sur le revenu des personnes physiques, qui n'est pas une charge de l'entreprise au compte 89.",
    );
    return motifs;
  }
  if (e.regime !== 'IMPOT_SOCIETES') {
    motifs.push("Le régime calculé n'est pas l'impôt sur les sociétés · aucune écriture d'impôt sur les sociétés ne se propose.");
    return motifs;
  }
  if (e.simulationAvantLaLoi) {
    motifs.push(
      "L'exercice ouvre avant le 1er janvier 2026 · l'impôt affiché est une SIMULATION sous la loi n° 23/053, qui ne régissait pas cet exercice (art. 153). L'impôt réellement dû se constate à la main, sur le texte de l'époque.",
    );
  }
  if (e.exerciceClos) {
    motifs.push("L'exercice est clôturé · aucune écriture ne s'y passe plus (AUDCIF art. 22, 2°).");
  }
  const condition = CONDITIONS_A_DECLARER[e.formeJuridique];
  if (condition && e.attestationRegime !== undefined && (e.attestationRegime ?? '').trim().length < LONGUEUR_MIN_ATTESTATION) {
    motifs.push(
      `Assujettissement à déclarer · ${condition}. Écrivez ce qui fonde l'impôt (option levée et sa date, nature de l'activité, propriétaire) avant de le constater.`,
    );
  }
  if (e.brouillardGestion > 0) {
    motifs.push(
      `${e.brouillardGestion} écriture(s) au brouillard touchent les classes 6 à 8 de l'exercice · le résultat fiscal ne lit que le livre-journal (AUDCIF art. 22, 2°), l'impôt serait calculé sans elles. Validez-les ou retirez-les d'abord.`,
    );
  }
  if (Math.abs(e.impotDejaConstate) >= 0.005) {
    motifs.push(
      `Le 891 ou le 895 porte déjà ${fmt(e.impotDejaConstate)} au livre-journal hors de cette fenêtre · l'impôt de l'exercice semble déjà constaté. Une seconde écriture le doublerait ; corrigez la première (AUDCIF art. 20) avant de passer par ici.`,
    );
  } else if (Math.abs(e.soldeCompte89 - e.reintegrationsImpot) >= 0.005) {
    motifs.push(
      `Le compte 89 porte ${fmt(e.soldeCompte89)} au livre-journal et les réintégrations « Impôt sur les sociétés et impôt minimum comptabilisés en charges » valent ${fmt(e.reintegrationsImpot)} · l'impôt n'est pas déductible de son propre calcul (loi n° 23/053, art. 45 et art. 50, 2°), et l'écart de ${fmt(e.soldeCompte89 - e.reintegrationsImpot)} fausse la base. Ajustez la réintégration pour qu'elle égale le 89.`,
    );
  }
  if (e.impotDu === null) {
    motifs.push("L'impôt n'est pas chiffré · rien ne se constate tant qu'il ne l'est pas.");
  } else if (e.impotDu <= 0.005) {
    motifs.push(
      "L'impôt dû de l'exercice est nul (résultat fiscal nul ou déficitaire et chiffre d'affaires nul) · aucune écriture à passer.",
    );
  }
  return motifs;
}

/**
 * L'IMPUTATION DES ACOMPTES, quand le cabinet la demande · le plus petit des
 * acomptes DÉCLARÉS, du solde débiteur du 4492 et de l'impôt. Le 4492 n'est
 * jamais rendu créditeur, l'excédent sur l'impôt reste un crédit (art. 57 ter).
 */
export function imputationAcomptes(e: { declares: number; solde4492: number; impot: number }): {
  montant: number;
  motifRefus: string | null;
} {
  if (e.declares <= 0.005) {
    return { montant: 0, motifRefus: "Aucun acompte n'est déclaré dans la fenêtre Résultat fiscal pour cet exercice." };
  }
  if (e.solde4492 <= 0.005) {
    return {
      montant: 0,
      motifRefus:
        "Le compte 4492 n'a pas de solde débiteur au livre-journal · aucun acompte versé n'y est inscrit, rien ne s'impute (fiche du compte 44).",
    };
  }
  if (e.declares - e.solde4492 >= 0.005) {
    return {
      montant: 0,
      motifRefus: `Les acomptes déclarés (${fmt(e.declares)}) dépassent le solde débiteur du 4492 (${fmt(e.solde4492)}) · imputer le déclaré rendrait le 4492 créditeur. Rapprochez d'abord la déclaration du compte.`,
    };
  }
  const montant = Math.round(Math.min(e.declares, e.impot) * 100) / 100;
  return { montant, motifRefus: null };
}

export interface LigneProposee {
  numero: string;
  debit: number;
  credit: number;
  libelle: string;
}

/** Le compte de la charge · 895 quand l'impôt minimum est retenu, 8911 sinon. */
export function compteDeLaCharge(minimumApplique: boolean): string {
  return minimumApplique ? COMPTES_IMPOT_RESULTAT.chargeMinimum : COMPTES_IMPOT_RESULTAT.charge;
}

/**
 * Les lignes · D 8911 (ou 895) / C 441 pour l'impôt ENTIER, puis D 441 /
 * C 4492 si l'imputation est demandée · débits puis crédits dans chaque
 * paire, comme l'Application 8 du Guide.
 */
export function lignesConstat(impot: number, minimumApplique: boolean, impute: number): LigneProposee[] {
  const lignes: LigneProposee[] = [
    {
      numero: compteDeLaCharge(minimumApplique),
      debit: impot,
      credit: 0,
      libelle: minimumApplique ? "Impôt minimum de l'exercice" : "Impôt sur les bénéfices de l'exercice",
    },
    { numero: COMPTES_IMPOT_RESULTAT.dette, debit: 0, credit: impot, libelle: 'État, impôt sur les bénéfices' },
  ];
  if (impute > 0.005) {
    lignes.push(
      { numero: COMPTES_IMPOT_RESULTAT.dette, debit: impute, credit: 0, libelle: 'Imputation des acomptes provisionnels' },
      { numero: COMPTES_IMPOT_RESULTAT.acomptes, debit: 0, credit: impute, libelle: 'Acomptes provisionnels imputés' },
    );
  }
  return lignes;
}
