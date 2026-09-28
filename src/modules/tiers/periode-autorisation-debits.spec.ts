import { BadRequestException } from '@nestjs/common';
import { TypeTiers } from '@prisma/client';
import { TiersService } from './tiers.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * LA PÉRIODE DE L'AUTORISATION AUX DÉBITS, SAISIE SUR LA FICHE DU TIERS.
 *
 * Décret n° 011/42, art. 59 (date d'effet · « L'absence de décision dans ce
 * délai vaut autorisation ») et art. 63 (retour au droit commun, « révocable
 * sur simple demande écrite du contribuable »), fichier
 * `code-general-2026/references/11-tva-decret-application-ch1-4.md`.
 *
 * Deux choses se vérifient ici · une date AAAA-MM-JJ arrive en base comme une
 * date (Prisma refuse la chaîne, et `new Date` reporterait en silence un jour
 * absent du calendrier), et une révocation ne précède jamais la date d'effet,
 * y compris quand elle est saisie seule contre une date d'effet déjà
 * enregistrée.
 */

function avecTransaction<T extends object>(p: T): T {
  const avec = p as T & { $transaction: (f: (tx: T) => unknown) => unknown };
  avec.$transaction = (f) => f(avec);
  return avec;
}

function service(capture: { cree?: any; modifie?: any }, enregistre: Record<string, Date | null> = {}) {
  return new TiersService(
    avecTransaction({
      tenant: { findUnique: async () => ({ id: 'd1', referentiel: 'SYSCOHADA', dossierMereId: null }) },
      tiers: {
        findUnique: async () => null,
        findFirst: async () => ({
          id: 'ti1',
          tenantId: 'd1',
          dateEffetAutorisationDebits: null,
          dateRevocationAutorisationDebits: null,
          ...enregistre,
        }),
        create: async ({ data }: { data: unknown }) => {
          capture.cree = data;
          return data;
        },
        update: async (args: unknown) => {
          capture.modifie = args;
          return args;
        },
      },
    }) as unknown as PrismaService,
  );
}

const base = { code: 'F-1', nom: 'Gardiennage Kivu', type: TypeTiers.FOURNISSEUR, creerCompteIndividuel: false };

describe('fiche du tiers · période de l’autorisation aux débits', () => {
  it('à la création, les deux dates arrivent en base comme des dates', async () => {
    const capture: { cree?: any } = {};
    await service(capture).creer('d1', {
      ...base,
      autoriseTvaDebits: true,
      dateEffetAutorisationDebits: '2026-01-15',
      dateRevocationAutorisationDebits: '2026-09-01',
    });
    expect(capture.cree.dateEffetAutorisationDebits).toEqual(new Date('2026-01-15'));
    expect(capture.cree.dateRevocationAutorisationDebits).toEqual(new Date('2026-09-01'));
  });

  it('à la création, une révocation qui précède la date d’effet est refusée, sans rien écrire', async () => {
    const capture: { cree?: any } = {};
    await expect(
      service(capture).creer('d1', {
        ...base,
        autoriseTvaDebits: true,
        dateEffetAutorisationDebits: '2026-06-01',
        dateRevocationAutorisationDebits: '2026-05-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(capture.cree).toBeUndefined();
  });

  it('une révocation saisie SEULE se confronte à la date d’effet enregistrée', async () => {
    const capture: { modifie?: any } = {};
    await expect(
      service(capture, { dateEffetAutorisationDebits: new Date('2026-06-01') }).modifier('d1', 'ti1', {
        dateRevocationAutorisationDebits: '2026-05-01',
      }),
    ).rejects.toThrow('art. 63');
    expect(capture.modifie).toBeUndefined();
  });

  it('une date vide ou null s’efface, une date absente reste inchangée', async () => {
    const capture: { modifie?: any } = {};
    await service(capture).modifier('d1', 'ti1', { dateEffetAutorisationDebits: '', dateRevocationAutorisationDebits: null });
    expect(capture.modifie.data).toMatchObject({ dateEffetAutorisationDebits: null, dateRevocationAutorisationDebits: null });
    const autre: { modifie?: any } = {};
    await service(autre).modifier('d1', 'ti1', { nom: 'Autre' });
    expect('dateEffetAutorisationDebits' in autre.modifie.data).toBe(false);
  });

  it('un jour absent du calendrier est refusé, jamais reporté', async () => {
    await expect(
      service({}).modifier('d1', 'ti1', { dateEffetAutorisationDebits: '2026-02-30' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
