import { dateDeLaPiece, fenetreDeSaisie, rangBorne } from './saisie-par-piece';

const exercice = { dateDebut: '2026-01-01T00:00:00.000Z', dateFin: '2026-12-31T00:00:00.000Z' };

describe('Saisie par pièce', () => {
  it("lit l'exercice entier par pièce, le mois ouvert sinon", () => {
    expect(fenetreDeSaisie(true, null, exercice)).toEqual({ debut: '2026-01-01', fin: '2026-12-31' });
    expect(fenetreDeSaisie(false, { annee: 2026, mois: 1 }, exercice)).toEqual({ debut: '2026-02-01', fin: '2026-02-28' });
    expect(fenetreDeSaisie(false, null, exercice)).toBeNull();
  });

  it('prend la date saisie en entier par pièce, et refuse une date hors exercice', () => {
    const base = { parPiece: true, periode: null, jour: 1, exercice };
    expect(dateDeLaPiece({ ...base, datePiece: '2026-07-14' })).toEqual({ date: '2026-07-14' });
    expect(dateDeLaPiece({ ...base, datePiece: '2027-01-02' })).toEqual({ motif: expect.stringMatching(/hors de l'exercice/) });
    expect(dateDeLaPiece({ ...base, datePiece: '' })).toEqual({ motif: expect.stringMatching(/date de la pièce/) });
  });

  it('borne le jour au mois ouvert en saisie des journaux, comme avant', () => {
    expect(
      dateDeLaPiece({ parPiece: false, datePiece: '', periode: { annee: 2026, mois: 1 }, jour: 31, exercice }),
    ).toEqual({ date: '2026-02-28' });
  });

  it('ne laisse jamais un rang de pièce hors de la liste', () => {
    expect(rangBorne(5, 3)).toBe(2);
    expect(rangBorne(-1, 3)).toBe(0);
    expect(rangBorne(4, 0)).toBe(0);
  });
});

// LE CÂBLAGE · la règle pure est juste, encore faut-il que la fenêtre de
// saisie l'appelle. On gèle une PRÉSENCE, jamais une absence de mot.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Saisie par pièce · câblage dans la fenêtre de saisie', () => {
  const src = readFileSync(join(__dirname, '..', 'pages', 'SaisiePage.tsx'), 'utf8');
  it('lit sa fenêtre et sa date par les règles pures, et fait défiler une pièce à la fois', () => {
    expect(src).toMatch(/fenetreDeSaisie\(parPiece, periode, exerciceCourant\)/);
    expect(src).toMatch(/dateDeLaPiece\(\{ parPiece, datePiece, periode, jour, exercice: exerciceCourant \}\)/);
    expect(src).toMatch(/parPiece \? ecritures\.slice\(rangAffiche, rangAffiche \+ 1\) : ecritures/);
    expect(src).toMatch(/ecrituresAffichees\.map/);
  });
});
