/**
 * LA FACTURATION DES ABONNEMENTS DE VMG · moteur PUR, ni base ni horloge.
 *
 * Ce que Manasse a décidé le 2026-09-26, et rien de plus : un abonnement PAR
 * DOSSIER client, quatre formules (Essentiel, Standard, Cabinet, option
 * Groupe), la paie en OPTION de l'Essentiel, un paiement mensuel ou annuel,
 * et TRENTE JOURS d'essai gratuit. Les PRIX ne sont pas arrêtés · ils se
 * saisissent dans la console, et une formule sans prix refuse la facture
 * plutôt que de facturer zéro.
 *
 * DEUX CONVENTIONS D'OMEGAX, dites comme telles parce qu'aucun texte ne les
 * fixe :
 *  1. L'ESSAI COUVRE TOUT MOIS QUI COMMENCE AVANT SA FIN. Une période n'est
 *     facturée que si son premier jour tombe à la fin de l'essai ou après ·
 *     un essai qui finit le 15 octobre laisse octobre gratuit. Pas de
 *     prorata : un client qui paie une fraction de mois ne comprend pas sa
 *     facture, et l'écart est à l'avantage du client.
 *  2. L'ANNUEL SE FACTURE AU PREMIER MOIS FACTURABLE, puis tous les douze
 *     mois · jamais de rappel des mois passés.
 */

export const JOURS_ESSAI = 30;

export type TypeFormule = 'FORMULE' | 'OPTION';
export type Periodicite = 'MENSUELLE' | 'ANNUELLE';

export interface FormulePrix {
  code: string;
  libelle: string;
  type: TypeFormule;
  prixMensuelUsd: number | null;
  prixAnnuelUsd: number | null;
}

export interface AbonnementAFacturer {
  formule: FormulePrix;
  options: FormulePrix[];
  /** Nombre d'unités de l'option « dossier supplémentaire » (formule Cabinet). */
  dossiersSupplementaires: number;
  periodicite: Periodicite;
  /** AAAA-MM-JJ */
  debut: string;
  /** AAAA-MM-JJ, ou null sans essai. */
  finEssai: string | null;
  actif: boolean;
}

export interface LigneAFacturer {
  designation: string;
  quantite: number;
  prixUnitaireUsd: number;
}

export type Verdict =
  | { du: true; lignes: LigneAFacturer[]; totalUsd: number }
  | { du: false; motif: string };

export const CODE_DOSSIER_SUPPLEMENTAIRE = 'DOSSIER_SUPPLEMENTAIRE';

/** AAAA-MM-JJ plus n jours, au calendrier (UTC, sans heure). */
export function ajouterJours(jour: string, n: number): string {
  const d = new Date(`${jour}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function finEssaiDepuis(debut: string): string {
  return ajouterJours(debut, JOURS_ESSAI);
}

const moisIndex = (p: string) => Number(p.slice(0, 4)) * 12 + Number(p.slice(5, 7)) - 1;
const periodeDe = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;

/** Le premier mois facturable · celui du début, ou le premier qui commence à la fin de l'essai ou après. */
export function premierePeriodeFacturable(debut: string, finEssai: string | null): string {
  let i = moisIndex(debut.slice(0, 7));
  // Un abonnement qui ne commence pas le 1er ne facture pas son premier mois
  // entamé · même raison que l'essai, pas de prorata.
  if (debut.slice(8, 10) !== '01') i += 1;
  if (finEssai) {
    while (`${periodeDe(i)}-01` < finEssai) i += 1;
  }
  return periodeDe(i);
}

function prixDe(f: FormulePrix, p: Periodicite): number | null {
  return p === 'ANNUELLE' ? f.prixAnnuelUsd : f.prixMensuelUsd;
}

/**
 * Ce que coûte UNE période · refusé en entier dès qu'un seul prix manque, une
 * facture amputée d'une option se lisant comme une facture complète.
 */
export function verdictPeriode(a: AbonnementAFacturer, periode: string): Verdict {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periode)) return { du: false, motif: `Période illisible · ${periode}.` };
  if (!a.actif) return { du: false, motif: 'Abonnement suspendu.' };
  const premiere = premierePeriodeFacturable(a.debut, a.finEssai);
  if (moisIndex(periode) < moisIndex(premiere)) {
    return {
      du: false,
      motif: a.finEssai && `${periode}-01` < a.finEssai ? `En essai jusqu'au ${a.finEssai}.` : `Première période facturable · ${premiere}.`,
    };
  }
  if (a.periodicite === 'ANNUELLE' && (moisIndex(periode) - moisIndex(premiere)) % 12 !== 0) {
    return { du: false, motif: `Abonnement annuel · prochaine échéance en ${periodeDe(moisIndex(premiere) + Math.ceil((moisIndex(periode) - moisIndex(premiere)) / 12) * 12)}.` };
  }
  const suffixe = a.periodicite === 'ANNUELLE' ? `année à compter de ${periode}` : periode;
  const lignes: LigneAFacturer[] = [];
  const manquants: string[] = [];
  const ajouter = (f: FormulePrix, quantite: number) => {
    const prix = prixDe(f, a.periodicite);
    if (prix === null) manquants.push(f.libelle);
    else lignes.push({ designation: `Abonnement OmegaX · ${f.libelle} · ${suffixe}`, quantite, prixUnitaireUsd: prix });
  };
  ajouter(a.formule, 1);
  for (const o of a.options) {
    if (o.code === CODE_DOSSIER_SUPPLEMENTAIRE) continue;
    ajouter(o, 1);
  }
  if (a.dossiersSupplementaires > 0) {
    const supp = a.options.find((o) => o.code === CODE_DOSSIER_SUPPLEMENTAIRE);
    if (!supp) manquants.push('dossier supplémentaire (option non souscrite)');
    else ajouter(supp, a.dossiersSupplementaires);
  }
  if (manquants.length) {
    return { du: false, motif: `Prix ${a.periodicite === 'ANNUELLE' ? 'annuel' : 'mensuel'} non fixé · ${manquants.join(', ')}.` };
  }
  const totalUsd = Math.round(lignes.reduce((s, l) => s + l.quantite * l.prixUnitaireUsd, 0) * 100) / 100;
  return { du: true, lignes, totalUsd };
}

/** Le numéro suivant de la série des factures d'abonnement · continu par année, jamais réutilisé. */
export function numeroFactureSuivant(annee: string, existants: string[]): string {
  const prefixe = `VMG-${annee}-`;
  const max = existants
    .filter((n) => n.startsWith(prefixe))
    .map((n) => Number.parseInt(n.slice(prefixe.length), 10))
    .filter(Number.isInteger)
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefixe}${String(max + 1).padStart(4, '0')}`;
}

/**
 * LA LICENCE SUIT L'ABONNEMENT · troisième convention d'OmegaX, dite comme
 * telle. Le client dispose de QUINZE JOURS après la fin de l'essai, puis
 * après la fin de chaque période payée, pour régler la facture suivante ;
 * passé ce délai sans paiement déclaré, la licence expire et l'accès se
 * ferme par la règle ordinaire de `LicenceService` (« Abonnement expiré »).
 * Aucun courriel, aucun clic n'est nécessaire pour couper · et un paiement
 * déclaré rouvre aussitôt.
 */
export const DELAI_PAIEMENT_JOURS = 15;

/** Dernier jour de la période couverte · le mois, ou les douze mois d'un annuel. */
export function finPeriodeCouverte(periode: string, periodicite: Periodicite): string {
  const i = moisIndex(periode) + (periodicite === 'ANNUELLE' ? 12 : 1);
  return ajouterJours(`${periodeDe(i)}-01`, -1);
}

/** L'échéance posée à la souscription · fin de l'essai (ou début) plus le délai de paiement. */
export function expirationInitiale(debut: string, finEssai: string | null): string {
  return ajouterJours(finEssai ?? debut, DELAI_PAIEMENT_JOURS);
}

/** L'échéance après un paiement · jamais reculée, un paiement tardif d'une vieille période ne raccourcit rien. */
export function expirationApresPaiement(periode: string, periodicite: Periodicite, actuelle: string | null): string {
  const nouvelle = ajouterJours(finPeriodeCouverte(periode, periodicite), DELAI_PAIEMENT_JOURS);
  return actuelle && actuelle > nouvelle ? actuelle : nouvelle;
}

/** Jours écoulés depuis l'émission d'une facture impayée, au calendrier. */
export function joursDepuis(emiseLe: string, aujourdhui: string): number {
  return Math.round((Date.parse(`${aujourdhui}T00:00:00Z`) - Date.parse(`${emiseLe}T00:00:00Z`)) / 86_400_000);
}
