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
