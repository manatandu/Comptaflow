import { lireDate, lireMontant, type Tableau } from '../import/lecture-fichier';

/**
 * RELEVÉ BANCAIRE IMPORTÉ ET PROPOSITIONS DE RAPPROCHEMENT · moteur pur,
 * sans Prisma, pour qu'il se teste sans base.
 *
 * Sage i7 récupère les extraits « par import avant réconciliation » et
 * rapproche « par tolérance de montant », puis GÉNÈRE une écriture
 * d'ajustement pour le reliquat (skill sage-i7, comptabilite-generale.md).
 * OmegaX retient l'import et s'écarte du reste, pour deux raisons que le dépôt
 * a déjà tranchées ailleurs :
 *
 *  · AUCUNE TOLÉRANCE DE MONTANT. Deux montants voisins ne sont pas la même
 *    opération · une tolérance ferait proposer un virement de 1 000 000 face à
 *    une écriture de 999 800, et l'écart de 200 disparaîtrait dans le
 *    pointage au lieu d'être compris (frais retenus par la banque, erreur de
 *    saisie). Même règle que le pré-lettrage, qui n'apparie que des sommes
 *    exactement égales.
 *  · AUCUNE ÉCRITURE PASSÉE D'OFFICE. Une ligne du relevé sans écriture
 *    (agios, frais, virement reçu non saisi) est rendue « à comptabiliser » ·
 *    son compte de contrepartie est une question de nature que seul le
 *    comptable tranche.
 *
 * Et la proposition n'est jamais posée · « l'une propose, l'autre confirme »,
 * comme le pré-lettrage (CLAUDE.md § 6).
 */

export interface LigneReleveLue {
  rang: number;
  date: Date;
  libelle: string;
  reference: string | null;
  /** Sortie du compte, vue de la BANQUE (colonne Débit du relevé). */
  debit: number;
  /** Entrée sur le compte, vue de la BANQUE (colonne Crédit du relevé). */
  credit: number;
}

export type ChampReleve = 'date' | 'libelle' | 'reference' | 'debit' | 'credit' | 'montant';

/** Retire accents et ponctuation d'un en-tête pour le reconnaître. */
function normaliser(entete: string): string {
  return entete
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * RECONNAÎT LES COLONNES par leur en-tête. Chaque banque exporte à sa façon ;
 * on accepte les intitulés courants et, à défaut, le cabinet désigne les
 * colonnes lui-même (`imposees`). Une « date de valeur » n'est JAMAIS prise
 * pour la date d'opération · c'est la date d'opération qui se confronte à la
 * date de l'écriture.
 */
export function reconnaitreColonnes(
  colonnes: string[],
  imposees: Partial<Record<ChampReleve, string>> = {},
): Partial<Record<ChampReleve, number>> {
  const index: Partial<Record<ChampReleve, number>> = {};
  const normes = colonnes.map(normaliser);
  const chercher = (test: (n: string) => boolean) => {
    const i = normes.findIndex((n, k) => test(n) && !Object.values(index).includes(k));
    return i >= 0 ? i : undefined;
  };
  for (const [champ, nom] of Object.entries(imposees) as [ChampReleve, string][]) {
    const i = colonnes.indexOf(nom);
    if (i >= 0) index[champ] = i;
  }
  index.date ??= chercher((n) => /^date( (d )?operation| op| comptable)?$/.test(n));
  index.debit ??= chercher((n) => /^(debit|debits|retrait|retraits|sortie|sorties|montant debit)$/.test(n));
  index.credit ??= chercher((n) => /^(credit|credits|depot|depots|versement|versements|entree|entrees|montant credit)$/.test(n));
  if (index.debit === undefined && index.credit === undefined) {
    index.montant ??= chercher((n) => /^montant/.test(n));
  }
  index.libelle ??= chercher((n) => /^(libelle|libelles|description|designation|intitule|motif|operation|nature)/.test(n));
  index.reference ??= chercher((n) => /^(reference|ref|n piece|piece|numero|n cheque|cheque)/.test(n));
  return index;
}

/**
 * LIT LES LIGNES DU RELEVÉ. Toute cellule douteuse ARRÊTE l'import, avec la
 * ligne du fichier · même parti que l'import de balance : un relevé amputé
 * d'une opération lue comme zéro se rapprocherait quand même, faux.
 *
 * Montant signé (une seule colonne « Montant ») · NÉGATIF = SORTIE, la
 * convention des exports bancaires. Elle est dite à l'écran.
 */
export function lireReleve(
  tableau: Tableau,
  index: Partial<Record<ChampReleve, number>>,
): { lignes: LigneReleveLue[]; anomalies: string[] } {
  const anomalies: string[] = [];
  if (index.date === undefined) anomalies.push('Colonne de date introuvable (attendu « Date » ou « Date opération »).');
  if (index.debit === undefined && index.credit === undefined && index.montant === undefined) {
    anomalies.push('Colonnes de montant introuvables (attendu « Débit » et « Crédit », ou « Montant »).');
  }
  if (anomalies.length > 0) return { lignes: [], anomalies };

  const lignes: LigneReleveLue[] = [];
  const cell = (ligne: string[], i: number | undefined) => (i === undefined ? '' : (ligne[i] ?? '').trim());
  tableau.lignes.forEach((ligne, k) => {
    const numero = k + 2; // ligne 1 = en-têtes
    if (ligne.every((c) => (c ?? '').trim() === '')) return;
    const date = lireDate(cell(ligne, index.date));
    if (!date) {
      anomalies.push(`Ligne ${numero} : date illisible (« ${cell(ligne, index.date)} »).`);
      return;
    }
    let debit = 0;
    let credit = 0;
    if (index.montant !== undefined) {
      const m = lireMontant(cell(ligne, index.montant));
      if (m === null) {
        anomalies.push(`Ligne ${numero} : montant illisible (« ${cell(ligne, index.montant)} »).`);
        return;
      }
      if (m < 0) debit = -m;
      else credit = m;
    } else {
      const d = lireMontant(cell(ligne, index.debit));
      const c = lireMontant(cell(ligne, index.credit));
      if (d === null || c === null) {
        anomalies.push(`Ligne ${numero} : montant illisible.`);
        return;
      }
      if (d < 0 || c < 0) {
        anomalies.push(`Ligne ${numero} : montant négatif dans une colonne Débit ou Crédit.`);
        return;
      }
      debit = d;
      credit = c;
    }
    if (debit > 0 && credit > 0) {
      anomalies.push(`Ligne ${numero} : une opération porte à la fois un débit et un crédit.`);
      return;
    }
    if (debit === 0 && credit === 0) {
      // Une ligne à zéro est un report de solde ou un titre intercalé · elle
      // ne se rapproche de rien et n'est pas reprise.
      return;
    }
    lignes.push({
      rang: lignes.length + 1,
      date,
      libelle: cell(ligne, index.libelle) || 'Opération bancaire',
      reference: cell(ligne, index.reference) || null,
      debit: arrondi(debit),
      credit: arrondi(credit),
    });
  });
  return { lignes, anomalies };
}

export function arrondi(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * LE SENS, ET C'EST LE PIÈGE CENTRAL. Le relevé est tenu par la BANQUE : un
 * crédit du relevé (argent reçu) est un DÉBIT du compte 52 de l'entité, et
 * inversement. Le montant « vu du compte » est donc crédit − débit du relevé.
 * Comparer débit à débit ferait proposer chaque encaissement face à un
 * décaissement de même montant.
 */
export function montantVuDuCompte(l: { debit: number; credit: number }): number {
  return arrondi(l.credit - l.debit);
}

export interface LigneCompte {
  id: string;
  date: Date;
  reference: string | null;
  debit: number;
  credit: number;
}

export interface Proposition {
  ligneReleveId: string;
  ligneEcritureIds: string[];
  motif: 'REFERENCE' | 'MONTANT_DATE';
}

/**
 * DEUX RÉFÉRENCES DÉSIGNENT LA MÊME PIÈCE quand elles sont égales à la casse
 * et aux espaces près, ou quand leurs CHIFFRES le sont, à trois chiffres au
 * moins. La banque imprime « CHQ 0042 » là où le comptable a saisi « 0042 »,
 * et c'est le numéro du chèque qui fait foi. Sous trois chiffres, « 7 » et
 * « FACT 7 » se rapprocheraient de n'importe quoi.
 */
export function memeReference(a: string | null, b: string | null): boolean {
  const norme = (r: string | null) => (r ?? '').replace(/\s+/g, '').toUpperCase();
  const na = norme(a);
  const nb = norme(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const chiffres = (r: string) => r.replace(/\D/g, '');
  const ca = chiffres(na);
  return ca.length >= 3 && ca === chiffres(nb);
}

/**
 * FENÊTRE DE DATES · convention d'OmegaX, AUCUN texte ne la fixe. Un chèque
 * émis peut n'être présenté que des semaines plus tard ; une fenêtre trop
 * courte ne proposerait rien, trop longue rapprocherait deux loyers. Elle se
 * règle à l'écran et le défaut est dit.
 */
export const FENETRE_JOURS_DEFAUT = 15;

const JOUR_MS = 86_400_000;

/**
 * PROPOSE des correspondances une ligne du relevé pour une ligne du compte.
 *
 *  1. RÉFÉRENCE · même référence non vide ET même montant vu du compte.
 *  2. MONTANT ET DATE · même montant, et UNE SEULE écriture candidate dans la
 *     fenêtre. Deux candidates ou plus = AUCUNE proposition : trois loyers
 *     identiques ne se départagent pas par le logiciel, et choisir « le plus
 *     proche » se tromperait sans le dire. De même, une écriture convoitée
 *     par deux lignes du relevé n'est proposée à aucune.
 *
 * Chaque ligne n'est prise qu'une fois. Les lignes déjà rapprochées ne sont
 * pas passées ici.
 */
export function proposerCorrespondances(
  releve: (LigneReleveLue & { id: string })[],
  compte: LigneCompte[],
  fenetreJours = FENETRE_JOURS_DEFAUT,
): Proposition[] {
  const propositions: Proposition[] = [];
  const prisesCompte = new Set<string>();
  const prisesReleve = new Set<string>();
  const vuDuCompte = (l: LigneCompte) => arrondi(l.debit - l.credit);
  // Passe 1 · référence
  for (const r of releve) {
    if (!r.reference) continue;
    const m = montantVuDuCompte(r);
    const candidates = compte.filter(
      (c) => !prisesCompte.has(c.id) && memeReference(r.reference, c.reference) && vuDuCompte(c) === m,
    );
    if (candidates.length === 1) {
      propositions.push({ ligneReleveId: r.id, ligneEcritureIds: [candidates[0].id], motif: 'REFERENCE' });
      prisesCompte.add(candidates[0].id);
      prisesReleve.add(r.id);
    }
  }

  // Passe 2 · montant et fenêtre de dates, unicité dans les DEUX sens
  const candidatsDe = new Map<string, string[]>();
  for (const r of releve) {
    if (prisesReleve.has(r.id)) continue;
    const m = montantVuDuCompte(r);
    candidatsDe.set(
      r.id,
      compte
        .filter(
          (c) =>
            !prisesCompte.has(c.id) &&
            vuDuCompte(c) === m &&
            Math.abs(c.date.getTime() - r.date.getTime()) <= fenetreJours * JOUR_MS,
        )
        .map((c) => c.id),
    );
  }
  const demandes = new Map<string, number>();
  for (const ids of candidatsDe.values()) for (const id of ids) demandes.set(id, (demandes.get(id) ?? 0) + 1);
  for (const r of releve) {
    const ids = candidatsDe.get(r.id);
    if (!ids || ids.length !== 1) continue;
    if (demandes.get(ids[0]) !== 1) continue;
    propositions.push({ ligneReleveId: r.id, ligneEcritureIds: ids, motif: 'MONTANT_DATE' });
    prisesCompte.add(ids[0]);
  }
  return propositions;
}
