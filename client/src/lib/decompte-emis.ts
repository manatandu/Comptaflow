/**
 * A8 · CE QUI MANQUE POUR ÉMETTRE LE DÉCOMPTE FINAL, dit avant le clic, et le
 * corps que l'écran envoie.
 *
 * Le décompte émis se rapporte à UN salarié (celui choisi dans le registre) et
 * remplace le bulletin du MOIS DE CESSATION · sans l'un ou l'autre, le bouton
 * reste grisé, et l'écran dit pourquoi plutôt que de se taire (§ 9 ter).
 * Les refus de fond (contrat non terminé, solde partiel, bulletin actif du
 * mois) restent au serveur, qui les nomme.
 */
export type NatureBulletin = 'MOIS' | 'DECOMPTE_FINAL';

/** Le nom du double du livre de paie · le décompte se dit comme tel, partout. */
export function natureDuBulletin(nature: NatureBulletin | undefined): string {
  return nature === 'DECOMPTE_FINAL' ? 'Décompte final' : 'Bulletin de paie';
}

export const MOIS_AAAA_MM = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Ce que l'écran tient au moment du clic · des CHAÎNES saisies, jamais converties ici. */
export type EtatEmissionDecompte = {
  readonly salarieId: string | null | undefined;
  readonly moisDeCessation: string;
  readonly anneesAnciennete: string;
  readonly moisNonCouvertsParUnConge: string;
  readonly arrieresFc: string;
  /** Les éléments du mois saisis dans l'onglet Simulation. */
  readonly nombreElementsDuMois: number;
  /** Les avantages compris dans le préavis ou les dommages-intérêts, et leur ventilation. */
  readonly avantagesFc?: number;
  readonly avantagesVentilesFc?: number;
  /** A18 · une stipulation entamée et illisible (`motifStipulationsIncompletes`). */
  readonly motifStipulations?: string | null;
};

export const MOTIF_ARRIERES_ET_ELEMENTS =
  'Des arriérés sont saisis alors que la paie du mois porte des éléments · au décompte émis, les arriérés SONT ces éléments. Videz le champ Arriérés, ou retirez les éléments du mois.';

/**
 * Le premier motif qui empêche l'émission, ou null. Rien n'est effacé ni
 * remplacé · une saisie qui contredit une autre est NOMMÉE (B1), et un champ
 * vide n'est jamais lu zéro (B2).
 */
export function motifDecompteNonEmissible(e: EtatEmissionDecompte): string | null {
  if (!e.salarieId) return 'Choisissez d’abord le salarié dans le registre.';
  if (!MOIS_AAAA_MM.test(e.moisDeCessation.trim())) return 'Renseignez le mois de cessation (AAAA-MM).';
  if (e.anneesAnciennete.trim() === '') return 'Renseignez l’ancienneté en années, zéro compris.';
  if (e.moisNonCouvertsParUnConge.trim() === '') return 'Renseignez les mois non couverts par un congé, zéro compris.';
  if (e.arrieresFc.trim() !== '' && e.nombreElementsDuMois > 0) return MOTIF_ARRIERES_ET_ELEMENTS;
  if (e.motifStipulations) return e.motifStipulations;
  const avantages = e.avantagesFc ?? 0;
  if (avantages > 0 && Math.round((e.avantagesVentilesFc ?? 0) * 100) !== Math.round(avantages * 100)) {
    return 'Ventilez les avantages compris dans l’indemnité (logement, transport, soins, autres), au centime.';
  }
  return null;
}

/** Les quatre parts que le cabinet déclare, en chaînes saisies. */
export type SaisieVentilation = {
  readonly logement: string;
  readonly transport: string;
  readonly soins: string;
  readonly autres: string;
};

export type LigneVentilation = {
  rubrique: 'preavis' | 'dommages-interets-art-70';
  nature: 'LOGEMENT_OU_SON_INDEMNITE' | 'INDEMNITE_DE_TRANSPORT' | 'SOINS_DE_SANTE' | 'REMUNERATION';
  libelle: string;
  montantFc: number;
};

const lireMontant = (v: string): number | undefined => {
  const n = Number(v.replace(/\s/g, '').replace(',', '.'));
  return v.trim() === '' || Number.isNaN(n) ? undefined : n;
};

/**
 * LA VENTILATION DES AVANTAGES, rattachée à la rubrique qui les comprend ·
 * le préavis (art. 63, al. 3) ou les dommages-intérêts (art. 70). Une part
 * vide ou nulle ne part pas ; le serveur exige que la somme fasse le compte.
 */
export function ventilationDesAvantages(
  rubrique: LigneVentilation['rubrique'] | null,
  v: SaisieVentilation,
): LigneVentilation[] {
  if (rubrique === null) return [];
  const parts: [LigneVentilation['nature'], string, string][] = [
    ['LOGEMENT_OU_SON_INDEMNITE', v.logement, 'Logement compris dans l’indemnité'],
    ['INDEMNITE_DE_TRANSPORT', v.transport, 'Transport compris dans l’indemnité'],
    ['SOINS_DE_SANTE', v.soins, 'Soins de santé compris dans l’indemnité'],
    ['REMUNERATION', v.autres, 'Autres avantages compris dans l’indemnité'],
  ];
  return parts.flatMap(([nature, saisi, libelle]) => {
    const m = lireMontant(saisi);
    return m !== undefined && m > 0 ? [{ rubrique, nature, libelle, montantFc: m }] : [];
  });
}

/** La somme ventilée, au centime · la page n'additionne rien elle-même. */
export function totalVentile(ventilation: readonly LigneVentilation[]): number {
  return Math.round(ventilation.reduce((n, v) => n + v.montantFc, 0) * 100) / 100;
}

/**
 * LE CORPS ENVOYÉ À L'ÉMISSION · fonction pure, testée directement. Les faits
 * partent TELS QUE SAISIS (arriérés compris, s'il y en a) · le motif
 * ci-dessus refuse le clic quand ils contredisent les éléments du mois, le
 * corps ne les retire jamais. Le mois est rogné, une fois, et sert aux deux.
 */
export function corpsEmissionDecompte<F extends object, P extends object>(
  faits: F,
  paie: P,
  moisDeCessation: string,
  ventilation: readonly LigneVentilation[],
): { decompte: F & { moisDeCessation: string }; paie: P & { moisDePaie: string }; ventilationAvantages?: LigneVentilation[] } {
  const mois = moisDeCessation.trim();
  return {
    decompte: { ...faits, moisDeCessation: mois },
    paie: { ...paie, moisDePaie: mois },
    ...(ventilation.length > 0 ? { ventilationAvantages: [...ventilation] } : {}),
  };
}

/**
 * A9 (M2) · LE PRÉAVIS NE PORTE D'AVANTAGES À VENTILER QUE PAYÉ PAR
 * L'EMPLOYEUR · art. 63, al. 3, préavis non observé à la charge de l'employeur
 * ou dispensé par lui. Sous un départ à mi-préavis (art. 66, la rémunération
 * seule) ou un préavis non observé par le travailleur (ce qu'il DOIT, hors du
 * total), aucune ventilation ne part · l'écran l'exigeait et le serveur la
 * refusait. La partie responsable vide se lit comme le moteur la lit · celle
 * de l'initiative.
 */
export function preavisPorteDesAvantages(
  executionPreavis: string,
  partieResponsable: string,
  initiative: 'EMPLOYEUR' | 'TRAVAILLEUR',
): boolean {
  if (executionPreavis === 'DISPENSE_PAR_EMPLOYEUR') return true;
  if (executionPreavis !== 'NON_OBSERVE') return false;
  return (partieResponsable || initiative) === 'EMPLOYEUR';
}

/**
 * A9 (M1) · L'AVANTAGE SAISI POUR UN PRÉAVIS NON OBSERVÉ est, pour le
 * travailleur parti avant la moitié d'un préavis REÇU, celui des seuls jours
 * non observés avant la moitié · le moteur ne lui impute que ceux-là
 * (art. 66, al. 1 ; art. 63, al. 3).
 */
export function avantagesDesSeulsJoursAvantLaMoitie(
  executionPreavis: string,
  partieResponsable: string,
  initiative: 'EMPLOYEUR' | 'TRAVAILLEUR',
): boolean {
  return (
    executionPreavis === 'NON_OBSERVE' &&
    initiative === 'EMPLOYEUR' &&
    (partieResponsable || initiative) === 'TRAVAILLEUR'
  );
}

/**
 * A9 (M3) · CE QUE L'AIDE DES ALLOCATIONS FAMILIALES DIT DU TEMPS RESTANT,
 * selon l'exécution déclarée · dues (art. 66, al. 2), perdues (art. 67), non
 * dues avant la moitié (lecture d'OmegaX). Le serveur, lui, ne le dit sur la
 * ligne que si la rubrique s'applique effectivement.
 */
export function allocationsDuTempsRestant(
  executionPreavis: string,
  partieResponsable: string,
  initiative: 'EMPLOYEUR' | 'TRAVAILLEUR',
): string {
  if (executionPreavis === 'DEPART_A_MI_PREAVIS') {
    return 'Départ à mi-préavis · elles restent dues pendant le temps restant à courir, que les jours saisis comptent.';
  }
  if (executionPreavis === 'DEPART_POUR_NOUVEL_EMPLOI') {
    return 'Départ pour un nouvel emploi · celles du préavis restant à courir sont perdues, les jours saisis ne les comptent pas.';
  }
  if (avantagesDesSeulsJoursAvantLaMoitie(executionPreavis, partieResponsable, initiative)) {
    return 'Travailleur parti avant la moitié du préavis · celles du temps restant ne sont pas dues, les jours saisis ne les comptent pas.';
  }
  return 'Le préavis restant à courir n’en porte qu’après un départ à mi-préavis.';
}

/**
 * A18 · LA GRATIFICATION ET L'INDEMNITÉ STIPULÉES, telles que saisies.
 * Aucune n'est légale (Code du travail, art. 7, point 8 ; art. 37) · une
 * saisie VIDE n'envoie rien, et le serveur ne propose rien (null, jamais
 * zéro). Une saisie entamée part telle quelle · c'est le serveur qui nomme la
 * source manquante ; l'écran ne retient que ce qui empêcherait de lire la
 * demande (montant ou période illisibles).
 */
export type SaisieStipulations = {
  readonly gratificationAnnuelleFc: string;
  readonly gratificationSource: string;
  readonly gratificationDebut: string;
  readonly gratificationFin: string;
  readonly indemniteStipuleeFc: string;
  readonly indemniteSource: string;
};

export const SAISIE_STIPULATIONS_VIDE: SaisieStipulations = {
  gratificationAnnuelleFc: '',
  gratificationSource: '',
  gratificationDebut: '',
  gratificationFin: '',
  indemniteStipuleeFc: '',
  indemniteSource: '',
};

const DATE_AAAA_MM_JJ = /^\d{4}-\d{2}-\d{2}$/;

const gratificationEntamee = (s: SaisieStipulations) =>
  [s.gratificationAnnuelleFc, s.gratificationSource, s.gratificationDebut, s.gratificationFin].some((v) => v.trim() !== '');
const indemniteEntamee = (s: SaisieStipulations) => [s.indemniteStipuleeFc, s.indemniteSource].some((v) => v.trim() !== '');

/** Ce qui empêche d'envoyer une stipulation entamée, ou null. */
export function motifStipulationsIncompletes(s: SaisieStipulations): string | null {
  if (gratificationEntamee(s)) {
    if (lireMontant(s.gratificationAnnuelleFc) === undefined) {
      return 'Renseignez le montant annuel stipulé de la gratification, ou videz la stipulation.';
    }
    if (!DATE_AAAA_MM_JJ.test(s.gratificationDebut.trim()) || !DATE_AAAA_MM_JJ.test(s.gratificationFin.trim())) {
      return 'Renseignez la période de référence de la gratification (début et fin), ou videz la stipulation.';
    }
  }
  if (indemniteEntamee(s) && lireMontant(s.indemniteStipuleeFc) === undefined) {
    return 'Renseignez le montant de l’indemnité stipulée, ou videz la stipulation.';
  }
  return null;
}

/** Les deux stipulations, à ajouter aux faits du décompte · absentes quand rien n'est saisi. */
export function stipulationsDuDecompte(s: SaisieStipulations): {
  gratificationStipulee?: { montantAnnuelFc: number; source: string; debutPeriode: string; finPeriode: string };
  indemniteStipulee?: { montantFc: number; source: string };
} {
  if (motifStipulationsIncompletes(s) !== null) return {};
  return {
    ...(gratificationEntamee(s)
      ? {
          gratificationStipulee: {
            montantAnnuelFc: lireMontant(s.gratificationAnnuelleFc) as number,
            source: s.gratificationSource.trim(),
            debutPeriode: s.gratificationDebut.trim(),
            finPeriode: s.gratificationFin.trim(),
          },
        }
      : {}),
    ...(indemniteEntamee(s)
      ? { indemniteStipulee: { montantFc: lireMontant(s.indemniteStipuleeFc) as number, source: s.indemniteSource.trim() } }
      : {}),
  };
}

/** A18 · une retenue proposée par le serveur (Code du travail, art. 112, c et f). */
export type RetenueProposee = {
  avanceId: string;
  littera: 'c' | 'f';
  libelle: string;
  soldeFc: number;
  montantProposeFc: number;
  reserve: string | null;
};

/**
 * LES RETENUES PROPOSÉES REPRISES DANS LA SAISIE · au centime, écrites comme
 * le champ les relit. Une proposition à zéro (net épuisé) ne part pas · le
 * solde reste dû au registre, et l'émission le dira. Les retenues déjà
 * saisies pour d'autres avances sont gardées · la reprise ne retire rien.
 */
export function retenuesReprises(
  saisies: Readonly<Record<string, string>>,
  proposees: readonly RetenueProposee[],
): Record<string, string> {
  const resultat: Record<string, string> = { ...saisies };
  for (const r of proposees) {
    const centimes = Math.round(r.montantProposeFc * 100);
    if (centimes > 0) resultat[r.avanceId] = (centimes / 100).toFixed(2);
    else delete resultat[r.avanceId];
  }
  return resultat;
}
