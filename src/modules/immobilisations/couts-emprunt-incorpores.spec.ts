import { Referentiel, StatutExercice, StatutImmobilisation } from '@prisma/client';
import {
  compteCreditIncorporation,
  montantIncorporable,
  motifRefusIncorporation,
  motifRefusPlafond,
  type SaisieIncorporation,
} from './couts-emprunt-incorpores';
import { ImmobilisationService } from './immobilisation.service';
import { PLAN_COMPTES_SYCEBNL } from '../comptes/compte-seed';
import { PLAN_COMPTES_SYSCOHADA } from '../comptes/compte-seed-syscohada';

/**
 * LOT 13 · COÛTS D'EMPRUNT INCORPORÉS (AUDCIF Titre VIII ch. 7 ; fiches du
 * compte 67 des deux textes, fiche du compte 72 du SYCEBNL).
 */
const D = (s: string) => new Date(`${s}T00:00:00Z`);
const EXEMPLE: SaisieIncorporation = {
  // L'exemple du texte · emprunt de 120 000 000 à 12 % le 1er mars N, construction du 1er avril N au 15 novembre N+1.
  referentiel: 'SYSCOHADA',
  numeroBien: '23110000',
  enService: true,
  aDesDotations: false,
  dateMiseEnService: null,
  nature: 'SPECIFIQUE',
  debutPreparation: D('2026-04-01'),
  finPreparation: D('2027-11-15'),
  justificationPeriodeCourte: null,
  dateDebut: D('2026-04-01'),
  dateFin: D('2026-12-31'),
  exercice: { dateDebut: D('2026-01-01'), dateFin: D('2026-12-31') },
  base: 120_000_000,
  tauxPourcent: 12,
  produitsPlacement: 800_000,
};

describe('le montant · l’exemple du ch. 7 § 2.2.3', () => {
  it('120 000 000 × 12 % × 9/12 − 800 000 = 10 000 000', () => {
    expect(montantIncorporable({ base: 120_000_000, tauxPourcent: 12, mois: 9, produitsPlacement: 800_000 })).toBe(10_000_000);
    expect(motifRefusIncorporation(EXEMPLE)).toBeNull();
  });
});

describe('les refus · actif qualifié, période, référentiel', () => {
  it('ni avance, ni titre, ni prêt, ni bien reçu (20)', () => {
    for (const numero of ['25200000', '26100000', '27100000', '20300000']) {
      expect(motifRefusIncorporation({ ...EXEMPLE, numeroBien: numero })).toMatch(/actif qualifié/);
    }
  });
  it('moins de douze mois de préparation · justification exigée (§ 1.2)', () => {
    const court = { ...EXEMPLE, finPreparation: D('2026-10-31'), dateFin: D('2026-10-31') };
    expect(motifRefusIncorporation(court)).toMatch(/douze mois/);
    expect(motifRefusIncorporation({ ...court, justificationPeriodeCourte: 'Extension d’entrepôt jugée significative' })).toBeNull();
  });
  it('la période reste dans l’exercice, dans la préparation, avant la mise en service', () => {
    expect(motifRefusIncorporation({ ...EXEMPLE, dateFin: D('2027-01-31') })).toMatch(/dans l'exercice/);
    expect(motifRefusIncorporation({ ...EXEMPLE, dateDebut: D('2026-03-01') })).toMatch(/pendant la préparation/);
    expect(motifRefusIncorporation({ ...EXEMPLE, dateMiseEnService: D('2026-11-30') })).toMatch(/mise en service/);
    expect(motifRefusIncorporation({ ...EXEMPLE, aDesDotations: true })).toMatch(/déjà amorti/);
    expect(motifRefusIncorporation({ ...EXEMPLE, enService: false })).toMatch(/sorti/);
  });
  it('emprunts généraux · taux de capitalisation au SYSCOHADA, refusés au SYCEBNL ; pas de produits de placement', () => {
    const general = { ...EXEMPLE, nature: 'GENERAL' as const, base: 50_000_000, tauxPourcent: 10, produitsPlacement: 0 };
    expect(motifRefusIncorporation(general)).toBeNull();
    expect(motifRefusIncorporation({ ...general, referentiel: 'SYCEBNL' })).toMatch(/exclusivement affectés/);
    expect(motifRefusIncorporation({ ...general, produitsPlacement: 100 })).toMatch(/spécifiquement/);
  });
  it('produits de placement au-delà des coûts · rien à incorporer', () => {
    expect(motifRefusIncorporation({ ...EXEMPLE, produitsPlacement: 11_000_000 })).toMatch(/rien ne s’incorpore/);
  });
});

describe('le plafond du § 2.1 · jamais plus que les coûts supportés dans l’exercice', () => {
  it('10 000 000 sous 10 800 000 supportés · admis ; au-delà, refusé', () => {
    expect(motifRefusPlafond({ montant: 10_000_000, coutsSupportes: 10_800_000, dejaIncorpores: 0 })).toBeNull();
    expect(motifRefusPlafond({ montant: 10_000_000, coutsSupportes: 10_800_000, dejaIncorpores: 1_000_000 })).toMatch(/§ 2\.1/);
  });
});

describe('un numéro, deux sens · 72 au SYSCOHADA, 787 au SYCEBNL', () => {
  it('le compte crédité par la fiche du compte 67 de chaque texte', () => {
    expect(compteCreditIncorporation('SYSCOHADA', '21300000')).toBe('72100000');
    expect(compteCreditIncorporation('SYSCOHADA', '23110000')).toBe('72210000');
    expect(compteCreditIncorporation('SYSCOHADA', '24610000')).toBe('72220000');
    expect(compteCreditIncorporation('SYCEBNL', '23100000')).toBe('78700000');
  });
  it('chaque compte crédité est un compte de détail semé, sous son intitulé', () => {
    const intitule = (plan: ReadonlyArray<unknown>, numero: string) => {
      const l = (plan as ReadonlyArray<unknown[] | { numero: string; intitule: string }>).find((x) => (Array.isArray(x) ? x[0] === numero : x.numero === numero));
      return l === undefined ? undefined : Array.isArray(l) ? String(l[1]) : l.intitule;
    };
    expect(intitule(PLAN_COMPTES_SYSCOHADA, '72100000')).toMatch(/incorporelles/i);
    expect(intitule(PLAN_COMPTES_SYSCOHADA, '72210000')).toMatch(/hors actifs biologiques/i);
    expect(intitule(PLAN_COMPTES_SYSCOHADA, '72220000')).toMatch(/actifs biologiques/i);
    expect(intitule(PLAN_COMPTES_SYCEBNL, '78700000')).toMatch(/transferts de charges financières/i);
  });
});

describe('le service · écriture, plafond lu au journal, valeur d’entrée augmentée', () => {
  function monter(o: { referentiel?: Referentiel; coutsDebit?: number; deja?: number; compteCredit?: boolean } = {}) {
    const creer = jest.fn().mockResolvedValue({ id: 'ec' });
    const mises: unknown[] = [];
    const prisma: Record<string, unknown> = {
      immobilisation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'b1',
          designation: 'Siège',
          statut: StatutImmobilisation.EN_SERVICE,
          compteImmobilisationId: 'c231',
          compteImmobilisation: { numero: '23110000' },
          dateMiseEnService: null,
          dotations: [],
          depreciations: [],
        }),
        update: jest.fn((a: unknown) => {
          mises.push(a);
          return Promise.resolve(a);
        }),
      },
      exercice: { findFirst: jest.fn().mockResolvedValue({ id: 'e26', statut: StatutExercice.OUVERT, dateDebut: D('2026-01-01'), dateFin: D('2026-12-31') }) },
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: o.referentiel ?? Referentiel.SYSCOHADA, systemeComptableSyscohada: 'NORMAL', jeuEtatsFinanciersSycebnl: null }) },
      ligneEcriture: { aggregate: jest.fn().mockResolvedValue({ _sum: { debit: o.coutsDebit ?? 10_800_000, credit: 0 } }) },
      coutEmpruntIncorpore: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { montant: o.deja ?? 0 } }),
        create: jest.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'k1', ...data })),
      },
      compte: {
        findUnique: jest.fn(({ where }: { where: { tenantId_numero: { numero: string } } }) =>
          Promise.resolve(o.compteCredit === false ? null : { id: `n${where.tenantId_numero.numero}` }),
        ),
      },
      ecriture: { delete: jest.fn() },
    };
    prisma.$transaction = jest.fn((f: (tx: unknown) => unknown) => f(prisma));
    return { svc: new ImmobilisationService(prisma as never, { creer } as never), creer, prisma, mises };
  }
  const corps = {
    exerciceId: 'e26',
    journalId: 'j',
    nature: 'SPECIFIQUE' as const,
    debutPreparation: '2026-04-01',
    finPreparation: '2027-11-15',
    dateDebut: '2026-04-01',
    dateFin: '2026-12-31',
    base: 120_000_000,
    tauxPourcent: 12,
    produitsPlacement: 800_000,
  };

  it('D compte du bien / C 72210000 pour 10 000 000, la valeur d’entrée augmentée d’autant', async () => {
    const { svc, creer, mises, prisma } = monter();
    await svc.incorporerCoutsEmprunt('t', 'u', 'b1', corps);
    expect(creer.mock.calls[0][2]).toMatchObject({
      date: '2026-12-31',
      lignes: [
        { compteId: 'c231', debit: 10_000_000, credit: 0 },
        { compteId: 'n72210000', debit: 0, credit: 10_000_000 },
      ],
    });
    expect(mises).toEqual([{ where: { id: 'b1' }, data: { valeurOrigine: { increment: 10_000_000 } } }]);
    // Le plafond lit les 671 et 672 de l'exercice, hors solde des comptes de gestion.
    const where = (prisma.ligneEcriture as { aggregate: jest.Mock }).aggregate.mock.calls[0][0].where;
    expect(where.ecriture).toEqual({ tenantId: 't', exerciceId: 'e26', estSoldeDesComptesDeGestion: false });
    expect(where.OR).toEqual([{ compte: { numero: { startsWith: '671' } } }, { compte: { numero: { startsWith: '672' } } }]);
  });

  it('SYCEBNL · crédit du 787', async () => {
    const { svc, creer } = monter({ referentiel: Referentiel.SYCEBNL });
    await svc.incorporerCoutsEmprunt('t', 'u', 'b1', corps);
    expect(creer.mock.calls[0][2].lignes[1]).toEqual({ compteId: 'n78700000', debit: 0, credit: 10_000_000 });
  });

  it('au-delà des coûts supportés, ou sans compte crédité · refusé avant toute écriture', async () => {
    for (const m of [monter({ coutsDebit: 9_000_000 }), monter({ deja: 1_000_000 }), monter({ compteCredit: false })]) {
      await expect(m.svc.incorporerCoutsEmprunt('t', 'u', 'b1', corps)).rejects.toThrow();
      expect(m.creer).not.toHaveBeenCalled();
    }
  });
});
