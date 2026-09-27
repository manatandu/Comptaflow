/**
 * REPORT À-NOUVEAU · le calcul, sans Prisma, UNE fois pour deux appelants.
 *
 * La clôture (`ExerciceService.cloturer`) produit le report DÉFINITIF ; le
 * nouvel exercice ouvert avant elle produit un report PROVISOIRE, que Sage
 * i7 permet « à tout moment […] de lancer, voir de relancer » (Traitement /
 * Fin d'exercice / Nouvel exercice). Les deux doivent rendre le même report
 * sur le même livre-journal : un second calcul écrit à part divergerait au
 * premier correctif, et le bilan d'ouverture provisoire ne ressemblerait plus
 * au définitif.
 *
 * La règle est celle du mode de chaque compte (`modeReportANouveau`) :
 * AUCUN (gestion) se solde sur le résultat, SOLDE reporte un solde net,
 * DÉTAIL reporte chaque mouvement NON lettré avec son échéance.
 */

export type ModeRan = 'AUCUN' | 'SOLDE' | 'DETAIL';

export interface CompteRan {
  id: string;
  numero: string;
  intitule: string;
  modeReportANouveau: ModeRan;
  lignes: {
    debit: number;
    credit: number;
    lettre: string | null;
    libelle: string;
    dateEcheance: Date | null;
    /** L'opération en devise de la ligne (audit final F55) · voir `enDevise`. */
    deviseId?: string | null;
    montantDevise?: number | null;
    coursApplique?: number | null;
  }[];
}

export interface LigneRan {
  compteId: string;
  debit: number;
  credit: number;
  libelle: string;
  dateEcheance?: Date | null;
  deviseId?: string;
  montantDevise?: number;
  coursApplique?: number;
}

const EPSILON = 0.005;
const solde = (c: CompteRan) => c.lignes.reduce((s, l) => s + l.debit - l.credit, 0);
const arrondi2 = (x: number) => Math.round(x * 100) / 100;

/**
 * LA DEVISE SUIT LE REPORT (audit final F55) · le report ne recopiait ni la
 * devise ni le montant en devise, et la réévaluation ne lit que l'exercice ·
 * une créance en dollars née en N-1 n'était jamais réévaluée en N, et une
 * banque en dollars ne l'était plus après sa première clôture.
 *
 * En DÉTAIL, chaque ligne reportée garde les trois champs de la ligne
 * d'origine. En SOLDE, le solde se reporte PAR DEVISE · une ligne par devise,
 * au montant en francs et en devise de ses lignes, au cours moyen qu'ils
 * définissent, et une ligne en francs pour le reste (les écarts de
 * réévaluation, passés sans devise, y tombent, et l'extourne à l'ouverture
 * les solde). Une devise dont le solde en francs et le solde en devise ne
 * sont pas de même sens ne se reporte pas en devise · le montant en devise
 * est gardé sans signe et c'est le sens de la ligne qui le donne, si bien
 * qu'aucune ligne ne saurait la porter. Elle reste dans le reste en francs.
 */
function soldesParDevise(c: CompteRan): { deviseId: string; francs: number; devise: number }[] {
  const parDevise = new Map<string, { deviseId: string; francs: number; devise: number }>();
  for (const l of c.lignes) {
    if (!l.deviseId || !l.montantDevise) continue;
    const net = l.debit - l.credit;
    const sens = net >= 0 ? 1 : -1;
    const g = parDevise.get(l.deviseId) ?? { deviseId: l.deviseId, francs: 0, devise: 0 };
    g.francs += net;
    g.devise += sens * l.montantDevise;
    parDevise.set(l.deviseId, g);
  }
  return [...parDevise.values()]
    .map((g) => ({ ...g, francs: arrondi2(g.francs), devise: arrondi2(g.devise) }))
    .filter((g) => Math.abs(g.francs) > EPSILON && Math.abs(g.devise) > EPSILON && Math.sign(g.francs) === Math.sign(g.devise));
}

/** Débit moins crédit des comptes de gestion · positif = déficit, négatif = excédent. */
export function resultatDesComptesDeGestion(comptes: CompteRan[]): number {
  return comptes.filter((c) => c.modeReportANouveau === 'AUCUN').reduce((s, c) => s + solde(c), 0);
}

/**
 * Les lignes du report. `resultat` porte le résultat de l'exercice sur son
 * compte (131 ou 139) · à la clôture c'est l'écriture de clôture qui l'y a
 * mis, au provisoire rien ne l'y a mis encore : dans les deux cas il est
 * ajouté au solde de ce compte, ce qui rend les deux reports identiques.
 */
export function lignesReportANouveau(
  comptes: CompteRan[],
  resultat: { compteId: string; montant: number } | null,
): LigneRan[] {
  const lignes: LigneRan[] = [];
  for (const c of comptes.filter((x) => x.modeReportANouveau === 'SOLDE')) {
    const s = solde(c) + (resultat && c.id === resultat.compteId ? resultat.montant : 0);
    if (Math.abs(s) <= EPSILON) continue;
    let reste = s;
    for (const g of soldesParDevise(c)) {
      lignes.push({
        compteId: c.id,
        debit: g.francs > 0 ? g.francs : 0,
        credit: g.francs < 0 ? -g.francs : 0,
        libelle: `Report à-nouveau ${c.numero} · ${c.intitule} · en devise`,
        deviseId: g.deviseId,
        montantDevise: Math.abs(g.devise),
        coursApplique: Math.round((Math.abs(g.francs) / Math.abs(g.devise)) * 1e6) / 1e6,
      });
      reste -= g.francs;
    }
    reste = arrondi2(reste);
    if (Math.abs(reste) <= EPSILON) continue;
    lignes.push({
      compteId: c.id,
      debit: reste > 0 ? reste : 0,
      credit: reste < 0 ? -reste : 0,
      libelle: `Report à-nouveau ${c.numero} · ${c.intitule}`,
    });
  }
  for (const c of comptes.filter((x) => x.modeReportANouveau === 'DETAIL')) {
    for (const l of c.lignes) {
      if (l.lettre) continue; // seuls les mouvements NON lettrés sont reportés en détail
      lignes.push({
        compteId: c.id,
        debit: l.debit,
        credit: l.credit,
        libelle: `RAN détail ${c.numero} · ${l.libelle}`,
        // L'échéance suit la créance ou la dette qu'elle qualifie (notes 6, 9,
        // 10, 18A, 19 à 21) · voir le commentaire historique de la clôture.
        dateEcheance: l.dateEcheance,
        // Et la devise, avec son montant et son cours (audit final F55).
        ...(l.deviseId && l.montantDevise
          ? {
              deviseId: l.deviseId,
              montantDevise: l.montantDevise,
              ...(l.coursApplique ? { coursApplique: l.coursApplique } : {}),
            }
          : {}),
      });
    }
  }
  return lignes;
}

/**
 * REPORT DES BUDGETS · Sage i7 : « demander le report des budgets sur le
 * nouvel exercice ». Un budget déjà saisi sur l'exercice suivant n'est JAMAIS
 * écrasé · il a été décidé, le report n'en est qu'une proposition. Une
 * section dont la convention s'achève avant le nouvel exercice n'est pas
 * reportée · on ne dote pas un financement terminé.
 */
export function budgetsAReporter(
  budgets: { sectionId: string; mois: number | null; montant: number }[],
  dejaDotes: { sectionId: string; mois: number | null }[],
  sectionsCloses: Set<string>,
): { sectionId: string; mois: number | null; montant: number }[] {
  const pris = new Set(dejaDotes.map((b) => `${b.sectionId}|${b.mois ?? ''}`));
  return budgets.filter((b) => !sectionsCloses.has(b.sectionId) && !pris.has(`${b.sectionId}|${b.mois ?? ''}`));
}
