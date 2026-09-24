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

export const RESERVE_MODELE =
  "Ce bulletin porte les montants calculés par OmegaX. Il n'est pas certifié conforme au modèle annexé à l'arrêté " +
  "de 2008, dont OmegaX ne vérifie pas la mise en forme (voir le livre de paie).";

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
 * Comparaison au JOUR : l'heure d'émission n'est pas celle du guichet.
 */
export function motifRefusRemise(remisLe: Date, emisLe: Date, maintenant: Date): string | null {
  const jour = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  if (Number.isNaN(remisLe.getTime())) return 'Date de remise illisible.';
  if (jour(remisLe) < jour(emisLe)) return "La remise ne peut pas précéder l'émission du bulletin.";
  if (jour(remisLe) > jour(maintenant)) return "La remise ne se déclare pas à l'avance · elle atteste un fait.";
  return null;
}
