import { lignesDeReevaluationSurLesTiers } from './lignes-de-reevaluation';

/**
 * A6 TER · LES LIGNES QUI PORTENT UN ÉCART DE RÉÉVALUATION SUR LE COMPTE D'UN
 * TIERS, reconnues par la LIAISON de la réévaluation, jamais par le compte ni
 * le libellé. La doublure HONORE la requête · écriture d'écarts nommée,
 * compte, lettre, devise, groupe, exercice, drapeaux d'à-nouveau, liaison
 * directe et borne de date des réévaluations.
 */
type L = {
  id: string;
  compteId: string;
  debit: number;
  credit: number;
  deviseId: string | null;
  lettre: string | null;
  lettrageId: string | null;
  ecritureId: string;
  ecriture: { tenantId: string; exerciceId: string; estGenereeParCloture?: boolean; estANouveauProvisoire?: boolean; estSoldeDesComptesDeGestion?: boolean; reevaluationEcarts?: object | null };
};
const ex = { id: 'n1', dateDebut: new Date('2027-01-01') };
let n = 0;
const l = (compteId: string, debit: number, credit: number, ecriture: Partial<L['ecriture']>, enPlus: Partial<L> = {}): L => ({
  id: `l${++n}`,
  compteId,
  debit,
  credit,
  deviseId: null,
  lettre: null,
  lettrageId: null,
  ecritureId: `e${n}`,
  ecriture: { tenantId: 't', exerciceId: 'n1', ...ecriture },
  ...enPlus,
});
const AN = { estGenereeParCloture: true, estSoldeDesComptesDeGestion: false };

function doublure(lignes: L[], reevaluations: Array<{ ecritureEcartsId: string; dateFin: Date; tenantId?: string }>) {
  const tient = (x: L, w: any): boolean => {
    if (w.ecritureId?.in && !w.ecritureId.in.includes(x.ecritureId)) return false;
    if (w.compteId?.in && !w.compteId.in.includes(x.compteId)) return false;
    if ('lettre' in w && w.lettre === null && x.lettre !== null) return false;
    if ('deviseId' in w && w.deviseId === null && x.deviseId !== null) return false;
    if ('lettrageId' in w && w.lettrageId === null && x.lettrageId !== null) return false;
    const e = w.ecriture ?? {};
    if (e.tenantId && x.ecriture.tenantId !== e.tenantId) return false;
    if (e.exerciceId && x.ecriture.exerciceId !== e.exerciceId) return false;
    if (e.reevaluationEcarts?.isNot === null && !x.ecriture.reevaluationEcarts) return false;
    if (e.OR && !e.OR.some((c: Record<string, boolean>) => Object.entries(c).every(([k, v]) => ((x.ecriture as any)[k] ?? false) === v))) return false;
    return true;
  };
  return {
    reevaluation: {
      findMany: jest.fn(async ({ where }: { where: any }) =>
        reevaluations
          .filter((r) => (r.tenantId ?? 't') === where.tenantId && r.dateFin < where.exercice.dateFin.lt)
          .map((r) => ({ ecritureEcartsId: r.ecritureEcartsId })),
      ),
    },
    ligneEcriture: { findMany: jest.fn(async ({ where }: { where: any }) => lignes.filter((x) => tient(x, where))) },
  };
}

describe('les lignes d’écart de réévaluation sur les tiers', () => {
  it('au Détail · une ligne d’écart de N apparie UNE ligne d’à-nouveau de même montant, pas deux', async () => {
    const ecart = l('c411', 0, 50_000, { exerciceId: 'n0' }, { ecritureId: 'eR' });
    const ran1 = l('c411', 0, 50_000, AN);
    const ran2 = l('c411', 0, 50_000, AN);
    const facture = l('c411', 2_800_000, 0, AN);
    const r = await lignesDeReevaluationSurLesTiers(doublure([ecart, ran1, ran2, facture], [{ ecritureEcartsId: 'eR', dateFin: new Date('2026-12-31') }]) as never, {
      tenantId: 't',
      exercice: ex,
      compteIds: ['c411'],
    });
    expect([...r]).toEqual([ran1.id]);
  });

  it('au Solde · le reste en francs reporté d’un seul tenant, égal aux écarts antérieurs', async () => {
    const r1 = l('c411', 0, 50_000, { exerciceId: 'n0' }, { ecritureId: 'eR0' });
    const r2 = l('c411', 20_000, 0, { exerciceId: 'n0b' }, { ecritureId: 'eR1' });
    const reste = l('c411', 0, 30_000, AN);
    const r = await lignesDeReevaluationSurLesTiers(
      doublure(
        [r1, r2, reste],
        [
          { ecritureEcartsId: 'eR0', dateFin: new Date('2025-12-31') },
          { ecritureEcartsId: 'eR1', dateFin: new Date('2026-12-31') },
        ],
      ) as never,
      { tenantId: 't', exercice: ex, compteIds: ['c411'] },
    );
    expect([...r]).toEqual([reste.id]);
  });

  it('un reste qui porte autre chose que l’écart · non reconnu, l’avertissement reste possible', async () => {
    const r1 = l('c411', 0, 50_000, { exerciceId: 'n0' }, { ecritureId: 'eR0' });
    const reste = l('c411', 0, 150_000, AN);
    const r = await lignesDeReevaluationSurLesTiers(doublure([r1, reste], [{ ecritureEcartsId: 'eR0', dateFin: new Date('2026-12-31') }]) as never, {
      tenantId: 't',
      exercice: ex,
      compteIds: ['c411'],
    });
    expect([...r]).toEqual([]);
  });

  it('dans l’exercice · la liaison directe ; une réévaluation POSTÉRIEURE ne compte pas', async () => {
    const direct = l('c401', 0, 30_000, { reevaluationEcarts: { id: 'r' } });
    const ran = l('c401', 0, 50_000, AN);
    const ecartDeN1 = l('c401', 0, 50_000, { exerciceId: 'n2' }, { ecritureId: 'eR2' });
    const r = await lignesDeReevaluationSurLesTiers(
      doublure([direct, ran, ecartDeN1], [{ ecritureEcartsId: 'eR2', dateFin: new Date('2027-12-31') }]) as never,
      { tenantId: 't', exercice: ex, compteIds: ['c401'] },
    );
    expect([...r]).toEqual([direct.id]);
  });
});
