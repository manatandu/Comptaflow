import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { EcritureService } from './ecriture.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * MISE EN SOMMEIL D'UN COMPTE · la saisie se CONFIRME. Jusqu'au 2026-09-25,
 * seul l'écran en tenait compte (liste des comptes actifs) · un appel direct
 * ou la modification d'une ancienne pièce passait sans un mot. La règle est
 * celle de Sage (« confirmation requise en saisie », skill sage-i7).
 */

const COMPTES = [
  { id: 'actif', numero: '60110000', estActif: true, tenantId: 't1' },
  { id: 'dort', numero: '62400000', estActif: false, tenantId: 't1' },
  { id: 'dortAilleurs', numero: '62500000', estActif: false, tenantId: 't2' },
];

// La doublure HONORE le filtre `estActif` et `tenantId` · une doublure qui
// rendrait tout ce qu'on lui donne validerait un filtre absent de la requête.
const prisma = {
  compte: {
    findMany: jest.fn(async ({ where }: { where: { id: { in: string[] }; tenantId: string; estActif: boolean } }) =>
      COMPTES.filter(
        (c) => where.id.in.includes(c.id) && c.tenantId === where.tenantId && c.estActif === where.estActif,
      ).map((c) => ({ numero: c.numero })),
    ),
  },
} as unknown as PrismaService;

const service = new EcritureService(prisma, {} as never, {} as never, {} as never);

describe('compte en sommeil · la saisie se confirme', () => {
  it('refuse sans confirmation, en nommant le compte', async () => {
    await expect(
      service.verifierComptesEnSommeil('t1', [{ compteId: 'actif' }, { compteId: 'dort' }], undefined),
    ).rejects.toThrow(new BadRequestException('Compte en sommeil : 62400000 · confirmez la saisie ou réactivez le compte dans le plan comptable.'));
  });

  it('laisse passer une fois la saisie confirmée', async () => {
    await expect(service.verifierComptesEnSommeil('t1', [{ compteId: 'dort' }], true)).resolves.toBeUndefined();
  });

  it('ne dit rien sur des comptes actifs, ni sur le compte endormi d’un autre dossier', async () => {
    await expect(service.verifierComptesEnSommeil('t1', [{ compteId: 'actif' }], undefined)).resolves.toBeUndefined();
    await expect(
      service.verifierComptesEnSommeil('t1', [{ compteId: 'dortAilleurs' }], undefined),
    ).resolves.toBeUndefined();
  });

  it('une modification sans lignes n’est pas concernée', async () => {
    await expect(service.verifierComptesEnSommeil('t1', undefined, undefined)).resolves.toBeUndefined();
  });

  // LE CÂBLAGE · les deux portes de SAISIE appellent la vérification. Elle
  // vit au contrôleur et non dans `creer`, que la clôture et les modules
  // appellent pour des écritures que personne ne saisit.
  const controleur = readFileSync(join(__dirname, 'ecriture.controller.ts'), 'utf8');

  it('POST et PATCH /ecritures vérifient avant d’écrire', () => {
    const appels = controleur.match(/verifierComptesEnSommeil\(user\.tenantId, dto\.lignes, dto\.confirmerComptesEnSommeil\)/g);
    expect(appels).toHaveLength(2);
  });

});
