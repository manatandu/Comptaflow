import type { Referentiel } from './types';

/**
 * Ligne A12 · les emprunts et les charges que l'écran OFFRE pour des intérêts
 * courus, miroir de `src/modules/regularisation/interets-courus.ts` (le
 * serveur résout le compte d'intérêts courus et refuse le reste). Un numéro,
 * deux plans · emprunts au 16 et intérêts au 166 au SYSCOHADA (fiche du
 * compte 16), emprunts au 18 et intérêts au 186 au SYCEBNL (fiche du compte
 * 18), dont le 16 est un fonds. Ni 1681 (rente viagère), ni 184 SYCEBNL (sa
 * fiche n'ouvre aucun 1864), ni dettes de location acquisition.
 */
export function interetsCourusDe(referentiel: Referentiel | undefined, numeroEmprunt: string): string | null {
  if (referentiel === 'SYSCOHADA') {
    if (!/^16[1-578]/.test(numeroEmprunt) || numeroEmprunt.startsWith('1681')) return null;
    return `166${numeroEmprunt[2]}`;
  }
  if (referentiel === 'SYCEBNL') {
    if (!/^18[12358]/.test(numeroEmprunt)) return null;
    return `186${numeroEmprunt[2]}`;
  }
  return null;
}

/** Charges admises · 6711, 6712 (fiche du compte 16), 6741, 6742, 6748 (fiche du compte 67). */
export function chargeInteretsAdmise(numero: string): boolean {
  return ['6711', '6712', '6741', '6742', '6748'].some((r) => numero.startsWith(r));
}

/** La charge proposée, là où l'intitulé du plan nomme la même dette. */
export function chargeInteretsProposee(referentiel: Referentiel | undefined, numeroEmprunt: string): string | null {
  if (!interetsCourusDe(referentiel, numeroEmprunt)) return null;
  const categorie = numeroEmprunt[2];
  if (categorie === '1') return '6711';
  if (categorie === '2') return '6712';
  if (categorie === '3' || categorie === '5') return '6741';
  if (categorie === '4' && referentiel === 'SYSCOHADA') return '6742';
  return null;
}
