import { PayloadTooLargeException } from '@nestjs/common';
import { ExportService } from './export.service';

/**
 * AUDIT FINAL F101 · le grand livre d'un compte et le justificatif de solde
 * bâtissent leur classeur en mémoire, et n'avaient AUCUNE borne · un compte
 * de banque très mouvementé tuait le processus pour tous les cabinets. La
 * borne est la dernière mesure qu'un classeur en mémoire a tenue (50 000
 * lignes, docs/capacite-mesuree.md) ; au-delà, un refus qui dit par où passer.
 */

const LIGNE = { date: new Date('2026-03-01'), journalCode: 'BQ', numeroPiece: 1, libelle: 'x', debit: 1, credit: 0 };

function service(nbLignes: number) {
  const lignes = Array.from({ length: nbLignes }, () => LIGNE);
  const ecritures = {
    grandLivre: jest.fn().mockResolvedValue({ compte: { numero: '52110000', intitule: 'Banque' }, lignes, soldeFinal: 0 }),
    justificatifSolde: jest.fn().mockResolvedValue({ compte: { numero: '52110000', intitule: 'Banque' }, lignes }),
  };
  // Aucune lecture de plus n'est servie · le refus doit tomber AVANT que le
  // classeur ne commence à se bâtir.
  return new ExportService({} as never, ecritures as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
}

describe('F101 · un classeur bâti en mémoire est borné', () => {
  it('le grand livre d’un compte au-delà de 50 000 lignes est refusé, et renvoie au grand livre complet', async () => {
    const refus = service(50_001).grandLivreExcel('t1', 'c1', 'ex');
    await expect(refus).rejects.toBeInstanceOf(PayloadTooLargeException);
    // Le séparateur de milliers de `toLocaleString('fr-FR')` est une espace
    // insécable fine.
    await expect(service(50_001).grandLivreExcel('t1', 'c1', 'ex')).rejects.toThrow(
      /Grand livre du compte 52110000 : 50\s001 lignes/,
    );
    await expect(service(50_001).grandLivreExcel('t1', 'c1', 'ex')).rejects.toThrow('grand livre complet');
  });

  it('le justificatif au-delà de 50 000 lignes est refusé, avec son chemin de rechange', async () => {
    await expect(service(50_001).justificatifSoldeExcel('t1', 'c1', 'ex')).rejects.toThrow(
      "Masquez les lignes lettrées ou choisissez une date d'arrêt antérieure.",
    );
  });

  it('50 000 lignes passent la borne', () => {
    expect(() => (service(0) as any).refuserClasseurEnMemoire(50_000, 'x', 'y')).not.toThrow();
    expect(() => (service(0) as any).refuserClasseurEnMemoire(50_001, 'x', 'y')).toThrow(PayloadTooLargeException);
  });
});
