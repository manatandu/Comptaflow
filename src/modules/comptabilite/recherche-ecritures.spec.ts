import { readFileSync } from 'fs';
import { join } from 'path';
import { filtreRecherche, lireCriteres } from './recherche-ecritures';
import { perimetreJournal } from './ecriture.service';

describe("Recherche d'écritures multicritère", () => {
  it('cherche le compte et le montant sur la MÊME ligne, un seul `some`', () => {
    const f = filtreRecherche({ compte: '401', montantMin: 116000 }) as any;
    expect(f.AND).toHaveLength(1);
    expect(f.AND[0].lignes.some.compte).toEqual({ numero: { startsWith: '401' } });
    expect(f.AND[0].lignes.some.OR).toEqual([
      { debit: { gte: 116000, lte: 116000 } },
      { credit: { gte: 116000, lte: 116000 } },
    ]);
  });

  it('un montant seul est EXACT, au débit ou au crédit ; une borne haute en fait une fourchette', () => {
    const exact = filtreRecherche({ montantMin: 500 }) as any;
    expect(exact.AND[0].lignes.some.OR[0].debit).toEqual({ gte: 500, lte: 500 });
    const plage = filtreRecherche({ montantMin: 500, montantMax: 900 }) as any;
    expect(plage.AND[0].lignes.some.OR[1].credit).toEqual({ gte: 500, lte: 900 });
  });

  it("cherche le libellé de l'écriture ET de ses lignes, la pièce et la référence", () => {
    const f = filtreRecherche({ recherche: 'loyer', numeroPiece: 12, reference: 'FA-1' }) as any;
    expect(f.AND[0].OR[1]).toEqual({ lignes: { some: { libelle: { contains: 'loyer', mode: 'insensitive' } } } });
    expect(f.AND).toContainEqual({ numeroPiece: 12 });
    expect(f.AND).toContainEqual({ reference: { contains: 'FA-1', mode: 'insensitive' } });
    expect(filtreRecherche({})).toEqual({});
  });

  it('refuse un critère illisible au lieu de l’ignorer', () => {
    expect(lireCriteres({ compte: '401A' })).toEqual({ motif: expect.stringMatching(/chiffres/) });
    expect(lireCriteres({ montant: 'abc' })).toEqual({ motif: 'Montant illisible.' });
    expect(lireCriteres({ montantMax: '10' })).toEqual({ motif: expect.stringMatching(/commence par le montant minimal/) });
    expect(lireCriteres({ montant: '10', montantMax: '5' })).toEqual({ motif: expect.stringMatching(/inférieur/) });
    expect(lireCriteres({ numeroPiece: '1.5' })).toEqual({ motif: expect.stringMatching(/entier positif/) });
    expect(lireCriteres({ compte: ' 401 ', montant: '116 000,50' })).toEqual({
      criteres: { compte: '401', montantMin: 116000.5 },
    });
  });

  it('le périmètre du journal porte les critères, pour la fenêtre comme pour son export', () => {
    const w = perimetreJournal('t1', { exerciceId: 'e1', compte: '52' }) as any;
    expect(w.tenantId).toBe('t1');
    expect(w.AND[0].lignes.some.compte).toEqual({ numero: { startsWith: '52' } });
    // Les deux routes appellent la même lecture des critères.
    const racine = join(__dirname, '..');
    expect(readFileSync(join(racine, 'comptabilite', 'ecriture.controller.ts'), 'utf8')).toMatch(
      /criteresOuRefus\(\{ compte, montant, montantMax, numeroPiece, reference \}\)/,
    );
    expect(readFileSync(join(racine, 'exports', 'export.controller.ts'), 'utf8')).toMatch(
      /criteresOuRefus\(\{ compte, montant, montantMax, numeroPiece, reference \}\)/,
    );
  });
});
