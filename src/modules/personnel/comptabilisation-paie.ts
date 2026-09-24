/**
 * P9 · LA PAIE DU MOIS AU JOURNAL, EN UNE ÉCRITURE.
 *
 * Chaque bulletin émis porte les chiffres que le travailleur a lus. La paie du
 * mois se passe pourtant en UNE écriture, pas en une par salarié · c'est ce
 * que fait le journal de paie global du Guide d'application SYSCOHADA
 * (Partie 1 ch. 3 section 4, Application 10), et c'est ce que le cabinet
 * reporte du livre de paie. Les trois temps du Guide sont gardés tels quels ·
 * brut (§ 4.1), retenues (§ 4.3), charges patronales (§ 4.2), voir
 * `passation-paie.ts`.
 *
 * LA PASSATION EST REJOUÉE SUR LES CHIFFRES FIGÉS DU BULLETIN, jamais relue
 * dans ses lignes stockées. Les montants sont ceux que le travailleur a
 * signés ; la RÈGLE D'IMPUTATION est celle du jour. Un bulletin émis avant la
 * correction du 2026-09-24 portait une passation combinée qui créditait le
 * 422 du seul net · relire ses lignes le ferait entrer au journal sous la
 * forme que le Guide ne présente pas.
 *
 * UN SEUL BULLETIN REFUSÉ ARRÊTE LE MOIS ENTIER. Passer les autres ferait
 * entrer au journal une masse salariale amputée d'un salaire, sur une
 * écriture équilibrée · rien en aval ne le verrait. Le refus nomme le
 * bulletin : c'est lui qu'il faut annuler et réémettre.
 *
 * AU CENTIME, ET ÉQUILIBRÉE PAR CONSTRUCTION. Un montant d'impôt mensuel porte
 * des décimales que la base ne garde pas (Decimal 18,2). Chaque ligne de
 * DÉTAIL est arrondie au centime, puis la ligne de TOTAL de chaque bloc est
 * recalculée comme la somme des détails arrondis · C/422 au bloc brut, D/422
 * au bloc des retenues, D/664 au bloc patronal. Chaque bloc s'équilibre donc
 * au centime, et l'écriture avec lui. L'écart éventuel entre le solde du 422
 * et la somme des nets est affiché, jamais logé dans un compte de bouclage.
 */
import {
  compteDuRole,
  NOMENCLATURE_PAIE,
  passationPaie,
  type BlocPaie,
  type EntreePassation,
  type Referentiel,
  type SensLigne,
} from './passation-paie';

export type BulletinAComptabiliser = {
  readonly id: string;
  readonly numero: number;
  readonly nomComplet: string;
  readonly statut: 'EMIS' | 'ANNULE';
  readonly ecritureId: string | null;
  readonly netAPayerFc: number;
  /** Ce qui a été saisi à l'émission · porte les éléments et leur nature. */
  readonly entree: unknown;
  /** La simulation figée à l'émission. */
  readonly calcul: unknown;
};

export type LigneDuMois = {
  readonly bloc: BlocPaie;
  readonly compte: string;
  readonly intitule: string;
  readonly sens: SensLigne;
  readonly montantFc: number;
};

export type PropositionPaieDuMois = {
  readonly moisDePaie: string;
  readonly referentiel: Referentiel;
  /** Les bulletins émis que cette écriture passerait. */
  readonly aPasser: readonly { id: string; numero: number; nomComplet: string }[];
  /** Les bulletins émis déjà portés par une écriture. */
  readonly dejaPasses: readonly { numero: number; nomComplet: string; ecritureId: string }[];
  /** Annulés APRÈS avoir été passés · leur salaire est encore au journal. */
  readonly annulesApresPassation: readonly { numero: number; nomComplet: string; ecritureId: string }[];
  readonly refus: readonly { numero: number; nomComplet: string; motifs: readonly string[] }[];
  readonly lignes: readonly LigneDuMois[];
  readonly totalDebitFc: number;
  readonly totalCreditFc: number;
  readonly equilibree: boolean;
  /** Solde créditeur du 422 après l'écriture · le net à payer du mois. */
  readonly solde422Fc: number;
  /** Somme des nets figés sur les bulletins passés. */
  readonly sommeDesNetsFc: number;
  readonly reserves: readonly string[];
};

const ORDRE_DES_BLOCS: readonly BlocPaie[] = ['BRUT', 'RETENUES', 'PATRONALES'];

/** Le compte qui porte le TOTAL de chaque bloc, et son sens. */
const TOTAL_DU_BLOC: Readonly<Record<BlocPaie, { role: 'REMUNERATIONS_DUES' | 'CHARGES_SOCIALES_PATRONALES'; sens: SensLigne }>> = {
  BRUT: { role: 'REMUNERATIONS_DUES', sens: 'CREDIT' },
  RETENUES: { role: 'REMUNERATIONS_DUES', sens: 'DEBIT' },
  PATRONALES: { role: 'CHARGES_SOCIALES_PATRONALES', sens: 'DEBIT' },
};

const enCentimes = (fc: number) => Math.round(fc * 100);
const enFrancs = (centimes: number) => centimes / 100;

type Json = Record<string, unknown> | null | undefined;
const objet = (x: unknown): Json => (x && typeof x === 'object' ? (x as Record<string, unknown>) : null);
const nombreOuNull = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/**
 * L'entrée de la passation, reconstituée depuis le bulletin figé. Rend `null`
 * quand le bulletin ne porte pas ce qu'il faut · un bulletin illisible se
 * refuse, il ne se complète pas.
 */
export function entreeDuBulletin(b: BulletinAComptabiliser, referentiel: Referentiel): EntreePassation | null {
  const entree = objet(b.entree);
  const calcul = objet(b.calcul);
  const cotisations = objet(calcul?.cotisations);
  const retenue = objet(calcul?.retenue);
  const net = objet(calcul?.net);
  const elements = entree?.elements;
  const lignes = cotisations?.lignes;
  if (!Array.isArray(elements) || !Array.isArray(lignes)) return null;
  return {
    referentiel,
    elements: elements as EntreePassation['elements'],
    cotisations: lignes as EntreePassation['cotisations'],
    abstentionsCotisations: Array.isArray(cotisations?.abstentions) ? (cotisations!.abstentions as string[]) : [],
    irppFc: nombreOuNull(retenue?.retenueFc),
    netAPayerFc: nombreOuNull(net?.netAPayerFc),
  };
}

export function propositionPaieDuMois(
  moisDePaie: string,
  referentiel: Referentiel,
  bulletins: readonly BulletinAComptabiliser[],
): PropositionPaieDuMois {
  const emis = bulletins.filter((b) => b.statut === 'EMIS');
  const aPasser = emis.filter((b) => !b.ecritureId);
  const dejaPasses = emis
    .filter((b) => b.ecritureId)
    .map((b) => ({ numero: b.numero, nomComplet: b.nomComplet, ecritureId: b.ecritureId as string }));
  const annulesApresPassation = bulletins
    .filter((b) => b.statut === 'ANNULE' && b.ecritureId)
    .map((b) => ({ numero: b.numero, nomComplet: b.nomComplet, ecritureId: b.ecritureId as string }));

  const reserves: string[] = [];
  if (annulesApresPassation.length > 0) {
    reserves.push(
      `ANNULÉ APRÈS PASSATION · ${annulesApresPassation.map((b) => `n° ${b.numero}`).join(', ')}. ` +
        "Le salaire de ce bulletin est encore dans l'écriture validée qui l'a passé. Il se corrige par une écriture " +
        "en négatif (AUDCIF art. 20), qu'OmegaX ne passe pas à la place du cabinet.",
    );
  }

  const refus: { numero: number; nomComplet: string; motifs: string[] }[] = [];
  // Détail par (bloc, compte, sens), en centimes. Les lignes de TOTAL sont
  // ignorées ici et recalculées plus bas.
  const detail = new Map<string, { bloc: BlocPaie; compte: string; intitule: string; sens: SensLigne; centimes: number }>();
  let sommeDesNets = 0;

  for (const b of aPasser) {
    const entree = entreeDuBulletin(b, referentiel);
    if (!entree) {
      refus.push({ numero: b.numero, nomComplet: b.nomComplet, motifs: ['Bulletin illisible · ses éléments ou ses cotisations manquent.'] });
      continue;
    }
    const v = passationPaie(entree);
    if (v.refus.length > 0) {
      refus.push({ numero: b.numero, nomComplet: b.nomComplet, motifs: v.refus.map((r) => `${r.motif} · ${r.explication}`) });
      continue;
    }
    sommeDesNets += enCentimes(b.netAPayerFc);
    for (const l of v.lignes) {
      const total = TOTAL_DU_BLOC[l.bloc];
      if (l.compte === compteDuRole(total.role, referentiel) && l.sens === total.sens) continue;
      const cle = `${l.bloc}|${l.compte}|${l.sens}`;
      const courant = detail.get(cle);
      if (courant) courant.centimes += enCentimes(l.montantFc);
      else detail.set(cle, { bloc: l.bloc, compte: l.compte, intitule: l.intitule, sens: l.sens, centimes: enCentimes(l.montantFc) });
    }
  }

  const vide = (motifReserve?: string): PropositionPaieDuMois => ({
    moisDePaie,
    referentiel,
    aPasser: aPasser.map((b) => ({ id: b.id, numero: b.numero, nomComplet: b.nomComplet })),
    dejaPasses,
    annulesApresPassation,
    refus,
    lignes: [],
    totalDebitFc: 0,
    totalCreditFc: 0,
    equilibree: false,
    solde422Fc: 0,
    sommeDesNetsFc: 0,
    reserves: motifReserve ? [...reserves, motifReserve] : reserves,
  });

  if (refus.length > 0) {
    return vide(
      "UN BULLETIN REFUSÉ ARRÊTE LE MOIS · passer les autres ferait entrer au journal une masse salariale amputée " +
        "d'un salaire, sur une écriture équilibrée. Annulez et réémettez le bulletin nommé.",
    );
  }
  if (aPasser.length === 0) return vide();

  const lignes: LigneDuMois[] = [];
  for (const bloc of ORDRE_DES_BLOCS) {
    const duBloc = [...detail.values()].filter((d) => d.bloc === bloc && d.centimes > 0);
    if (duBloc.length === 0) continue;
    const total = TOTAL_DU_BLOC[bloc];
    const totalCentimes = duBloc.reduce((n, d) => n + d.centimes, 0);
    const ligneTotal: LigneDuMois = {
      bloc,
      compte: compteDuRole(total.role, referentiel),
      intitule: NOMENCLATURE_PAIE[total.role].intitule,
      sens: total.sens,
      montantFc: enFrancs(totalCentimes),
    };
    const details = duBloc
      .sort((a, b) => a.compte.localeCompare(b.compte))
      .map((d) => ({ bloc, compte: d.compte, intitule: d.intitule, sens: d.sens, montantFc: enFrancs(d.centimes) }));
    // Débits avant crédits, dans chaque bloc · la présentation du Guide.
    const tous = total.sens === 'DEBIT' ? [ligneTotal, ...details] : [...details, ligneTotal];
    lignes.push(...tous);
  }

  const somme = (sens: SensLigne) => lignes.filter((l) => l.sens === sens).reduce((n, l) => n + enCentimes(l.montantFc), 0);
  const debit = somme('DEBIT');
  const credit = somme('CREDIT');
  const c422 = compteDuRole('REMUNERATIONS_DUES', referentiel);
  const solde422 = lignes
    .filter((l) => l.compte === c422)
    .reduce((n, l) => n + (l.sens === 'CREDIT' ? enCentimes(l.montantFc) : -enCentimes(l.montantFc)), 0);

  // L'écart d'arrondi ne peut dépasser un centime par bulletin et par ligne
  // retenue · au-delà, ce n'est plus un arrondi, c'est un défaut.
  const ecart = solde422 - sommeDesNets;
  const tolerance = aPasser.length * 3;
  if (Math.abs(ecart) > tolerance) {
    return vide(
      `Le 422 solderait à ${enFrancs(solde422).toFixed(2)} FC quand les bulletins portent ${enFrancs(sommeDesNets).toFixed(2)} FC de net. ` +
        "Un écart de cette taille est un défaut du moteur, jamais un arrondi à rattraper. Rien n'est proposé.",
    );
  }
  if (ecart !== 0) {
    reserves.push(
      `ARRONDI · le solde du 422 (${enFrancs(solde422).toFixed(2)} FC) s'écarte de ${enFrancs(ecart).toFixed(2)} FC de la somme des nets ` +
        "figés sur les bulletins, chaque montant ayant été arrondi au centime. L'écart est montré, pas logé dans un compte.",
    );
  }

  reserves.push(
    "UNE ÉCRITURE POUR LE MOIS · la passation de chaque bulletin est rejouée sur ses chiffres figés, puis additionnée par " +
      "compte. Les trois temps du Guide d'application SYSCOHADA (Partie 1 ch. 3 section 4) sont gardés : brut, retenues, " +
      "charges patronales. L'impôt retenu n'est jamais une charge de l'employeur.",
    "LE PAIEMENT DES SALAIRES EST UNE SECONDE ÉCRITURE · le 422 est débité des paiements par le crédit de la trésorerie, " +
      "dans le journal de banque ou de caisse.",
  );

  return {
    moisDePaie,
    referentiel,
    aPasser: aPasser.map((b) => ({ id: b.id, numero: b.numero, nomComplet: b.nomComplet })),
    dejaPasses,
    annulesApresPassation,
    refus,
    lignes,
    totalDebitFc: enFrancs(debit),
    totalCreditFc: enFrancs(credit),
    equilibree: debit === credit,
    solde422Fc: enFrancs(solde422),
    sommeDesNetsFc: enFrancs(sommeDesNets),
    reserves,
  };
}

/** Le dernier jour du mois de paie, date proposée par défaut. */
export function dernierJourDuMois(moisDePaie: string): string {
  const [a, m] = moisDePaie.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
}
