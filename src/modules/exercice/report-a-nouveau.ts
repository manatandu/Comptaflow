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
  lignes: { debit: number; credit: number; lettre: string | null; libelle: string; dateEcheance: Date | null }[];
}

export interface LigneRan {
  compteId: string;
  debit: number;
  credit: number;
  libelle: string;
  dateEcheance?: Date | null;
}

const EPSILON = 0.005;
const solde = (c: CompteRan) => c.lignes.reduce((s, l) => s + l.debit - l.credit, 0);

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
    lignes.push({
      compteId: c.id,
      debit: s > 0 ? s : 0,
      credit: s < 0 ? -s : 0,
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
