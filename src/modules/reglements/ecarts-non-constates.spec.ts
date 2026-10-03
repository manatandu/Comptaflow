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
let n = 0;
const ligne = (lettrageId: string, code: string, numero: string, debit: number, credit: number, montantDevise: number | null) => ({
  id: `l${String(++n).padStart(4, '0')}`,
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
    const findMany = jest.fn().mockResolvedValueOnce([...groupeEnSouffrance, ...partielOuvert]).mockResolvedValue([]);
    const r = await ecartsRealisesNonConstates({ ligneEcriture: { findMany } } as never, { tenantId: 't', exerciceId: 'n' });
    expect(r).toEqual({ ecarts: [{ lettrageId: 'L', code: 'a', compteNumero: '40110000', ecart: 123_200 }] });
    // La requête · groupes PARTIELS, lignes non lettrées, de CET exercice, bornée.
    expect(findMany.mock.calls[0][0].where).toEqual({
      lettrageId: { not: null },
      lettre: null,
      lettrage: { statut: 'PARTIEL' },
      ecriture: { tenantId: 't', exerciceId: 'n' },
    });
    expect(findMany.mock.calls[0][0].take).toBeGreaterThan(0);
  });

  // M4 · LU PAR TRANCHES, sans borne · un groupe coupé entre deux tranches se
  // recompose, et aucun refus pour volume.
  it('par tranches · un groupe coupé entre deux tranches se recompose, le curseur avance', async () => {
    const [a, b, c] = groupeEnSouffrance;
    const findMany = jest
      .fn()
      .mockImplementationOnce(async ({ take }: { take: number }) => [a, ...Array.from({ length: take - 1 }, (_, i) => ligne(`X${i}`, 'Z', '40110000', 0, 1, null))])
      .mockResolvedValueOnce([b, c])
      .mockResolvedValue([]);
    const r = await ecartsRealisesNonConstates({ ligneEcriture: { findMany } } as never, { tenantId: 't', exerciceId: 'n' });
    expect(r.ecarts).toEqual([{ lettrageId: 'L', code: 'a', compteNumero: '40110000', ecart: 123_200 }]);
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany.mock.calls[1][0]).toMatchObject({ cursor: { id: expect.any(String) }, skip: 1 });
  });

  it('le refus nomme le compte, le groupe, le montant, l’article et l’issue', () => {
    const motif = motifClotureEcartsNonConstates({ ecarts: [{ lettrageId: 'L', code: 'a', compteNumero: '40110000', ecart: 123_200 }] });
    expect(motif).toMatch(/1 lettrage\(s\) dénoué\(s\).*40110000 lettrage a · perte de 123 200,00.*art\. 55.*« Écart de change »/);
    // M3 · les autres issues, sans jamais pousser à passer deux fois.
    expect(motif).toMatch(/UNE seule issue/);
    expect(motif).toMatch(/DÉJÀ été passé à la main, lettrez sa ligne du tiers dans ce groupe, sans le repasser/);
    // B2 (septième relecture) · on gèle la PRÉSENCE de la phrase · délettrer
    // ferait glisser le réalisé au 479 latent.
    expect(motif).toContain(
      "si le geste est refusé (réévaluation qui a lu le groupe, cours corrigé), suivez le motif du refus : annulez la réévaluation, passez l'écart, puis réévaluez. Ne délettrez pas le groupe, sans quoi l'écart ne serait plus constaté.",
    );
    expect(motifClotureEcartsNonConstates({ ecarts: [] })).toBeNull();
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
      ligneEcriture: { findMany: jest.fn().mockResolvedValueOnce(lignes).mockResolvedValue([]) },
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
