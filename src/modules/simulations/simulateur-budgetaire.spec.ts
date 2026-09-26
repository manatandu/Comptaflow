import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { SimulationsService } from './simulations.service';
import {
  ecartDefavorablePct,
  jaugeDe,
  montantsParRacine,
  motifRefusSimulation,
  prorataTemporis,
  racineDeGestion,
  simuler,
} from './simulateur-budgetaire';

const S = { orangePct: 5, rougePct: 10 };

describe('la maille et le sens', () => {
  it('ne retient que les classes 6 et 7, par deux chiffres', () => {
    expect(racineDeGestion('60110000')).toBe('60');
    expect(racineDeGestion('70210000')).toBe('70');
    expect(racineDeGestion('81200000')).toBeNull();
    expect(racineDeGestion('41110000')).toBeNull();
  });

  it('lit un produit crédit moins débit et une charge débit moins crédit, et les cumule par racine', () => {
    const m = montantsParRacine([
      { numero: '70110000', mouvementDebit: 100, mouvementCredit: 1_100 },
      { numero: '70710000', mouvementDebit: 0, mouvementCredit: 500 },
      { numero: '60110000', mouvementDebit: 800, mouvementCredit: 50 },
      { numero: '89100000', mouvementDebit: 300, mouvementCredit: 0 },
    ]);
    expect(m.get('70')).toBe(1_500);
    expect(m.get('60')).toBe(750);
    expect(m.has('89')).toBe(false);
  });
});

describe('les hypothèses', () => {
  const base = { reference: new Map([['70', 1_000], ['60', 400], ['62', 100]]), realise: null, intitules: new Map(), seuils: S, prorata: 1 };

  it('fait suivre la croissance aux produits, laisse les charges au réalisé', () => {
    const r = simuler({ ...base, hypotheses: { croissanceProduitsPct: 10, variations: {} } });
    const l = (x: string) => r.lignes.find((y) => y.racine === x)!;
    expect(l('70').prevuAnnuel).toBe(1_100);
    expect(l('60').prevuAnnuel).toBe(400);
    expect(r.totaux.prevuAnnuel.resultatActivitesOrdinaires).toBe(600);
  });

  it('applique le taux propre d’une ligne, charge variable comprise', () => {
    const r = simuler({ ...base, hypotheses: { croissanceProduitsPct: 10, variations: { '60': 10, '70': 5 } } });
    expect(r.lignes.find((y) => y.racine === '60')!.prevuAnnuel).toBe(440);
    expect(r.lignes.find((y) => y.racine === '70')!.prevuAnnuel).toBe(1_050);
  });

  it('porte au prévu à date le prorata des jours écoulés', () => {
    const r = simuler({ ...base, prorata: 0.5, hypotheses: { croissanceProduitsPct: 0, variations: {} } });
    expect(r.lignes.find((y) => y.racine === '70')!.prevuADate).toBe(500);
  });

  it('refuse une racine hors gestion, un taux absurde, des seuils inversés', () => {
    expect(motifRefusSimulation({ croissanceProduitsPct: 5, variations: { '81': 3 } }, S)).toMatch(/deux chiffres/);
    expect(motifRefusSimulation({ croissanceProduitsPct: -120, variations: {} }, S)).toMatch(/-100/);
    expect(motifRefusSimulation({ croissanceProduitsPct: 5, variations: {} }, { orangePct: 10, rougePct: 10 })).toMatch(/orange strictement/);
    expect(motifRefusSimulation({ croissanceProduitsPct: 5, variations: { '62': 2 } }, S)).toBeNull();
  });
});

describe('la jauge', () => {
  it('ne colore que l’écart défavorable', () => {
    expect(ecartDefavorablePct('PRODUIT', 1_000, 900)).toBe(10);
    expect(ecartDefavorablePct('PRODUIT', 1_000, 1_200)).toBe(-20);
    expect(ecartDefavorablePct('CHARGE', 1_000, 1_080)).toBe(8);
    expect(ecartDefavorablePct('CHARGE', 1_000, 700)).toBe(-30);
  });

  it('passe du vert à l’orange puis au rouge aux seuils de la simulation', () => {
    expect(jaugeDe(-30, S)).toBe('VERT');
    expect(jaugeDe(5, S)).toBe('VERT');
    expect(jaugeDe(5.01, S)).toBe('ORANGE');
    expect(jaugeDe(10, S)).toBe('ORANGE');
    expect(jaugeDe(10.01, S)).toBe('ROUGE');
    expect(jaugeDe(null, S)).toBeNull();
  });

  it('laisse vide la jauge d’une ligne réalisée sans rien de prévu', () => {
    const r = simuler({ reference: new Map(), realise: new Map([['65', 50]]), intitules: new Map(), seuils: S, prorata: 1, hypotheses: { croissanceProduitsPct: 0, variations: {} } });
    expect(r.lignes[0]).toMatchObject({ racine: '65', prevuADate: 0, realise: 50, jauge: null });
  });

  it('compare le réalisé au prévu à date et juge le résultat comme un produit', () => {
    const r = simuler({
      reference: new Map([['70', 1_000], ['60', 600]]),
      realise: new Map([['70', 400], ['60', 330]]),
      intitules: new Map([['70', 'Ventes']]),
      seuils: S,
      prorata: 0.5,
      hypotheses: { croissanceProduitsPct: 0, variations: {} },
    });
    const v = r.lignes.find((l) => l.racine === '70')!;
    expect(v).toMatchObject({ intitule: 'Ventes', prevuADate: 500, realise: 400, ecartDefavorablePct: 20, jauge: 'ROUGE' });
    expect(r.lignes.find((l) => l.racine === '60')!.jauge).toBe('ORANGE');
    expect(r.totaux.prevuADate.resultatActivitesOrdinaires).toBe(200);
    expect(r.totaux.realise!.resultatActivitesOrdinaires).toBe(70);
    expect(r.totaux.jaugeResultat).toBe('ROUGE');
  });
});

describe('le prorata', () => {
  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  it('compte les jours écoulés, bornes comprises, borné à [0, 1]', () => {
    expect(prorataTemporis(d('2027-01-01'), d('2027-12-31'), d('2027-12-31'))).toBe(1);
    expect(prorataTemporis(d('2027-01-01'), d('2027-12-31'), d('2027-01-01'))).toBeCloseTo(1 / 365);
    expect(prorataTemporis(d('2027-01-01'), d('2027-12-31'), d('2027-07-02'))).toBeCloseTo(183 / 365);
    expect(prorataTemporis(d('2027-01-01'), d('2027-12-31'), d('2028-06-01'))).toBe(1);
    expect(prorataTemporis(d('2027-01-01'), d('2027-12-31'), d('2026-06-01'))).toBe(0);
  });

  it("compte des jours de calendrier · un arrêté posé à 23 h 59 ne gagne pas un jour", () => {
    // Le service arrête la cible à 23:59:59.999. Du 1er janvier au 30 juin, 181 jours.
    const arrete = new Date('2027-06-30T23:59:59.999Z');
    expect(prorataTemporis(new Date('2027-01-01T00:00:00Z'), new Date('2027-12-31T00:00:00Z'), arrete)).toBeCloseTo(181 / 365, 6);
    // Une fin d'exercice stockée en fin de journée ne change pas le total.
    expect(prorataTemporis(new Date('2027-01-01T00:00:00Z'), new Date('2027-12-31T23:59:59.999Z'), arrete)).toBeCloseTo(181 / 365, 6);
  });
});

describe('le service', () => {
  const ex = (id: string, debut: string, fin: string, statut = 'OUVERT') => ({ id, dateDebut: new Date(`${debut}T00:00:00Z`), dateFin: new Date(`${fin}T00:00:00Z`), statut });
  const faire = () => {
    const exercices = [ex('e26', '2026-01-01', '2026-12-31', 'CLOTURE'), ex('e27', '2027-01-01', '2027-12-31')];
    const balance = jest.fn(async (_t: string, exId: string) => ({
      lignes:
        exId === 'e26'
          ? [{ numero: '70110000', mouvementDebit: 0, mouvementCredit: 1_000 }]
          : [{ numero: '70110000', mouvementDebit: 0, mouvementCredit: 300 }],
    }));
    const create = jest.fn(async (a: { data: unknown }) => a.data);
    const prisma = {
      exercice: { findFirst: jest.fn(async ({ where }: { where: { id: string } }) => exercices.find((e) => e.id === where.id) ?? null) },
      simulationBudgetaire: {
        create,
        findFirst: jest.fn(async () => ({
          id: 's', nom: 'Base', exerciceReferenceId: 'e26', exerciceCibleId: 'e27', exerciceReference: exercices[0], exerciceCible: exercices[1],
          hypotheses: { croissanceProduitsPct: 10, variations: {} }, seuilOrangePct: 5, seuilRougePct: 10,
        })),
      },
      compte: { findMany: jest.fn(async () => [{ numero: '70', intitule: 'Ventes' }]) },
    } as unknown as PrismaService;
    return { svc: new SimulationsService(prisma, { balance } as unknown as EcritureService), balance, create };
  };
  const DTO = { nom: 'Base', exerciceReferenceId: 'e26', exerciceCibleId: 'e27', croissanceProduitsPct: 10, variations: {}, seuilOrangePct: 5, seuilRougePct: 10 };

  it('refuse une cible qui ne suit pas la référence, sans rien écrire', async () => {
    const { svc, create } = faire();
    await expect(svc.creer('t1', 'a', { ...DTO, exerciceReferenceId: 'e27', exerciceCibleId: 'e26' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.creer('t1', 'a', { ...DTO, exerciceCibleId: 'e26' })).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('lit la référence entière et la cible arrêtée à la date, bornée à son exercice', async () => {
    const { svc, balance } = faire();
    const r = await svc.calculer('t1', 's', { arreteAu: '2027-07-02' });
    expect(balance).toHaveBeenCalledWith('t1', 'e26', true);
    expect(balance.mock.calls[1][1]).toBe('e27');
    expect((balance.mock.calls[1] as unknown[])[3]).toEqual(new Date('2027-07-02T23:59:59.999Z'));
    expect(r.prorata).toBeCloseTo(183 / 365);
    expect(r.lignes[0]).toMatchObject({ racine: '70', intitule: 'Ventes', prevuAnnuel: 1_100 });
    const borne = await svc.calculer('t1', 's', { arreteAu: '2029-01-01' });
    expect(borne.arreteAu).toBe('2027-12-31');
    expect(borne.prorata).toBe(1);
  });

  it('ne lit pas la cible avant son ouverture, et le dit par un prévu à date nul', async () => {
    const { svc, balance } = faire();
    const r = await svc.calculer('t1', 's', { arreteAu: '2026-06-30' });
    expect(balance).toHaveBeenCalledTimes(1);
    expect(r.arreteAu).toBeNull();
    expect(r.totaux.realise).toBeNull();
  });
});
