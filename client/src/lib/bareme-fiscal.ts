/**
 * Barème fiscal d'amortissement · arrêté n° 013/CAB/MIN/FINANCES/2025 du
 * 19 février 2025, pris en exécution de la loi n° 23/053, art. 28, al. 1er.
 *
 * L'écran ne recopie AUCUNE ligne du barème · il le lit à
 * GET /immobilisations/bareme-fiscal, servi depuis la table engendrée du
 * serveur. Une seconde copie ici divergerait de la première au premier
 * correctif, sans qu'aucun total ne le dise.
 *
 * Ce module ne refuse RIEN. La durée comptable est l'estimation de la durée
 * d'utilité par l'entité (AUDCIF art. 45) ; le barème est une règle FISCALE.
 * L'écart se signale, avec son article, et la saisie passe.
 */

/** Une ligne du barème, telle que le serveur la sert. */
export interface NatureBaremeFiscal {
  cle: string;
  section: string;
  intituleSection: string;
  numero: number;
  designation: string;
  dureeAns: number;
  taux: number;
}

/**
 * Entrée en vigueur de l'arrêté · art. 6, « le 1er janvier 2026 ». Un
 * exercice clos avant ne se voit pas opposer un barème qui n'existait pas
 * encore (deuxième piège du dépôt, § 10 bis).
 */
export const ENTREE_EN_VIGUEUR_BAREME = '2026-01-01';

/** Les lignes regroupées par section, dans l'ordre servi, pour un select. */
export function sectionsDuBareme(
  bareme: NatureBaremeFiscal[],
): { section: string; intitule: string; lignes: NatureBaremeFiscal[] }[] {
  const groupes: { section: string; intitule: string; lignes: NatureBaremeFiscal[] }[] = [];
  for (const n of bareme) {
    let g = groupes.find((x) => x.section === n.section);
    if (!g) {
      g = { section: n.section, intitule: n.intituleSection, lignes: [] };
      groupes.push(g);
    }
    g.lignes.push(n);
  }
  return groupes;
}

/**
 * L'avertissement d'écart entre la durée saisie et celle du barème, ou null.
 *
 * Trois silences, chacun voulu · aucune nature choisie (rien à comparer),
 * durée égale ou illisible (rien à dire), exercice clos avant l'entrée en
 * vigueur de l'arrêté (art. 6). La date de fin d'exercice inconnue ne tait
 * rien · le barème est en vigueur pour tout exercice ouvert aujourd'hui.
 */
export function avertissementEcartBareme(
  dureeSaisie: number | null,
  nature: NatureBaremeFiscal | null | undefined,
  finExercice: string | null | undefined,
): string | null {
  if (!nature) return null;
  if (dureeSaisie == null || !Number.isFinite(dureeSaisie) || dureeSaisie <= 0) return null;
  if (dureeSaisie === nature.dureeAns) return null;
  if (finExercice && finExercice.slice(0, 10) < ENTREE_EN_VIGUEUR_BAREME) return null;

  const reference = `${nature.designation} · ${nature.dureeAns} ans, taux ${String(nature.taux).replace('.', ',')} % (arrêté n° 013/CAB/MIN/FINANCES/2025, art. 2)`;
  if (dureeSaisie < nature.dureeAns) {
    return (
      `Durée saisie plus courte que le barème fiscal (${reference}). ` +
      `Un taux supérieur n'est admis que si l'entreprise en justifie les circonstances lors du contrôle, sous peine de rejet (art. 4).`
    );
  }
  return (
    `Durée saisie plus longue que le barème fiscal (${reference}) · ` +
    `la dotation comptable reste en deçà du taux linéaire de l'arrêté.`
  );
}
