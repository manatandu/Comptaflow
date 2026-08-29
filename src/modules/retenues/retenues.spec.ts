import { RetenuesService } from './retenues.service';
import { PrismaService } from '../../common/prisma.service';
import { NATURES_RETENUES } from './correspondance-retenues';

/**
 * REGISTRE DES RETENUES · l'état ne calcule aucun impôt. Ce qu'il doit faire
 * juste, c'est le SENS des mouvements (crédit = retenue constituée, débit =
 * reversement), le découpage MENSUEL (chaque mois a son échéance) et le
 * signalement du retard.
 */

function ligne(numero: string, date: string, montant: { debit?: number; credit?: number }) {
  return {
    debit: montant.debit ?? 0,
    credit: montant.credit ?? 0,
    compte: { numero, intitule: `Compte ${numero}` },
    ecriture: { date: new Date(date), libelle: 'Écriture', reference: null },
  };
}

function service(lignes: ReturnType<typeof ligne>[]) {
  const prisma = {
    ligneEcriture: { findMany: jest.fn().mockResolvedValue(lignes) },
  } as unknown as PrismaService;
  return new RetenuesService(prisma);
}

const nature = (r: { natures: Array<{ cle: string }> }, cle: string) =>
  r.natures.find((n) => n.cle === cle) as {
    cle: string;
    retenu: number;
    reverse: number;
    solde: number;
    moisEnRetard: number;
    mois: Array<{ mois: string; retenu: number; reverse: number; solde: number; echeance: Date; enRetard: boolean }>;
    reserve: string | null;
  };

describe('Registre des retenues à la source', () => {
  it('un CRÉDIT est une retenue constituée, un DÉBIT est un reversement', async () => {
    const s = service([
      ligne('44720000', '2026-03-31', { credit: 350_000 }),
      ligne('44720000', '2026-04-14', { debit: 350_000 }),
    ]);
    const r = await s.registre('t1', { exerciceId: 'e1', dateReference: '2026-06-15' });
    const n = nature(r, 'irppSalaires');
    expect(n.retenu).toBe(350_000);
    expect(n.reverse).toBe(350_000);
    expect(n.solde).toBe(0);
  });

  it('découpe par MOIS · chaque mois a sa propre échéance de reversement', async () => {
    const s = service([
      ligne('44720000', '2026-03-31', { credit: 300_000 }),
      ligne('44720000', '2026-04-30', { credit: 320_000 }),
    ]);
    const r = await s.registre('t1', { exerciceId: 'e1', dateReference: '2026-06-15' });
    const n = nature(r, 'irppSalaires');
    expect(n.mois.map((m) => m.mois)).toEqual(['2026-03', '2026-04']);
    // Retenue de mars, reversée le 15 avril (art. 18 LPF).
    expect(n.mois[0].echeance.toISOString().slice(0, 10)).toBe('2026-04-15');
    expect(n.mois[1].echeance.toISOString().slice(0, 10)).toBe('2026-05-15');
  });

  it('signale le retard de reversement, mois par mois', async () => {
    const s = service([
      // Mars retenu et non reversé · l'échéance du 15 avril est passée.
      ligne('44720000', '2026-03-31', { credit: 300_000 }),
      // Juin retenu, échéance au 15 juillet · pas encore due.
      ligne('44720000', '2026-06-30', { credit: 280_000 }),
    ]);
    const r = await s.registre('t1', { exerciceId: 'e1', dateReference: '2026-06-15' });
    const n = nature(r, 'irppSalaires');
    expect(n.moisEnRetard).toBe(1);
    expect(n.mois.find((m) => m.mois === '2026-03')!.enRetard).toBe(true);
    expect(n.mois.find((m) => m.mois === '2026-06')!.enRetard).toBe(false);
  });

  it('un compte 44 qu’aucune nature ne réclame ressort en NON RATTACHÉ, jamais absorbé', async () => {
    // 442 « Etat, autres impôts et taxes » : ce n'est pas une retenue à la
    // source, il n'a donc pas de nature ici. Le registre le dit.
    const s = service([ligne('44210000', '2026-03-31', { credit: 90_000 })]);
    const r = await s.registre('t1', { exerciceId: 'e1', dateReference: '2026-06-15' });
    expect(r.comptesNonRattaches.map((c) => c.numero)).toEqual(['44210000']);
    expect(r.totalRetenu).toBe(0);
  });

  it('sépare l’État des organismes sociaux', async () => {
    const s = service([
      ligne('44720000', '2026-03-31', { credit: 350_000 }),
      ligne('43100000', '2026-03-31', { credit: 130_000 }),
    ]);
    const r = await s.registre('t1', { exerciceId: 'e1', dateReference: '2026-06-15' });
    expect(nature(r, 'irppSalaires').retenu).toBe(350_000);
    expect(nature(r, 'cotisationsSociales').retenu).toBe(130_000);
    expect(r.natures.find((n) => n.cle === 'cotisationsSociales')!.beneficiaire).toBe('ORGANISME_SOCIAL');
  });

  it('ne calcule AUCUN impôt et le dit · aucun taux n’est inscrit dans le référentiel', async () => {
    const r = await service([]).registre('t1', { exerciceId: 'e1' });
    expect(r.avertissements[0]).toContain("ne calcule aucun impôt");
    expect(r.avertissements[1]).toContain('DÉCLARER');
    // Aucun taux, nulle part : c'est la règle posée dans
    // docs/fiscalite-asbl-rdc.md, section 9.2.
    const serialise = JSON.stringify(NATURES_RETENUES);
    expect(serialise).not.toMatch(/"taux"/);
  });

  it('porte la réserve sur le compte 4478, qui mélange trois prélèvements aux échéances différentes', async () => {
    const r = await service([]).registre('t1', { exerciceId: 'e1' });
    expect(nature(r, 'autresRetenues').reserve).toContain('sous-compte');
  });
});

describe('Échéancier fiscal et social', () => {
  it('trie par date et garde les natures sans solde · déclarer reste dû', async () => {
    const s = service([ligne('44720000', '2026-06-10', { credit: 200_000 })]);
    const e = await s.echeancierFiscal('t1', { exerciceId: 'e1', dateReference: '2026-06-20' });
    // Toutes les natures figurent, y compris celles à zéro.
    expect(e.echeances).toHaveLength(NATURES_RETENUES.length);
    const dates = e.echeances.map((x) => x.date.getTime());
    expect([...dates].sort((a, b) => a - b)).toEqual(dates);
  });

  it('la prochaine échéance passe au mois suivant quand celle du mois est passée', async () => {
    const s = service([]);
    const avant = await s.echeancierFiscal('t1', { exerciceId: 'e1', dateReference: '2026-06-10' });
    const apres = await s.echeancierFiscal('t1', { exerciceId: 'e1', dateReference: '2026-06-20' });
    expect(avant.echeances[0].date.toISOString().slice(0, 10)).toBe('2026-06-15');
    expect(apres.echeances[0].date.toISOString().slice(0, 10)).toBe('2026-07-15');
  });

  it('expose la date de dernière vérification des échéances · elles changent', async () => {
    const e = await service([]).echeancierFiscal('t1', { exerciceId: 'e1' });
    expect(e.derniereVerificationEcheances).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
