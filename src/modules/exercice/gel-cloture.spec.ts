import { GranulariteCloture } from '@prisma/client';
import { motifLigneFigee, type ClotureActive } from './gel-cloture';
import { OdAnalytiqueService } from '../analytique/od-analytique.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * Point 12 de la comparaison Sage i7 · ce qu'une clôture fige au-delà de la
 * saisie. La règle est pure ; son câblage dans le lettrage, les règlements et
 * la ventilation est éprouvé dans leurs propres specs, celui des OD
 * analytiques ici.
 */

const ligne = (date: string, journalId = 'jACH', exerciceClos = false) => ({
  journalId,
  journalCode: 'ACH',
  date: new Date(date),
  exerciceClos,
});
const cl = (granularite: GranulariteCloture, journalId: string | null, dateLimite: string): ClotureActive => ({
  granularite,
  journalId,
  dateLimite: new Date(dateLimite),
});

describe('motifLigneFigee', () => {
  it('la PARTIELLE ne fige rien · « le lettrage et la ventilation analytique pourront tout de même être effectués »', () => {
    expect(motifLigneFigee(ligne('2026-03-01'), [cl(GranulariteCloture.PARTIELLE, 'jACH', '2026-12-31')])).toBeNull();
  });

  it('la TOTALE fige les lignes de SON journal jusqu’à sa date limite, pas celles d’un autre journal', () => {
    const totale = [cl(GranulariteCloture.TOTALE, 'jACH', '2026-12-31')];
    expect(motifLigneFigee(ligne('2026-03-01'), totale)).toMatch(/journal ACH est clôturé totalement/);
    expect(motifLigneFigee(ligne('2026-12-31'), totale)).not.toBeNull();
    expect(motifLigneFigee(ligne('2026-03-01', 'jVTE'), totale)).toBeNull();
  });

  it('une TOTALE de 2026 ne fige pas les lignes de 2027 du même journal', () => {
    expect(motifLigneFigee(ligne('2027-01-01'), [cl(GranulariteCloture.TOTALE, 'jACH', '2026-12-31')])).toBeNull();
  });

  it('la PÉRIODE fige tous les journaux jusqu’à sa date, et rien après', () => {
    const periode = [cl(GranulariteCloture.PERIODE, null, '2026-03-31')];
    expect(motifLigneFigee(ligne('2026-03-31', 'jVTE'), periode)).toMatch(/période jusqu'au 2026-03-31/);
    expect(motifLigneFigee(ligne('2026-04-01', 'jVTE'), periode)).toBeNull();
  });

  it('l’exercice clôturé fige tout, clôture de journal ou non', () => {
    expect(motifLigneFigee(ligne('2026-03-01', 'jACH', true), [])).toMatch(/exercice est clôturé/);
  });
});

describe('OD analytique · seule la clôture de période l’atteint', () => {
  function monter(clotures: ClotureActive[]) {
    const prisma = {
      exercice: {
        findFirst: jest.fn(async () => ({ id: 'ex', statut: 'OUVERT', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') })),
      },
      odAnalytique: {
        findFirst: jest.fn(async () => ({ id: 'od', date: new Date('2026-02-10'), exercice: { statut: 'OUVERT' } })),
        delete: jest.fn(),
        create: jest.fn(),
      },
      planAnalytique: { findFirst: jest.fn(async () => null) },
      // La doublure honore le filtre de granularité, comme la requête.
      cloture: {
        findMany: jest.fn(async ({ where }: { where: { granularite: GranulariteCloture } }) =>
          clotures.filter((c) => c.granularite === where.granularite),
        ),
      },
    };
    return { service: new OdAnalytiqueService(prisma as unknown as PrismaService), prisma };
  }
  const dto = { exerciceId: 'ex', planId: 'p', compteId: 'c', date: '2026-02-10', libelle: 'x', lignes: [] };

  it('refuse de passer ou de retirer une OD datée d’une période close', async () => {
    const { service, prisma } = monter([cl(GranulariteCloture.PERIODE, null, '2026-03-31')]);
    await expect(service.creer('t', 'u', dto)).rejects.toThrow(/période jusqu'au 2026-03-31/);
    await expect(service.supprimer('t', 'od')).rejects.toThrow(/période jusqu'au 2026-03-31/);
    expect(prisma.odAnalytique.delete).not.toHaveBeenCalled();
  });

  it('une clôture TOTALE de journal ne l’atteint pas · l’OD n’a pas de journal', async () => {
    const { service, prisma } = monter([cl(GranulariteCloture.TOTALE, 'jACH', '2026-12-31')]);
    await service.supprimer('t', 'od');
    expect(prisma.odAnalytique.delete).toHaveBeenCalled();
  });
});
