import { jourDeKinshasa, jourUtc } from '../../common/echeance';

/**
 * P8 · LE BULLETIN DE PAIE ÉMIS.
 *
 * ────────────────────────────────────────────────────────────────────────
 * CE QUE LES TEXTES DISENT, VERBATIM.
 *
 * CODE DU TRAVAIL, ART. 103 · « L'employeur est tenu de remettre au
 * travailleur AU MOMENT DU PAIEMENT […] un décompte écrit de la rémunération
 * payée. Faute par l'employeur d'avoir rempli cette obligation, ses
 * allégations concernant le décompte des paiements effectués SONT REJETÉES »
 * (sauf faute du travailleur, preuve écrite ou aveu).
 *
 * CODE DU TRAVAIL, ART. 214 · « Le livre de paie se compose de feuilles
 * NUMÉROTÉES DE MANIÈRE CONTINUE, chacune d'elles comportant au moins deux
 * doubles détachables ».
 *
 * ARRÊTÉ n° 12/CAB.MIN/ETPS/042 DU 8 AOÛT 2008, ART. 2 · « L'employeur doit,
 * À CHAQUE PAIE, remettre au travailleur un bulletin de paie écrit de la
 * rémunération payée, constitué par un des doubles du livre de paie prévus à
 * l'article 214 du Code du Travail. »
 *
 * MÊME ARRÊTÉ, ART. 4 · « Quelle que soit la forme adoptée, le livre de paie et
 * le décompte écrit de la rémunération payée sont rédigés à l'encre ou à l'aide
 * d'un procédé permettant d'obtenir une ÉCRITURE INDÉLÉBILE. »
 * ────────────────────────────────────────────────────────────────────────
 *
 * CE QUE CES QUATRE PHRASES FONT AU MODÈLE.
 *
 *  · LA NUMÉROTATION EST CONTINUE ET NE SE RÉUTILISE JAMAIS (art. 214). Un
 *    bulletin annulé garde son numéro · le rendre refermerait le trou, et un
 *    livre dont les feuilles se renumérotent ne prouve plus qu'aucune n'a été
 *    arrachée.
 *  · UN BULLETIN ÉMIS NE SE MODIFIE PAS (art. 4). Il n'existe aucune route de
 *    modification. Une erreur se corrige par une ANNULATION MOTIVÉE, qui laisse
 *    la ligne en place, puis par un nouveau bulletin · exactement la facture
 *    barrée et conservée de la note de crédit (I3).
 *  · LA DATE DE REMISE SE DÉCLARE (art. 103). C'est elle qui rend le décompte
 *    opposable, et aucun livre ne la porte : le cabinet l'écrit, jamais dans
 *    le futur, jamais avant l'émission.
 *
 * TROIS REFUS D'ÉMETTRE, et chacun protège la même chose : un décompte remis
 * au travailleur est un document que l'employeur ne peut plus contester
 * (art. 103). Un chiffre provisoire y devient un chiffre opposable.
 *  · un montant que le moteur n'a pas su calculer (barème hors période, impôt
 *    en abstention, cotisation en abstention, net indéterminé) ;
 *  · aucun contrat en cours sur le mois · la paie est l'exécution d'un
 *    contrat, et le bulletin doit dire lequel ;
 *  · un second bulletin actif pour le même salarié et le même mois. Ce refus-là
 *    n'est PAS une règle du Code, qui dit « à chaque paie » et admet une paie
 *    infra-mensuelle. C'est une LIMITE DU MOTEUR, déclarée : la retenue de
 *    l'article 119 est calculée sur le revenu du MOIS annualisé ; deux
 *    bulletins d'un même mois seraient annualisés chacun de leur côté, et
 *    l'impôt progressif serait faux sans qu'aucun des deux ne le montre.
 *
 * CE QUE LE BULLETIN NE PRÉTEND PAS. Il n'est pas certifié conforme au modèle
 * annexé à l'arrêté de 2008 · même réserve que `livre-de-paie.ts`, qui ne
 * certifie jamais une mise en forme qu'il ne peut pas vérifier. Il ne passe
 * aucune écriture À L'ÉMISSION : ses chiffres figés servent ensuite à la paie
 * du mois, passée en une écriture pour tous les bulletins (P9,
 * `comptabilisation-paie.ts`).
 */

export const TEXTE_ARTICLE_103 =
  "Code du travail, art. 103 · le décompte écrit se remet « au moment du paiement ». Sans lui, les allégations de " +
  "l'employeur sur les paiements effectués « sont rejetées ».";

export const TEXTE_NUMEROTATION =
  "Code du travail, art. 214 · « feuilles numérotées de manière continue ». Un bulletin annulé garde son numéro.";

export const TEXTE_INALTERABILITE =
  "Arrêté n° 12/CAB.MIN/ETPS/042 du 8 août 2008, art. 4 · écriture « indélébile ». Un bulletin émis ne se modifie " +
  "pas : il s'annule avec un motif, et un nouveau bulletin le remplace.";

export const LIMITE_UN_BULLETIN_PAR_MOIS =
  "Limite d'OmegaX, pas du Code · la retenue de l'article 119 se calcule sur le revenu du mois annualisé. Deux " +
  "bulletins d'un même mois seraient annualisés séparément et l'impôt progressif serait faux. La paie " +
  "infra-mensuelle n'est pas traitée : un seul bulletin actif par salarié et par mois.";

/**
 * LE BULLETIN EST UN DOUBLE DU LIVRE DE PAIE (arrêté de 2008, art. 2), et le
 * modèle lui impose trente-trois énonciations (art. 1er) · l'arrêté
 * n° 142/2018, art. 10 et 12, en impose au « bordereau ou bulletin de paie »
 * trente-trois autres, presque les mêmes (livre-de-paie.ts). RESERVE_MODELE ne
 * mettait en doute que la MISE EN FORME, ce qui laissait lire les
 * énonciations complètes (passe D2). `enonciationsDuBulletin` dit, rang par
 * rang du modèle de 2008, lesquelles le bulletin porte, avec leur valeur, et
 * nomme les autres · sans rien certifier.
 */
export type EnonciationPortee = { readonly rang: number; readonly valeur: string };

type BulletinLu = {
  matricule: string | null;
  nomComplet: string;
  emploi: string | null;
  categorieProfessionnelle: string | null;
  numeroAffiliationCnss: string | null;
  entree: unknown;
  calcul: unknown;
};

const RANGS_DU_MODELE = 33;

const nombreOuNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const UNITES: Record<string, string> = { JOUR: 'jour', SEMAINE: 'semaine', MOIS: 'mois', ANNEE: 'an' };

export function enonciationsDuBulletin(b: BulletinLu): { portees: EnonciationPortee[]; nonPortees: number[] } {
  const entree = (b.entree ?? {}) as Record<string, unknown>;
  const calcul = (b.calcul ?? {}) as Record<string, unknown>;
  const portees: EnonciationPortee[] = [];
  portees.push({ rang: 1, valeur: b.matricule ?? 'non attribué' });
  portees.push({ rang: 2, valeur: b.nomComplet });
  if (b.emploi) portees.push({ rang: 3, valeur: [b.emploi, b.categorieProfessionnelle].filter(Boolean).join(' · ') });
  if (b.numeroAffiliationCnss) portees.push({ rang: 4, valeur: b.numeroAffiliationCnss });
  // Mention 5 · le salaire du contrat, figé à l'émission. Un bulletin émis
  // avant la passe D2 ne le porte pas, et il le dit.
  const contrat = (calcul.contrat ?? null) as Record<string, unknown> | null;
  const base = nombreOuNull(contrat?.remunerationBase);
  const periode = typeof contrat?.periodiciteRemuneration === 'string' ? contrat.periodiciteRemuneration : null;
  if (base !== null && periode !== null) {
    const devise = typeof contrat?.deviseRemuneration === 'string' ? contrat.deviseRemuneration : 'monnaie non déclarée';
    portees.push({ rang: 5, valeur: `${base} ${devise} par ${UNITES[periode] ?? periode}` });
  }
  // Mention 6 · les jours payés à 100 %, déclarés, ou le mois entier que la
  // simulation a retenu faute de déclaration (26, décret n° 25/22, art. 7).
  const jours = nombreOuNull(entree.joursPayes);
  portees.push({ rang: 6, valeur: jours !== null ? `${jours} jour(s)` : '26 jours (mois entier, jours non déclarés)' });
  const cotisations = ((calcul.cotisations as { lignes?: { cle: string; montantFc: number }[] } | undefined)?.lignes ?? []);
  const pension = cotisations.find((l) => l.cle === 'cnss-pension-travailleur');
  if (pension) portees.push({ rang: 21, valeur: String(pension.montantFc) });
  const irpp = (calcul.retenue as { retenueFc?: number } | null | undefined)?.retenueFc;
  if (typeof irpp === 'number') portees.push({ rang: 25, valeur: String(irpp) });
  const enfants = nombreOuNull(entree.enfantsBeneficiairesAllocations);
  if (enfants !== null) portees.push({ rang: 27, valeur: String(enfants) });
  const taux = nombreOuNull(calcul.tauxJournalierAllocationsFamilialesFc);
  if (taux !== null) portees.push({ rang: 29, valeur: `${taux} FC par jour et par enfant` });
  const net = nombreOuNull((calcul.net as { netAPayerFc?: unknown } | undefined)?.netAPayerFc);
  if (net !== null) portees.push({ rang: 31, valeur: String(net) });
  const assiette = nombreOuNull((calcul.assiettes as { assietteSocialeFc?: unknown } | undefined)?.assietteSocialeFc);
  if (assiette !== null) portees.push({ rang: 32, valeur: String(assiette) });
  const rangsPortes = new Set(portees.map((p) => p.rang));
  const nonPortees = Array.from({ length: RANGS_DU_MODELE }, (_, i) => i + 1).filter((r) => !rangsPortes.has(r));
  return { portees, nonPortees };
}

export const RESERVE_MODELE =
  "Ce bulletin porte les montants calculés par OmegaX. Il n'est pas certifié conforme au modèle annexé à l'arrêté " +
  "de 2008, dont OmegaX ne vérifie pas la mise en forme, ni aux trente-trois énonciations de ce modèle et de " +
  "l'arrêté n° 142/2018, art. 12, dont il ne porte qu'une partie · celles qu'il ne porte pas sont nommées " +
  "(voir le livre de paie).";

const FORME_MOIS = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function moisValide(mois: string): boolean {
  return FORME_MOIS.test(mois);
}

/** Premier et dernier instant du mois, en UTC, comme les dates du registre. */
export function bornesDuMois(mois: string): { debut: Date; fin: Date } {
  const m = FORME_MOIS.exec(mois);
  if (!m) throw new Error(`Mois de paie illisible : ${mois}`);
  const annee = Number(m[1]);
  const index = Number(m[2]) - 1;
  return {
    debut: new Date(Date.UTC(annee, index, 1)),
    fin: new Date(Date.UTC(annee, index + 1, 1) - 1),
  };
}

export type ContratCandidat = {
  id: string;
  dateEntreeEnVigueur: Date;
  dateFin: Date | null;
};

/**
 * Le contrat en cours sur le mois · entré en vigueur au plus tard le dernier
 * jour, pas terminé avant le premier. S'il y en a plusieurs (un CDD renouvelé
 * en cours de mois), le PLUS RÉCENT, qui est celui sous lequel la paie du mois
 * se termine.
 */
export function contratCouvrantLeMois<T extends ContratCandidat>(contrats: readonly T[], mois: string): T | null {
  const { debut, fin } = bornesDuMois(mois);
  const couvrants = contrats.filter(
    (c) => c.dateEntreeEnVigueur.getTime() <= fin.getTime() && (!c.dateFin || c.dateFin.getTime() >= debut.getTime()),
  );
  if (couvrants.length === 0) return null;
  return [...couvrants].sort((a, b) => b.dateEntreeEnVigueur.getTime() - a.dateEntreeEnVigueur.getTime())[0];
}

/** Ce que l'émission lit de la simulation · la forme rendue par `simulerPaie`. */
export type SimulationEmissible = {
  baremeApplicable: boolean;
  motifBaremeInapplicable: string | null;
  retenue: { retenueFc: number } | null;
  cotisations: {
    totalEmployeurFc: number;
    totalTravailleurFc: number;
    abstentions: readonly string[];
  };
  net: { totalVerseFc: number; netAPayerFc: number | null };
  assiettes: { assietteSocialeFc: number | null };
};

/**
 * Les raisons de NE PAS émettre. Une liste vide seulement quand chaque montant
 * que le bulletin affichera a été calculé · aucun zéro par défaut, un zéro sur
 * un décompte remis au travailleur se lit « rien n'est dû ».
 */
export function motifsRefusEmission(s: SimulationEmissible): string[] {
  const motifs: string[] = [];
  if (!s.baremeApplicable) {
    motifs.push(`Barème de l'impôt inapplicable à ce mois · ${s.motifBaremeInapplicable ?? 'motif non précisé'}`);
  }
  if (s.retenue === null) {
    motifs.push("Retenue de l'article 119 non chiffrée · le bulletin ne peut pas porter un impôt provisoire.");
  }
  for (const a of s.cotisations.abstentions) motifs.push(`Cotisation non chiffrée · ${a}`);
  if (s.assiettes.assietteSocialeFc === null) {
    motifs.push("Assiette sociale indéterminée · aucune cotisation ne peut s'y asseoir.");
  }
  if (s.net.netAPayerFc === null) motifs.push('Net à payer indéterminé.');
  return motifs;
}

/**
 * LES CHIFFRES QUE LE DOUBLE FIGE, ou les raisons de ne pas le figer (A8, i).
 * Rejoué par le seul endroit qui écrit (`figerBulletin`) · un `?? 0` y
 * figerait un net, une assiette ou un impôt que personne n'a calculé.
 */
export function chiffresFigeables(
  s: SimulationEmissible,
): { assietteSocialeFc: number; netAPayerFc: number; irppFc: number } | { motifs: string[] } {
  const motifs = motifsRefusEmission(s);
  const assietteSocialeFc = s.assiettes.assietteSocialeFc;
  const netAPayerFc = s.net.netAPayerFc;
  const irppFc = s.retenue === null ? null : s.retenue.retenueFc;
  if (motifs.length > 0 || assietteSocialeFc === null || netAPayerFc === null || irppFc === null) {
    return { motifs: motifs.length > 0 ? motifs : ['Un montant du document est indéterminé.'] };
  }
  return { assietteSocialeFc, netAPayerFc, irppFc };
}

/**
 * Mention 2 de l'arrêté de 2008 · « les noms et prénoms du travailleur, EN
 * MAJUSCULES D'IMPRIMERIE ». Le post-nom, usage congolais que l'art. 212 du
 * Code nomme, est gardé à sa place.
 */
export function nomCompletMajuscules(s: { nom: string; postNom: string | null; prenoms: string | null }): string {
  return [s.nom, s.postNom, s.prenoms]
    .filter((x): x is string => !!x && x.trim() !== '')
    .map((x) => x.trim())
    .join(' ')
    .toLocaleUpperCase('fr-FR');
}

/**
 * La date de remise déclarée · ni avant l'émission (le décompte n'existait
 * pas), ni dans le futur (ce serait attester une remise qui n'a pas eu lieu).
 * Comparaison au JOUR, et au JOUR DE KINSHASA pour les deux instants (audit
 * final F113) · lus en UTC, entre minuit et une heure une remise faite le jour
 * même était refusée comme future. La date déclarée est un jour saisi, à
 * minuit UTC.
 */
export function motifRefusRemise(remisLe: Date, emisLe: Date, maintenant: Date): string | null {
  if (Number.isNaN(remisLe.getTime())) return 'Date de remise illisible.';
  const remis = jourUtc(remisLe).getTime();
  if (remis < jourDeKinshasa(emisLe).getTime()) return "La remise ne peut pas précéder l'émission du bulletin.";
  if (remis > jourDeKinshasa(maintenant).getTime()) return "La remise ne se déclare pas à l'avance · elle atteste un fait.";
  return null;
}
