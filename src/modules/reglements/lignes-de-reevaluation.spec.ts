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
  ecriture: { tenantId: string; exerciceId: string; date: Date; estGenereeParCloture?: boolean; estANouveauProvisoire?: boolean; estSoldeDesComptesDeGestion?: boolean };
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
  ecriture: {
    tenantId: 't',
    exerciceId: 'n1',
    // Une ligne d'un exercice ANTÉRIEUR est datée avant le 1er janvier 2027.
    date: new Date(ecriture.exerciceId && ecriture.exerciceId !== 'n1' ? (ecriture.exerciceId === 'n2' ? '2028-06-30' : '2026-12-31') : '2027-06-30'),
    ...ecriture,
  },
  ...enPlus,
});
const AN = { estGenereeParCloture: true, estSoldeDesComptesDeGestion: false };

function doublure(lignes: L[], reevaluations: Array<{ ecritureEcartsId?: string; ecritureExtourneId?: string; tenantId?: string }>) {
  const tient = (x: L, w: any): boolean => {
    if (w.ecritureId?.in && !w.ecritureId.in.includes(x.ecritureId)) return false;
    if (w.lettrageId?.in && !w.lettrageId.in.includes(x.lettrageId)) return false;
    if (w.compteId?.in && !w.compteId.in.includes(x.compteId)) return false;
    if ('lettre' in w && w.lettre === null && x.lettre !== null) return false;
    if ('deviseId' in w && w.deviseId === null && x.deviseId !== null) return false;
    if ('lettrageId' in w && w.lettrageId === null && x.lettrageId !== null) return false;
    const e = w.ecriture ?? {};
    if (e.tenantId && x.ecriture.tenantId !== e.tenantId) return false;
    if (e.exerciceId && x.ecriture.exerciceId !== e.exerciceId) return false;
    if (e.OR && !e.OR.some((c: Record<string, boolean>) => Object.entries(c).every(([k, v]) => ((x.ecriture as any)[k] ?? false) === v))) return false;
    return true;
  };
  return {
    reevaluation: {
      findMany: jest.fn(async ({ where }: { where: any }) =>
        reevaluations
          .filter((r) => (r.tenantId ?? 't') === where.tenantId)
          .map((r) => ({ ecritureEcartsId: r.ecritureEcartsId ?? null, ecritureExtourneId: r.ecritureExtourneId ?? null })),
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
    const r = await lignesDeReevaluationSurLesTiers(doublure([ecart, ran1, ran2, facture], [{ ecritureEcartsId: 'eR' }]) as never, {
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
          { ecritureEcartsId: 'eR0' },
          { ecritureEcartsId: 'eR1' },
        ],
      ) as never,
      { tenantId: 't', exercice: ex, compteIds: ['c411'] },
    );
    expect([...r]).toEqual([reste.id]);
  });

  it('un reste qui porte autre chose que l’écart · non reconnu, l’avertissement reste possible', async () => {
    const r1 = l('c411', 0, 50_000, { exerciceId: 'n0' }, { ecritureId: 'eR0' });
    const reste = l('c411', 0, 150_000, AN);
    const r = await lignesDeReevaluationSurLesTiers(doublure([r1, reste], [{ ecritureEcartsId: 'eR0' }]) as never, {
      tenantId: 't',
      exercice: ex,
      compteIds: ['c411'],
    });
    expect([...r]).toEqual([]);
  });

  it('dans l’exercice · la liaison directe, écarts et contre-passation ; une réévaluation POSTÉRIEURE ne compte pas', async () => {
    const direct = l('c411', 0, 30_000, {}, { ecritureId: 'eD' });
    // La contre-passation de N, passée en N+1 · elle débite le client, sans devise.
    const extourne = l('c411', 50_000, 0, {}, { ecritureId: 'eX' });
    const ran = l('c411', 0, 50_000, AN);
    const ecartDeN1 = l('c411', 0, 50_000, { exerciceId: 'n2' }, { ecritureId: 'eR2' });
    const facture = l('c411', 50_000, 0, {});
    const r = await lignesDeReevaluationSurLesTiers(
      doublure([direct, extourne, ran, ecartDeN1, facture], [{ ecritureEcartsId: 'eD' }, { ecritureExtourneId: 'eX' }, { ecritureEcartsId: 'eR2' }]) as never,
      { tenantId: 't', exercice: ex, compteIds: ['c411'] },
    );
    expect([...r].sort()).toEqual([direct.id, extourne.id].sort());
  });

  it('une réévaluation d’un autre dossier ne compte pas', async () => {
    const direct = l('c411', 0, 30_000, {}, { ecritureId: 'eD' });
    const r = await lignesDeReevaluationSurLesTiers(doublure([direct], [{ ecritureEcartsId: 'eD', tenantId: 'autre' }]) as never, {
      tenantId: 't',
      exercice: ex,
      compteIds: ['c411'],
    });
    expect([...r]).toEqual([]);
  });

  // A6 TER, seconde relecture, mineur b · le jeu du vérificateur (p4) · 401 au
  // Détail, F de 1 000 USD à 2 800, clôture à 2 850 · perte latente de 50 000
  // au crédit du 401. En N+1, la ligne reportée de l'écart est lettrée avec
  // sa contre-passation (lettrage automatique) ; H, vraie facture de 50 000 FC
  // reportée, reste ouverte. Écartée du rapprochement, la ligne lettrée
  // laissait l'écart de N s'apparier à H, qui disparaissait des échéances.
  it('la ligne reportée de l’écart, lettrée avec sa contre-passation, consomme l’écart · la vraie facture du même montant reste', async () => {
    const h = l('c401', 0, 50_000, AN); // lue la première (identifiant le plus petit)
    const ecartDeN = l('c401', 0, 50_000, { exerciceId: 'n0' }, { ecritureId: 'eR' });
    const report = l('c401', 0, 50_000, AN, { lettrageId: 'L', lettre: 'L' });
    const extourne = l('c401', 50_000, 0, {}, { ecritureId: 'eX', lettrageId: 'L', lettre: 'L' });
    const r = await lignesDeReevaluationSurLesTiers(
      doublure([h, ecartDeN, report, extourne], [{ ecritureEcartsId: 'eR', ecritureExtourneId: 'eX' }]) as never,
      { tenantId: 't', exercice: ex, compteIds: ['c401'] },
    );
    expect(r.has(h.id)).toBe(false);
    expect(r.has(report.id)).toBe(true);
    expect(r.has(extourne.id)).toBe(true);
  });
});
