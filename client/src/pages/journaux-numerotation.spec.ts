import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * AUDIT FINAL F59 · la fenêtre Codes journaux propose la numérotation que le
 * serveur pose à défaut, et le dit quand la manuelle est choisie · en
 * manuelle, aucune pièce ne reçoit de numéro.
 */
const page = readFileSync(join(__dirname, 'JournauxPage.tsx'), 'utf8');
const serveur = readFileSync(join(__dirname, '../../../src/modules/journaux/numerotation-piece.ts'), 'utf8');

describe('F59 · la numérotation proposée à la création d’un journal', () => {
  it('est celle que le serveur pose à défaut, à l’ouverture comme après une création', () => {
    const defautServeur = /NUMEROTATION_PAR_DEFAUT = NumerotationPiece\.(\w+);/.exec(serveur)?.[1];
    expect(defautServeur).toBe('CONTINUE_JOURNAL');
    expect(page).toContain(`useState<NumerotationPiece>('${defautServeur}')`);
    expect(page).toContain(`setNumerotation('${defautServeur}')`);
  });

  it('la manuelle choisie, l’écran dit que les pièces resteront sans numéro', () => {
    expect(page).toMatch(/numerotation === 'MANUELLE' && \([\s\S]*?resteront sans numéro/);
  });
});
