import type { PrismaService } from '../../common/prisma.service';
import { issueReevaluationDejaPassee } from './reevaluation-et-ecart-realise';

/**
 * PAS DEUX FOIS LA MÊME PERTE, ET JAMAIS UN FAUX 409 (ligne A6, relectures
 * adverses B1). Le cas mixte du 401 · facture A de 1 160 USD à 1 680 au
 * groupe L (600 USD réglés au coût historique, 560 USD à 1 900), facture B de
 * 500 USD à 1 700 ouverte, réévaluation au 31 décembre à 1 850, saisie le 5
 * janvier. Groupe lu · 198 200 passés ; groupe écarté · 75 000.
 *
 * La DOUBLURE HONORE LA REQUÊTE (compte, devise, groupe, exercice, date,
 * saisie, lettrage à la réévaluation) · ce qui dépend de ce qu'une requête
 * ramène se teste sur la requête.
 */
interface Ligne {
  compteId: string;
  deviseId: string;
  debit: number;
  credit: number;
  montantDevise: number;
  lettrageId: string | null;
  lettre: string | null;
  soldeAt: Date | null;
  ecriture: { exerciceId: string; date: Date; createdAt: Date };
}

const SAISIE = new Date('2026-12-31T10:00:00Z');
const ligne = (
  deviseId: string,
  debit: number,
  credit: number,
  montantDevise: number,
  lettrageId: string | null,
  autre: Partial<Ligne> = {},
): Ligne => ({
  compteId: 'c401',
  deviseId,
  debit,
  credit,
  montantDevise,
  lettrageId,
  lettre: null,
  soldeAt: null,
  ecriture: { exerciceId: 'ex', date: new Date('2026-06-01'), createdAt: SAISIE },
  ...autre,
});

const groupeL = () => [ligne('usd', 0, 1_948_800, 1160, 'L'), ligne('usd', 1_008_000, 0, 600, 'L'), ligne('usd', 1_064_000, 0, 560, 'L')];
const factureB = (autre: Partial<Ligne> = {}) => ligne('usd', 0, 850_000, 500, null, autre);

type Where = {
  compteId?: string;
  deviseId?: { not: null };
  lettrageId?: { in: string[] };
  ecriture: { exerciceId: string; date: { lte: Date }; createdAt: { lte: Date } };
  OR?: unknown[];
};

function monter(p: { lignes: Ligne[]; passe: number; cours?: Record<string, number>; dateReevaluation?: string; creeeLe?: string }) {
  const creeeLe = new Date(p.creeeLe ?? '2027-01-05T09:00:00Z');
  const tient = (l: Ligne, w: Where) =>
    (w.compteId === undefined || l.compteId === w.compteId) &&
    (w.lettrageId === undefined || (l.lettrageId !== null && w.lettrageId.in.includes(l.lettrageId))) &&
    l.ecriture.exerciceId === w.ecriture.exerciceId &&
    l.ecriture.date <= w.ecriture.date.lte &&
    l.ecriture.createdAt <= w.ecriture.createdAt.lte &&
    (w.OR === undefined || l.lettre === null || (l.soldeAt !== null && l.soldeAt > creeeLe));
  return {
    reevaluation: {
      findFirst: jest.fn(async () => ({
        dateReevaluation: new Date(p.dateReevaluation ?? '2026-12-31'),
        createdAt: creeeLe,
        // L'écriture des écarts sur le 401, SANS devise · une perte au crédit du tiers.
        ecritureEcarts: { lignes: [{ debit: p.passe > 0 ? p.passe : 0, credit: p.passe < 0 ? -p.passe : 0 }] },
      })),
    },
    ligneEcriture: { findMany: jest.fn(async ({ where }: { where: Where }) => p.lignes.filter((l) => tient(l, where))) },
    coursDevise: {
      findFirst: jest.fn(async ({ where }: { where: { deviseId: string } }) => {
        const c = (p.cours ?? { usd: 1850, eur: 1100 })[where.deviseId];
        return c === undefined ? null : { cours: c };
      }),
    },
  } as unknown as PrismaService;
}

const params = { tenantId: 't', exerciceId: 'ex', compteId: 'c401', compteNumero: '40110000', lettrageId: 'L', denouement: new Date('2026-11-30') };

describe('l’écart proposé et la réévaluation de l’exercice', () => {
  it('la réévaluation a lu le groupe (198 200) · refus nommé, avec l’issue', async () => {
    const r = await issueReevaluationDejaPassee(monter({ lignes: [...groupeL(), factureB()], passe: -198_200 }), params);
    expect(r).toEqual({ refus: expect.stringMatching(/a déjà porté ce dénouement du 40110000.*compterait deux fois.*retirer cette réévaluation/) });
  });

  it('la réévaluation a écarté le groupe (75 000) · rien ne s’oppose', async () => {
    expect(await issueReevaluationDejaPassee(monter({ lignes: [...groupeL(), factureB()], passe: -75_000 }), params)).toBeNull();
  });

  it('une réévaluation antérieure au dénouement · rien ne s’oppose', async () => {
    expect(
      await issueReevaluationDejaPassee(monter({ lignes: [...groupeL(), factureB()], passe: -198_200, dateReevaluation: '2026-06-30' }), params),
    ).toBeNull();
  });

  // Le faux 409 de la seconde relecture · les lignes d'écart de la
  // réévaluation ne portent pas de devise, le total du compte additionne
  // l'USD ET l'EUR.
  it('tiers à deux devises · 75 000 en USD et 10 000 en EUR passés · rien ne s’oppose, et 208 200 refusent', async () => {
    const eur = ligne('eur', 0, 100_000, 100, null);
    expect(await issueReevaluationDejaPassee(monter({ lignes: [...groupeL(), factureB(), eur], passe: -85_000 }), params)).toBeNull();
    expect(await issueReevaluationDejaPassee(monter({ lignes: [...groupeL(), factureB(), eur], passe: -208_200 }), params)).toHaveProperty('refus');
  });

  it('la facture B lettrée SOLDE après la réévaluation · elle était ouverte, rien ne s’oppose', async () => {
    const b = factureB({ lettrageId: 'LB', lettre: 'B', soldeAt: new Date('2027-01-10') });
    expect(await issueReevaluationDejaPassee(monter({ lignes: [...groupeL(), b], passe: -75_000 }), params)).toBeNull();
  });

  it('une facture de décembre SAISIE après la réévaluation · elle n’y était pas, rien ne s’oppose', async () => {
    const c = ligne('usd', 0, 340_000, 200, null, { ecriture: { exerciceId: 'ex', date: new Date('2026-12-20'), createdAt: new Date('2027-01-08') } });
    expect(await issueReevaluationDejaPassee(monter({ lignes: [...groupeL(), factureB(), c], passe: -75_000 }), params)).toBeNull();
  });

  it('le cours du 31 décembre corrigé depuis · ni l’une ni l’autre · avertissement, jamais « déjà porté »', async () => {
    const r = await issueReevaluationDejaPassee(monter({ lignes: [...groupeL(), factureB()], passe: -75_000, cours: { usd: 1900 } }), params);
    expect(r).toEqual({ avertissement: expect.stringMatching(/a changé depuis la réévaluation des devises du 2026-12-31/) });
    expect((r as { avertissement: string }).avertissement).not.toMatch(/déjà porté/);
  });
});
