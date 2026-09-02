import { BadRequestException } from '@nestjs/common';
import { TiersService } from './tiers.service';
import { PrismaService } from '../../common/prisma.service';
import { qualiteDuCompte } from '../relances/relances.service';
import { Referentiel, TypeTiers } from '@prisma/client';

/**
 * L'ADHÉRENT EST UNE NOTION DU SYCEBNL, ET ELLE FUITAIT VERS LE SYSCOHADA.
 *
 * Le compte 41 du SYCEBNL loge deux populations distinctes que l'entité ne
 * doit pas confondre · 411 Adhérents (les membres qui doivent leur cotisation)
 * et 412 Clients-usagers. Le plan SYSCOHADA n'en connaît qu'une : son 41 est
 * « Clients et comptes rattachés », 411 Clients, 412 Clients, effets à
 * recevoir en portefeuille.
 *
 * Deux conséquences, et le logiciel avait les deux : une entreprise se voyait
 * proposer un type de tiers « adhérent » qui n'existe pas chez elle, et on lui
 * indiquait de rattacher ses clients au 412, c'est-à-dire à un compte d'effets
 * à recevoir. Le refus est côté serveur autant que côté écran · masquer sans
 * refuser laisse la route ouverte à un appel direct (CLAUDE.md § 6).
 */

function service(referentiel: Referentiel, capture: { cree?: unknown } = {}) {
  return new TiersService({
    tenant: { findUniqueOrThrow: async () => ({ referentiel }) },
    tiers: {
      findUnique: async () => null,
      create: async ({ data }: { data: unknown }) => {
        capture.cree = data;
        return data;
      },
    },
  } as unknown as PrismaService);
}

const dto = { code: 'ADH-1', nom: 'Membre', type: TypeTiers.ADHERENT };

describe('type de tiers · adhérent réservé au SYCEBNL', () => {
  it('refuse un adhérent sur un dossier SYSCOHADA, sans rien écrire', async () => {
    const capture: { cree?: unknown } = {};
    await expect(service(Referentiel.SYSCOHADA, capture).creer('t1', dto)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service(Referentiel.SYSCOHADA).creer('t1', dto)).rejects.toThrow(/SYCEBNL/);
    expect(capture.cree).toBeUndefined();
  });

  it('accepte un adhérent sur un dossier SYCEBNL', async () => {
    const capture: { cree?: unknown } = {};
    await service(Referentiel.SYCEBNL, capture).creer('t1', dto);
    expect(capture.cree).toMatchObject({ type: TypeTiers.ADHERENT, tenantId: 't1' });
  });

  it('laisse passer les autres types dans les deux référentiels, sans lire le dossier', async () => {
    // Le contrôle ne doit pas coûter une requête de plus à chaque création :
    // il ne se déclenche que sur le type litigieux.
    const capture: { cree?: unknown } = {};
    const sansTenant = new TiersService({
      tiers: {
        findUnique: async () => null,
        create: async ({ data }: { data: unknown }) => {
          capture.cree = data;
          return data;
        },
      },
    } as unknown as PrismaService);
    await sansTenant.creer('t1', { code: 'CLI-1', nom: 'Client', type: TypeTiers.CLIENT });
    expect(capture.cree).toMatchObject({ type: TypeTiers.CLIENT });
  });
});

describe('qualité du compte 41 dans la liste des relances', () => {
  it('nomme un 411 selon le plan du dossier', () => {
    expect(qualiteDuCompte('41110000', Referentiel.SYCEBNL)).toBe('Adhérent');
    expect(qualiteDuCompte('41110000', Referentiel.SYSCOHADA)).toBe('Client');
  });

  it('ne présente pas un effet à recevoir comme un client-usager en retard', () => {
    // 412 : « Clients-usagers » en SYCEBNL, « Clients, effets à recevoir en
    // portefeuille » en SYSCOHADA. La liste annonçait « Client-usager » aux
    // deux, ce qui fait d'un effet en portefeuille un impayé.
    expect(qualiteDuCompte('41210000', Referentiel.SYCEBNL)).toBe('Client-usager');
    expect(qualiteDuCompte('41210000', Referentiel.SYSCOHADA)).toBe('Effet à recevoir');
  });

  it('nomme le client créditeur du plan SYSCOHADA, qui n’est pas un retard non plus', () => {
    expect(qualiteDuCompte('41910000', Referentiel.SYSCOHADA)).toBe('Client créditeur');
  });

  it('retombe sur « Tiers » pour tout autre compte', () => {
    expect(qualiteDuCompte('40110000', Referentiel.SYCEBNL)).toBe('Tiers');
    expect(qualiteDuCompte('47810000', Referentiel.SYSCOHADA)).toBe('Tiers');
  });
});
