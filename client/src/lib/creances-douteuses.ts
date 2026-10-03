import { montant } from './montants';

/**
 * CRÉANCES DOUTEUSES OU LITIGIEUSES · ce que l'écran calcule pour MONTRER,
 * jamais pour décider (ligne A7). Le serveur rejoue tout et refuse avec son
 * article ; ces fonctions ne font qu'annoncer l'écriture que le clic passera.
 */

export type NatureCreance = 'LITIGIEUSE' | 'DOUTEUSE';

export interface PieceSaisie {
  nature: string;
  reference: string;
  date: string;
}

/** Les comptes que la revue passera, SERVIS par le serveur (relecture « écran », 12). */
export interface ComptesRevue {
  compte491: string;
  dotation: string;
  reprise: string;
}

/**
 * L'écriture de la revue annoncée AVANT le clic · seul l'écart avec la
 * dépréciation en place se passe (fiche du compte 49), et aucune autre
 * donnée n'entre dans le calcul · ni l'âge, ni un pourcentage. Le montant
 * s'écrit par `lib/montants.ts` (relecture adverse, M8). Les comptes sont
 * ceux que le serveur sert pour CETTE créance (le 491 de sa nature), et la
 * date celle qu'il donnera à l'écriture · rien n'est recopié ici.
 */
export function annonceRevue(enPlace: number, necessaire: number | null, comptes: ComptesRevue, dateRevue: string): string | null {
  if (necessaire == null || !Number.isFinite(necessaire)) return null;
  const ecart = Math.round((necessaire - enPlace) * 100) / 100;
  const au = `au ${dateRevue.slice(8, 10)}/${dateRevue.slice(5, 7)}/${dateRevue.slice(0, 4)}`;
  if (ecart > 0) return `Dotation de ${montant(ecart)} · D ${comptes.dotation} / C ${comptes.compte491}, ${au}.`;
  if (ecart < 0) return `Reprise de ${montant(-ecart)} · D ${comptes.compte491} / C ${comptes.reprise}, ${au}.`;
  return 'Dépréciation maintenue · la revue est gardée, aucune écriture.';
}

/**
 * LE MONTANT PRÉREMPLI DANS UN CHAMP (relecture « écran », 11) · arrondi au
 * centime et écrit à deux décimales, point décimal, que `montantSaisi` relit
 * tel quel. `String(0.1 + 0.2)` aurait rempli « 0.30000000000000004 ».
 * `null` laisse le champ vide · vide n'est pas zéro.
 */
export function montantPourChamp(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '';
  return (Math.round(v * 100) / 100).toFixed(2);
}

/**
 * LA DATE D'UN GESTE BORNÉE À L'EXERCICE (relecture « écran », 13) · bornes
 * `min` et `max` du champ ; le serveur refuse de toute façon une date hors de
 * l'exercice.
 */
export function bornesExercice(exercice: { dateDebut: string; dateFin: string } | null | undefined): { min?: string; max?: string } {
  return exercice ? { min: exercice.dateDebut.slice(0, 10), max: exercice.dateFin.slice(0, 10) } : {};
}

/**
 * LE RAPPROCHEMENT D'UNE LISTE TRONQUÉE N'EST PAS CALCULÉ (relecture
 * « échecs silencieux », M6) · le serveur le rend `null`, et l'écran le dit
 * au lieu de se taire, ce qui se lirait comme un écart nul.
 */
export function etatRapprochement(liste: { tronque: boolean; rapprochement: unknown }): 'calcule' | 'non-calcule-tronque' | 'absent' {
  if (liste.rapprochement) return 'calcule';
  return liste.tronque ? 'non-calcule-tronque' : 'absent';
}

/**
 * Le 416 présélectionné pour une créance et une nature · celui que le
 * serveur propose, s'il existe au plan, sinon rien (le choix est demandé).
 */
export function compte416Initial(
  propose: Partial<Record<NatureCreance, string | null>> | undefined,
  nature: NatureCreance,
  comptes416: readonly { id: string; numero: string }[],
): string {
  const racine = propose?.[nature];
  if (racine) return comptes416.find((c) => c.numero.startsWith(racine))?.id ?? '';
  return comptes416.length === 1 ? comptes416[0].id : '';
}

/** Les pièces envoyées · une ligne sans nature ou sans référence est écartée (le serveur exige au moins une pièce). */
export function piecesAEnvoyer(pieces: readonly PieceSaisie[]) {
  return pieces
    .filter((p) => p.nature.trim() && p.reference.trim())
    .map((p) => ({ nature: p.nature.trim(), reference: p.reference.trim(), ...(p.date ? { date: p.date } : {}) }));
}

/**
 * POURQUOI LA LISTE DES 651 EST VIDE, ET QUOI FAIRE (§ 9 ter, relecture
 * adverse M8) · `null` tant qu'elle n'est pas lue, et rien à dire si elle
 * propose quelque chose.
 */
export function motifListe651Vide(comptes: readonly unknown[] | null): string | null {
  if (comptes === null || comptes.length > 0) return null;
  return (
    'Aucun compte 651 retenu au plan · retenez-le (ou ouvrez-le) dans Plan comptable, sous « Pertes sur créances », ' +
    'puis rouvrez ce formulaire.'
  );
}

/** Le motif d'annulation d'une revue, de 3 à 500 caractères (même borne que le serveur). */
export function motifAnnulationValide(motif: string): boolean {
  const m = motif.trim();
  return m.length >= 3 && m.length <= 500;
}

/**
 * LE MOUVEMENT PROPOSÉ À L'ANNULATION (K4) · le plus récent, celui qu'une
 * revue n'a le plus probablement pas encore compté ; le cabinet en choisit un
 * autre dans la modale. `null` sans mouvement.
 */
export function mouvementAAnnulerParDefaut(mouvements: readonly { id: string; date: string }[]): string | null {
  if (mouvements.length === 0) return null;
  // Pas de `.at(-1)` · la cible du client (lib ES2020) ne le connaît pas, et
  // le typage du déploiement l'a refusé (Hosting 634) quand un poste local le
  // laissait passer.
  const tries = [...mouvements].sort((a, b) => a.date.localeCompare(b.date));
  return tries[tries.length - 1].id;
}

/**
 * m5 · LE 491 SE CHOISIT SOUS LA RACINE DE SA NATURE · 4911 pour une créance
 * litigieuse, 4912 pour une douteuse (fiche du compte 49, aux deux plans) ;
 * le serveur refuse toute autre racine. Un choix unique se présélectionne.
 */
export function racine491(nature: NatureCreance): string {
  return nature === 'LITIGIEUSE' ? '4911' : '4912';
}

export function comptes491DeLaNature<T extends { numero: string }>(nature: NatureCreance, comptes: readonly T[]): T[] {
  return comptes.filter((c) => c.numero.startsWith(racine491(nature)));
}

export function compte491Initial(nature: NatureCreance, comptes: readonly { id: string; numero: string }[]): string {
  const possibles = comptes491DeLaNature(nature, comptes);
  return possibles.length === 1 ? possibles[0].id : '';
}

export const LIBELLE_NATURE: Record<NatureCreance, string> = {
  LITIGIEUSE: 'Litigieuse (le client conteste)',
  DOUTEUSE: 'Douteuse (le client se dérobe)',
};

/** Le rapprochement servi par le serveur (A7 ter, m10 · toujours calculé, par agrégat). */
export interface RapprochementCreances {
  provisoire: boolean;
  /** B1 · l'exercice n'a qu'un report à-nouveau PROVISOIRE, qui ne fait pas foi. */
  reportProvisoire?: boolean;
  solde416: number;
  resteModule: number;
  solde491: number;
  depreciationModule: number;
  /** m8 · la part du 491 passée hors du module dans l'EXERCICE (mineur 5, jamais la chaîne), en positif. */
  horsModule491?: number;
}

const auCentime = (x: number) => Math.round(x * 100) / 100;

/**
 * LES ÉCARTS DU RAPPROCHEMENT (A7 ter, m8) · l'écart du 491 se DÉCOMPOSE ·
 * la part passée hors du module (servie), et le reste, qui vient de
 * l'à-nouveau ou d'une écriture du module retouchée. Un écart nu laissait
 * croire que le module se trompait quand un 4912 porte aussi des
 * dépréciations passées à la main.
 */
export function ecartsRapprochement(r: RapprochementCreances) {
  const ecart416 = auCentime(r.solde416 - r.resteModule);
  const ecart491 = auCentime(r.solde491 - r.depreciationModule);
  const horsModule491 = auCentime(r.horsModule491 ?? 0);
  return { ecart416, ecart491, horsModule491, reste491: auCentime(ecart491 - horsModule491) };
}

/**
 * B1 · pourquoi les soldes du rapprochement sont provisoires. Mineur 3 · le
 * module ne lit jamais le report à-nouveau provisoire · le relancer ne change
 * rien, et le libellé ne le propose plus.
 */
export function libelleSoldesProvisoires(r: RapprochementCreances): string | null {
  if (!r.provisoire) return null;
  return r.reportProvisoire
    ? "Soldes du 416 et du 491 provisoires · lus sur l'exercice précédent, le report à-nouveau provisoire n'étant pas lu"
    : 'Soldes du 416 et du 491 provisoires · à-nouveau non passé';
}

/**
 * L'issue du lettrage d'une créance éteinte (A7 ter, B2), servie avec le geste ·
 * `aDesigner` (second tour, B-1) · le reste est à l'à-nouveau, que le cabinet
 * désigne par « Lettrer au 416 ».
 */
export type IssueLettrage416 = { pose: true; code: string } | { pose: false; motif: string; aDesigner?: boolean } | null | undefined;

/** B-1 · ce que « Lettrer au 416 » montre, servi par le serveur. */
export interface PropositionLettrage416 {
  eteinte: boolean;
  compte416: string;
  ouvertes: number;
  aApporter: number;
  aNouveaux: Array<{ id: string; date: string; numeroPiece: number | null; libelle: string | null; montant: number }>;
  tronque: boolean;
  propose: string[];
}

/**
 * B-1 · L'ÉCART qui reste entre ce que l'à-nouveau doit apporter et les lignes
 * cochées · le lettrage ne part qu'à zéro (le serveur pose le groupe SOLDÉ ou
 * pas du tout). Au centime.
 */
export function ecartLettrage416(p: PropositionLettrage416, choisies: ReadonlySet<string>): number {
  const somme = p.aNouveaux.filter((l) => choisies.has(l.id)).reduce((t, l) => t + l.montant, 0);
  return auCentime(p.aApporter - somme);
}

export function messageLettrage416(issue: IssueLettrage416): string | null {
  if (!issue) return null;
  return issue.pose ? `Créance éteinte · ses lignes du 416 sont lettrées (${issue.code}).` : issue.motif;
}
