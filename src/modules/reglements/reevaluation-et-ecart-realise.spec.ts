import type { PrismaService } from '../../common/prisma.service';
import { motifReevaluationDejaPassee } from './reevaluation-et-ecart-realise';

/**
 * RELECTURE ADVERSE B1 · PAS DEUX FOIS LA MÊME PERTE. Le cas mixte du 401
 * (voir devises/perimetre-reevaluation.spec.ts) · la réévaluation du 31
 * décembre a lu le groupe avant qu'il ne soit complété, et passé 198 200 au
 * 478 au lieu des 75 000 de la seule facture B. Passer ensuite les 123 200
 * au 656 compterait la perte deux fois · refus nommé, avec l'issue.
 */
function monter(ecartPasse: number, dateReevaluation = '2026-12-31') {
  const ligne = (debit: number, credit: number, montantDevise: number, lettrageId: string | null) => ({
    debit,
    credit,
    montantDevise,
    deviseId: 'usd',
    lettrageId,
  });
  const lignes = [ligne(0, 1_948_800, 1160, 'L'), ligne(1_008_000, 0, 600, 'L'), ligne(1_064_000, 0, 560, 'L'), ligne(0, 850_000, 500, null)];
  const prisma = {
    reevaluation: {
      findFirst: jest.fn(async () => ({
        dateReevaluation: new Date(dateReevaluation),
        // L'écriture des écarts sur le 401 · une perte se passe au crédit du tiers.
        ecritureEcarts: { lignes: [{ debit: ecartPasse > 0 ? ecartPasse : 0, credit: ecartPasse < 0 ? -ecartPasse : 0 }] },
      })),
    },
    ligneEcriture: {
      findMany: jest.fn(async ({ where }: { where: { lettrageId?: { in: string[] } } }) =>
        where.lettrageId ? lignes.filter((l) => l.lettrageId && where.lettrageId!.in.includes(l.lettrageId)) : lignes,
      ),
    },
    coursDevise: { findFirst: jest.fn(async () => ({ cours: 1850 })) },
  } as unknown as PrismaService;
  return prisma;
}

const params = { tenantId: 't', exerciceId: 'ex', compteId: 'c401', compteNumero: '40110000', deviseId: 'usd', denouement: new Date('2026-11-30') };

describe('l’écart proposé déjà repris par la réévaluation', () => {
  it('la réévaluation a passé 198 200 · le groupe y était · refus nommé, avec l’issue', async () => {
    const motif = await motifReevaluationDejaPassee(monter(-198_200), params);
    expect(motif).toMatch(/réévaluation des devises du 2026-12-31 a déjà porté ce dénouement du 40110000/);
    expect(motif).toMatch(/compterait deux fois/);
    expect(motif).toMatch(/retirer cette réévaluation, passer l’écart, puis réévaluer/);
  });

  it('la réévaluation a passé les 75 000 de la seule facture B · le groupe n’y était pas · rien ne s’oppose', async () => {
    expect(await motifReevaluationDejaPassee(monter(-75_000), params)).toBeNull();
  });

  it('une réévaluation antérieure au dénouement · rien ne s’oppose', async () => {
    expect(await motifReevaluationDejaPassee(monter(-198_200, '2026-06-30'), params)).toBeNull();
  });
});
