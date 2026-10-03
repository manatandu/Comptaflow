import { StatutExercice } from '@prisma/client';
import { ExerciceService } from '../exercice/exercice.service';
import { ecartsRealisesNonConstates, motifClotureEcartsNonConstates } from './ecarts-non-constates';

/**
 * DÉCISION D3 (2026-10-03, « réfère-toi à la loi ») · AUDCIF art. 55 · « à la
 * date de règlement [...] les pertes et gains de change à cette date SONT
 * CONSTATÉS ». Un lettrage dénoué dans sa devise dont l'écart n'est pas passé
 * ne bloque PAS la réévaluation (il en est déjà écarté, art. 54) · il bloque
 * la CLÔTURE, par un refus qui nomme groupes, comptes, montants et l'issue.
 *
 * Le jeu du séminaire · facture de 1 160 USD à 1 680 (1 948 800), 600 USD
 * réglés au coût historique, le solde de 560 USD payé à 1 900 (1 064 000) ·
 * soldé en devise, 123 200 de perte en souffrance.
 */
const ligne = (lettrageId: string, code: string, numero: string, debit: number, credit: number, montantDevise: number | null) => ({
  lettrageId,
  debit,
  credit,
  deviseId: montantDevise === null ? null : 'usd',
  montantDevise,
  lettrage: { code, compte: { numero } },
});
const groupeEnSouffrance = [
  ligne('L', 'A', '40110000', 0, 1_948_800, 1160),
  ligne('L', 'A', '40110000', 1_008_000, 0, 600),
  ligne('L', 'A', '40110000', 1_064_000, 0, 560),
];
// Un partiel qui n'est pas soldé dans sa devise · il reste à régler, rien n'est dû au résultat.
const partielOuvert = [ligne('M', 'B', '41110000', 1_948_800, 0, 1160), ligne('M', 'B', '41110000', 0, 1_050_000, 600)];

describe('les écarts de change réalisés non constatés d’un exercice', () => {
  it('le groupe soldé en devise et non en francs est nommé · le partiel encore ouvert ne l’est pas', async () => {
    const findMany = jest.fn().mockResolvedValue([...groupeEnSouffrance, ...partielOuvert]);
    const r = await ecartsRealisesNonConstates({ ligneEcriture: { findMany } } as never, { tenantId: 't', exerciceId: 'n' });
    expect(r).toEqual({ ecarts: [{ lettrageId: 'L', code: 'a', compteNumero: '40110000', ecart: 123_200 }], tronque: false });
    // La requête · groupes PARTIELS, lignes non lettrées, de CET exercice, bornée.
    expect(findMany.mock.calls[0][0].where).toEqual({
      lettrageId: { not: null },
      lettre: null,
      lettrage: { statut: 'PARTIEL' },
      ecriture: { tenantId: 't', exerciceId: 'n' },
    });
    expect(findMany.mock.calls[0][0].take).toBeGreaterThan(0);
  });

  it('le refus nomme le compte, le groupe, le montant, l’article et l’issue', () => {
    const motif = motifClotureEcartsNonConstates({ ecarts: [{ lettrageId: 'L', code: 'a', compteNumero: '40110000', ecart: 123_200 }], tronque: false });
    expect(motif).toMatch(/1 lettrage\(s\) dénoué\(s\).*40110000 lettrage a · perte de 123 200,00.*art\. 55.*« Écart de change »/);
    expect(motifClotureEcartsNonConstates({ ecarts: [], tronque: false })).toBeNull();
    expect(motifClotureEcartsNonConstates({ ecarts: [], tronque: true })).toMatch(/n'a pas pu vérifier/);
  });
});

describe('la clôture refuse un écart réalisé non passé', () => {
  const N = { id: 'n', tenantId: 't', statut: StatutExercice.OUVERT, dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') };
  function monter(lignes: unknown[]) {
    const prisma = {
      exercice: {
        findFirst: jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => Promise.resolve(where.dateFin || where.dateDebut ? null : N)),
      },
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: 'SYSCOHADA' }) },
      ecriture: { count: jest.fn().mockResolvedValue(0) },
      ligneEcriture: { findMany: jest.fn().mockResolvedValue(lignes) },
      $transaction: jest.fn(),
    };
    return { s: new ExerciceService(prisma as never, {} as never), prisma };
  }

  it('un lettrage dénoué en souffrance · refus nommé, rien n’est écrit', async () => {
    const { s, prisma } = monter(groupeEnSouffrance);
    await expect(s.cloturer('t', 'n', 'u')).rejects.toThrow(/40110000 lettrage a · perte de 123 200,00/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
