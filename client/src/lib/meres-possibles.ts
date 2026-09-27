/**
 * LES MÈRES QU'UN DOSSIER PEUT RECEVOIR · la même règle que le serveur
 * (`PlateformeService.verifierMere`), pour que l'écran ne propose jamais une
 * mère que la création refuserait (audit final F47). Un seul niveau de groupe,
 * le même référentiel, sous le SYSCOHADA le même système comptable, et jamais
 * le dossier de l'éditeur, dont la licence ne se reflète sur aucune cellule.
 */
export interface DossierMerePossible {
  id: string;
  referentiel: string;
  systemeComptableSyscohada: string | null;
  dossierMere: { id: string } | null;
  licence: { type: string } | null;
}

export function meresPossibles<T extends DossierMerePossible>(
  liste: T[],
  fille: { saufId?: string; referentiel: string; systemeComptableSyscohada: string | null },
): T[] {
  const systeme = (s: string | null) => s ?? 'NORMAL';
  return liste.filter(
    (c) =>
      !c.dossierMere &&
      c.id !== fille.saufId &&
      c.licence?.type !== 'PROPRIETAIRE' &&
      c.referentiel === fille.referentiel &&
      (c.referentiel !== 'SYSCOHADA' || systeme(c.systemeComptableSyscohada) === systeme(fille.systemeComptableSyscohada)),
  );
}
