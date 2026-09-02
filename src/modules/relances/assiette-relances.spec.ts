import { Referentiel } from '@prisma/client';
import { RelancesService, RACINES_RELANCABLES } from './relances.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * CE QU'ON RELANCE, ET CE QU'ON NE RELANCE PAS.
 *
 * L'assiette était « toute la racine 41 ». En SYSCOHADA, l'AUDCIF subdivise
 * cette division bien plus finement que le SYCEBNL, et trois subdivisions
 * n'ont rien à réclamer : l'effet accepté en portefeuille (412) se présente à
 * l'échéance, l'effet escompté (415) est à la banque, et le produit à recevoir
 * (418) n'a pas encore été facturé.
 *
 * Ce n'est pas une erreur qui casse un total : c'est une lettre de rappel
 * envoyée à un client qui ne doit rien encore, ou qui a déjà signé son effet.
 * Le coût est commercial et il est réel · un tiers qui reçoit un rappel
 * injustifié cesse de lire les suivants.
 */

function service(referentiel: Referentiel) {
  const findMany = jest.fn().mockResolvedValue([]);
  const prisma = {
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel }) },
    ligneEcriture: { findMany },
    niveauRelance: { findMany: jest.fn().mockResolvedValue([]) },
    relance: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;
  return { svc: new RelancesService(prisma), findMany };
}

/** Les préfixes de compte réellement interrogés en base. */
async function racinesInterrogees(referentiel: Referentiel, racine?: string) {
  const { svc, findMany } = service(referentiel);
  await svc.positions('t1', { exerciceId: 'ex', racine });
  const ou = findMany.mock.calls[0][0].where.OR as { compte: { numero: { startsWith: string } } }[];
  return ou.map((c) => c.compte.numero.startsWith).sort();
}

describe('Assiette des rappels', () => {
  it('ne relance pas un effet accepté, un effet escompté ni un produit à recevoir (SYSCOHADA)', async () => {
    const racines = await racinesInterrogees(Referentiel.SYSCOHADA);
    expect(racines).toEqual(['411', '413', '416']);
    // Les trois exclusions, nommées pour que l'échec soit lisible :
    // 412 effets en portefeuille · 415 effets escomptés · 418 produits à
    // recevoir. Et 419, créditeur par nature, qui ne doit rien.
    for (const exclu of ['412', '415', '418', '419']) {
      expect(racines).not.toContain(exclu);
    }
  });

  it('relance les adhérents ET les clients-usagers en SYCEBNL', async () => {
    // Le 412 y est « Clients-usagers », une créance ordinaire · pas un effet.
    // Le même numéro, pas le même compte : c'est tout l'objet de la table.
    const racines = await racinesInterrogees(Referentiel.SYCEBNL);
    expect(racines).toEqual(['411', '412', '413', '416']);
    for (const exclu of ['418', '419']) {
      expect(racines).not.toContain(exclu);
    }
  });

  it('n’interroge JAMAIS la racine 41 entière, dans aucun référentiel', async () => {
    // C'était le défaut : un `startsWith('41')` ramasse 412, 415, 418 et 419
    // avec le reste.
    for (const r of [Referentiel.SYCEBNL, Referentiel.SYSCOHADA]) {
      expect(await racinesInterrogees(r)).not.toContain('41');
    }
  });

  it('obéit à la racine demandée explicitement · le relevé fournisseur', async () => {
    // Un appelant qui demande le 40 sait ce qu'il veut : on ne lui impose pas
    // l'assiette des clients.
    expect(await racinesInterrogees(Referentiel.SYSCOHADA, '40')).toEqual(['40']);
  });

  it('la table couvre les deux référentiels, sans trou', () => {
    expect(Object.keys(RACINES_RELANCABLES).sort()).toEqual(['SYCEBNL', 'SYSCOHADA']);
    for (const liste of Object.values(RACINES_RELANCABLES)) {
      expect(liste.length).toBeGreaterThan(0);
      expect(liste.every((r) => /^41\d$/.test(r))).toBe(true);
    }
  });
});
